import { SupabaseClient } from '@supabase/supabase-js'
import type { Matches } from './types'
import { v4 as uuidv4 } from 'uuid'

/**
* Get all users' historical pairs
@param {Set<string>} userIDs
@returns {Promise<{[userId: string]: Set<string[]>}>} Object with data on each user's previous pairs
*
*/
type getHistoricalPairsArgs = {
    userIDs: Set<string>
    supabase: SupabaseClient
}
export async function getHistoricalPairs({
    userIDs,
    supabase,
}: getHistoricalPairsArgs): Promise<{ [userId: string]: Set<string> }> {
    console.log(userIDs)
    const pairs = {}
    for (const userID of userIDs) {
        pairs[userID] = new Set()

        // await supabaseClient.from<Post>('posts').select('*') //...
        // const { data, error } = await supabase.from('cities').select('name, country_id').or('id.eq.20,id.eq.30')
        const query = 'user1_id.eq.' + { userID } + 'user2_id.eq.' + { userID }
        const { data, error } = await supabase
            .from<Matches>('matches')
            .select('*')
            .or(query)

        if (error) {
            console.log('Error while fetching historical pairs.')
            console.log(error)
            throw error
        }

        if (data != null && data.length > 0) {
            for (const match of data) {
                if (match.user1_id.toString() == userID) {
                    pairs[userID].add(match.user2_id.toString)
                } else {
                    pairs[userID].add(match.user1_id.toString())
                }
            }
        }
    }
    return pairs
}

/**
 * Store historical pairs in db
 *
 * @param {Promise<void>} pairs
 */
type setHistoricalPairsArgs = {
    pairs: [string[]]
    guildID: string
    supabase: SupabaseClient
}
export async function setHistoricalPairs({
    pairs,
    guildID,
    supabase,
}: setHistoricalPairsArgs): Promise<void> {
    const numLatestMatchingRound = await getLatestMatchingRound(
        supabase,
        guildID
    )
    for (const pair of pairs) {
        const obj: Matches = {
            id: uuidv4(),
            guild_id: guildID,
            user1_id: pair[0],
            user2_id: pair[1],
            created_at: new Date().toUTCString(),
            matching_round: numLatestMatchingRound + 1,
        }
        const { error } = await supabase.from<Matches>('matches').insert(obj)

        if (error) {
            console.log('Error while writing match obj to database: ', obj)
            console.log(error)
            throw error
        }
    }
    return
}

/**
 * Get latest matching round
 *
 * @param {SupabaseClient} supabase
 * @param {string} guildID
 * @returns {Promise<number>} latestMatchingRound
 *
 */

export async function getLatestMatchingRound(
    supabase: SupabaseClient,
    guildID: string
): Promise<number> {
    // const doc = await collection
    //     .find({})
    //     .sort({ matching_round: -1 })
    //     .limit(1)
    //     .toArray()
    // if (doc.length > 0 && doc[0]['matching_round']) {
    //     const latestMatchingRound = doc[0]['matching_round']
    //     console.log('Latest matching round: ', latestMatchingRound)
    //     return latestMatchingRound
    // } else {
    //     console.log(
    //         'No entries in database. Set latest matching round to 0.'
    //     )
    //     return 0
    // }

    const { data, error } = await supabase
        .from<Matches>('matches')
        .select('matching_round')
        .eq('guild_id', guildID)
        .order('matching_round', { ascending: false })
        .limit(1)

    if (error) {
        console.log('Error getting the latest matching round.')
        console.log(error)
        throw error
    }

    if (data != null && data.length > 0) {
        return data[0].matching_round
    } else {
        return 0
    }
}
