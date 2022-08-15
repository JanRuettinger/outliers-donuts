import { Guild } from 'discord.js'
// import { Config } from '../configType'
// import { getDayOfWeekString } from '../utils/dayOfWeekTranslation'

/**
 * Create private channels with the paired users
 *
 * WARNING: Bot must have Administrator permissions to create channels
 * https://discordjs.guide/popular-topics/permissions-extended.html#limitations-and-oddities
 */
type createBotCommunicationChannelArgs = {
    guild: Guild
    botId: string
    BotChannelCategory: string
    BotCommunicationChannelName: string
}
export async function createBotCommunicationChannel({
    guild,
    botId,
    BotChannelCategory,
    BotCommunicationChannelName,
}: createBotCommunicationChannelArgs): Promise<string> {
    let channelCategory

    if (!guild) return ''
    // Get the category to place the channel under
    channelCategory = guild.channels.cache.find(
        (c) => c.type === 'GUILD_CATEGORY' && c.name === BotChannelCategory
    )

    if (!channelCategory) {
        channelCategory = await guild.channels.create(BotChannelCategory, {
            type: 'GUILD_CATEGORY',
        })

        console.log(channelCategory)
    }

    const channel = await guild.channels.create(BotCommunicationChannelName, {
        parent: channelCategory.id,
        position: 1,
        permissionOverwrites: [
            {
                id: botId,
                allow: ['SEND_MESSAGES', 'VIEW_CHANNEL'],
            },
            {
                id: guild.roles.everyone,
                deny: ['VIEW_CHANNEL'],
            },
        ],
    })

    return channel.id
}
