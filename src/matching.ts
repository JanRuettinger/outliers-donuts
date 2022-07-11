import { Guild } from 'discord.js'
import { Collection } from 'mongodb'
import { Config } from '../config/configType'
import {
    createPrivateChannels,
    deleteMatchingChannels,
} from './discord/matchingChannels'
import { getParticipatingUserIDs } from './discord/participatingUserIDs'
import {
    getHistoricalPairs,
    setHistoricalPairs,
} from './mongoDB/historicalPairs'
import { fischerYatesShuffle } from './utils/fischerYatesShuffle'
import { getCurrentDateFormatted } from './utils/getCurrentDateFormatted'

type matchingHelperArgs = {
    participatingUserIDs: Set<string>
    historicalPairs: { [userId: string]: Set<string> }
}
export function matchingHelper({
    participatingUserIDs,
    historicalPairs,
}: matchingHelperArgs) {
    // Can use simple data below for basic testing until getParticipatingUserIDs() is implemented
    // let participatingUserIDs = ['0', '1', '2', '3', '4', '5']
    // let historicalPairs = {
    //     2: new Set('3'),
    //     3: new Set('2'),
    // }
    const newGroups: [string[]] = [] as unknown as [string[]]
    // Convert set to an array to allow for shuffling
    let unpairedUserIDs = Array.from(participatingUserIDs)
    unpairedUserIDs = fischerYatesShuffle(unpairedUserIDs)
    // Keep track of users that have been paired
    const pairedUsersStatus = new Array(unpairedUserIDs.length).fill(false)
    for (let i = 0; i < unpairedUserIDs.length; i++) {
        if (pairedUsersStatus[i]) {
            // The user has been paired already
            continue
        }

        // This is the user for which we will try to find a pair
        const userID = unpairedUserIDs[i]

        // Get all other users that are unpaired
        const filteredUnpairedIDs = unpairedUserIDs.filter(
            (id, index) => id !== userID && !pairedUsersStatus[index]
        )

        // Keep track of the ID to pair the user with (either fall-back or successful pairing of users that have not met)
        let newPairingID: string

        // If there are only 2 or 3 people left, there exists only one possible pairing
        if (
            filteredUnpairedIDs.length === 2 ||
            filteredUnpairedIDs.length === 1
        ) {
            newGroups.push([userID, ...filteredUnpairedIDs])
            break
        }

        // Fall-back pairing
        newPairingID = filteredUnpairedIDs[0]

        // User's previous pairs
        const userHistoricalPairs = historicalPairs[userID]
        // Attempt to pair users who have not met
        for (const potentialPairingID of filteredUnpairedIDs) {
            // Check to see if the users have met before
            if (
                userHistoricalPairs &&
                userHistoricalPairs.has(potentialPairingID)
            ) {
                continue
            } else {
                // The pair has not met yet so assign them together
                newPairingID = potentialPairingID
                break
            }
        }
        newGroups.push([userID, newPairingID])

        // Mark the users as paired
        pairedUsersStatus[i] = true
        pairedUsersStatus[unpairedUserIDs.indexOf(newPairingID)] = true
    }

    return newGroups
}

/**
 * Constructs new groups based on historical pairs
 * https://lifeat.tails.com/how-we-made-bagelbot/
 *
 * @returns {Promise<[string[]]>} New groups of the form [[user_1_ID, user_2_ID], [user_3_ID, user_4_ID], ...]
 */
type getNewGroupsArgs = {
    guild: Guild
    config: Config
    roles: string[]
    collection: Collection
}
export async function getNewGroups({
    guild,
    config,
    roles,
    collection,
}: getNewGroupsArgs): Promise<[string[]]> {
    const participatingUserIDs = await getParticipatingUserIDs({
        config,
        guild,
        roles,
    })
    const historicalPairs = await getHistoricalPairs({
        userIDs: participatingUserIDs,
        collection,
    })
    // Can use simple data below for basic testing until getParticipatingUserIDs() is implemented
    // let participatingUserIDs = ['0', '1', '2', '3', '4', '5']
    // let historicalPairs = {
    //     2: new Set('3'),
    //     3: new Set('2'),
    // }
    const newGroups: [string[]] = [] as unknown as [string[]]
    // Convert set to an array to allow for shuffling
    let unpairedUserIDs = Array.from(participatingUserIDs)
    unpairedUserIDs = fischerYatesShuffle(unpairedUserIDs)
    // Keep track of users that have been paired
    const pairedUsersStatus = new Array(unpairedUserIDs.length).fill(false)
    for (let i = 0; i < unpairedUserIDs.length; i++) {
        if (pairedUsersStatus[i]) {
            // The user has been paired already
            continue
        }

        // This is the user for which we will try to find a pair
        const userID = unpairedUserIDs[i]

        // Get all other users that are unpaired
        const filteredUnpairedIDs = unpairedUserIDs.filter(
            (id, index) => id !== userID && !pairedUsersStatus[index]
        )

        // Keep track of the ID to pair the user with (either fall-back or successful pairing of users that have not met)
        let newPairingID: string

        // If there are only 2 or 3 people left, there exists only one possible pairing
        if (
            filteredUnpairedIDs.length === 2 ||
            filteredUnpairedIDs.length === 1
        ) {
            newGroups.push([userID, ...filteredUnpairedIDs])
            break
        }

        // Fall-back pairing
        newPairingID = filteredUnpairedIDs[0]

        // User's previous pairs
        const userHistoricalPairs = historicalPairs[userID]
        // Attempt to pair users who have not met
        for (const potentialPairingID of filteredUnpairedIDs) {
            // Check to see if the users have met before
            if (
                userHistoricalPairs &&
                userHistoricalPairs.has(potentialPairingID)
            ) {
                continue
            } else {
                // The pair has not met yet so assign them together
                newPairingID = potentialPairingID
                break
            }
        }
        newGroups.push([userID, newPairingID])

        // Mark the users as paired
        pairedUsersStatus[i] = true
        pairedUsersStatus[unpairedUserIDs.indexOf(newPairingID)] = true
    }

    return newGroups
}

/**
 * Helper function to match users
 *
 * @returns {Promise<void>}
 */
type matchUsersArgs = {
    guild: Guild
    config: Config
    roles: string[]
    collection: Collection
    interval: number
}
export async function matchUsers({
    guild,
    config,
    roles,
    collection,
    interval,
}: matchUsersArgs): Promise<void> {
    console.log(
        `### START NEXT MATCHING ROUND ${getCurrentDateFormatted()} ###`
    )
    const groups = await getNewGroups({
        guild,
        config,
        collection,
        roles,
    })
    console.log('Groups: ')
    console.log(groups)
    await setHistoricalPairs({
        collection,
        pairs: groups,
    })
    await deleteMatchingChannels({
        guild,
        config,
    })
    await createPrivateChannels({
        guild,
        config,
        interval,
        userIDGroups: groups,
    })
}
