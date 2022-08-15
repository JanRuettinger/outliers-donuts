import { Guild, OverwriteResolvable, Permissions } from 'discord.js'
import { Config } from '../configType'
import { Guilds } from '../database/types'
import { getDayOfWeekString } from '../utils/dayOfWeekTranslation'

/**
 * Create private channels with the paired users
 *
 * WARNING: Bot must have Administrator permissions to create channels
 * https://discordjs.guide/popular-topics/permissions-extended.html#limitations-and-oddities
 */
type createPrivateChannelsArgs = {
    botId: string
    userIDGroups: [string[]]
    guild: Guild
    botChannelsCategoryName: string
    matchingChannelName: string
    dayOfWeek: number
}
export async function createPrivateChannels({
    botId,
    userIDGroups,
    guild,
    botChannelsCategoryName,
    matchingChannelName,
    dayOfWeek,
}: createPrivateChannelsArgs): Promise<void> {
    if (!guild) return
    // Get the category to place the channel under
    const channelCategory = guild.channels.cache.find(
        (c) => c.type === 'GUILD_CATEGORY' && c.name === botChannelsCategoryName
    )

    if (!channelCategory) throw Error('Matching category not found in Guild')

    // Iterate over userID pairings and create DM group
    for (const userIDPair of userIDGroups) {
        // Construct permission overwrite for each user in the pair
        const userPermissionOverWrites: OverwriteResolvable[] = userIDPair.map(
            (userID) => {
                return {
                    type: 'member',
                    id: userID,
                    allow: ['SEND_MESSAGES', 'VIEW_CHANNEL'],
                }
            }
        )
        // Create private channel
        try {
            const channel = await guild.channels.create(matchingChannelName, {
                parent: channelCategory.id,
                permissionOverwrites: [
                    {
                        id: botId,
                        allow: ['SEND_MESSAGES', 'VIEW_CHANNEL'],
                    },
                    {
                        id: guild.roles.everyone,
                        deny: ['VIEW_CHANNEL'],
                    },
                    // Add the overwrites for the pair of users
                    ...userPermissionOverWrites,
                ],
            })
            const userIDTag = userIDPair
                .map((userID) => `<@${userID}>`)
                .join(' ')
            channel.send(`Hey ${userIDTag} 👋,
            You have been matched!
            Schedule a call, go for a walk or do whatever else.
            The channel will automatically be closed next ${getDayOfWeekString(
                dayOfWeek
            )}.
                  `)
        } catch (error) {
            console.log('error creating channel:', error)
            // console.log(error.requestData.permission_overwrites)
        }
    }
}

/**
 * Helper function to delete all private channels
 *
 * @returns {Promise<void>}
 */
type deleteMatchingChannelsArgs = {
    guild: Guild
    botMachingChannelName: string
}
export async function deleteMatchingChannels({
    guild,
    botMachingChannelName,
}: deleteMatchingChannelsArgs): Promise<void> {
    const matchingChannels = guild.channels.cache.filter(
        (channel) => channel.name === botMachingChannelName
    )
    const matchingChannelsArray = Array.from(matchingChannels.values())
    for (let i = 0; i < matchingChannelsArray.length; i++) {
        await matchingChannelsArray[i].delete()
    }
}
