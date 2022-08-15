import { Client, Intents, Guild, TextChannel } from 'discord.js'
import cron, { CronJob } from 'cron'
import { createClient } from '@supabase/supabase-js'

import { getNewGroups, matchUsers } from './matching'
import {
    createPrivateChannels,
    deleteMatchingChannels,
} from './discord/matchingChannels'
import getCronJob from './cron/cronJob'
import { getDayOfWeekString } from './utils/dayOfWeekTranslation'
import { getMatchingTimeFormatted } from './utils/getMatchingTimeFormatted'
import { createBotCommunicationChannel } from './discord/onboarding'
import { Config } from './configType'
import type { Guilds } from './database/types'
require('dotenv').config({ path: `.env.${process.env.NODE_ENV}` })

const config: Config = {
    prefix: process.env.COMMAND_PREFIX as string,
    supabaseApiUrl: process.env.SUPABASE_API_URL as string,
    supabaseApiKey: process.env.SUPABASE_API_KEY as string,
    discordBotToken: process.env.DISCORD_BOT_TOKEN as string,
}

const client = new Client({
    intents: [
        Intents.FLAGS.GUILDS, // Required to interact with guild
        Intents.FLAGS.GUILD_MESSAGES, // Required to listent to messages
        Intents.FLAGS.GUILD_MEMBERS, // Required to fetch members when creating channels
    ],
})

const supabase = createClient(config.supabaseApiUrl, config.supabaseApiKey)
const BOT_CHANNEL_CATEGORY_NAME = 'Matching-Bot-Philotes'
const BOT_COMMUNICATION_CHANNEL_NAME = 'Matching-Bot-Communication'
const BOT_MATCHING_CHANNEL_NAME = 'matches'

const botStatus = 'init'
// Default to Tuesday, note days are 0 indexed (Sunday = 0)
const dayOfWeek = 2
// Default to 11 which is 11:00 UTC, 7:00 EST, :00 PST
// const hour = 11
// // Default to 00
// const minute = 0

// Wait to initialize cron job until we want it to run
// let matchingJob: cron.CronJob | undefined
const groupSize = 2
let botId: string

// function getCronJobHelper(guild: Guild): CronJob {
//     return getCronJob({
//         callbackFunction: () =>
//             matchUsers({
//                 guild,
//                 supabase,
//                 config,
//                 dayOfWeek,
//                 roles,
//             }),
//         dayOfWeek,
//         hour,
//         minute,
//     })
// }

client.on('ready', async () => {
    console.log(`Logged in as ${client.user?.tag}!`)
    if (client.user) {
        botId = client.user.id
    }
})

client.on('guildCreate', async (guild) => {
    if (!client) return

    // Check if guild has signed up before (aka if guild is in database)
    const { data, error: errorFetchGuild } = await supabase
        .from<Guilds>('guilds')
        .select()
        .eq('guild_id', guild.id)

    if (errorFetchGuild) {
        console.log(
            'Error when making supabase request to fetch guild. Supabase is most likely not available:',
            errorFetchGuild
        )
        return
    }

    const channelId = await createBotCommunicationChannel({
        guild,
        botId,
        BotChannelCategory: BOT_CHANNEL_CATEGORY_NAME,
        BotCommunicationChannelName: BOT_COMMUNICATION_CHANNEL_NAME,
    })

    if (data && data.length == 0) {
        // Guild is not in database
        const { error: errorInsertGuild } = await supabase
            .from<Guilds>('guilds')
            .insert({
                guild_id: guild.id,
                bot_communication_channel_id: channelId,
                active: true,
            })

        if (errorInsertGuild) {
            console.log(
                'Error when making supabase request to create a new guild. Supabase is most likely not available: ',
                errorInsertGuild
            )
            return
        }
    } else {
        // Guild already exists in supabase (bot was created and kicked out again)
        // set status active to true and bot_communication_id to new channel
        const { error: errorUpdateGuild } = await supabase
            .from<Guilds>('guilds')
            .update({ active: true, bot_communication_channel_id: channelId })
            .eq('guild_id', guild.id)

        if (errorUpdateGuild) {
            console.log(
                'Error when making supabase request to create a new guild. Supabase is most likely not available: ',
                errorUpdateGuild
            )
            return
        }
        const BotChannel = client.channels.cache.get(channelId) as TextChannel
        BotChannel.send(
            `Hey 👋, glad to have you back. PLease delete the old channel to avoid confusion for users communicating with the bot. The old won't work anymore.`
        )
    }

    // Fetch guild and continue normal onboarding flow
    const { data: dataAfterOnboarding, error: errorAfterOnboarding } =
        await supabase
            .from<Guilds>('guilds')
            .select()
            .eq('guild_id', guild.id)
            .limit(1)

    if (errorAfterOnboarding) {
        console.log(
            'Error when making supabase request after guild onboarding. Supabase is most likely not available: ',
            errorAfterOnboarding
        )
        return
    }

    // Continue normal onboarding flow

    if (dataAfterOnboarding && dataAfterOnboarding.length > 0) {
        const guildData = dataAfterOnboarding[0]
        // 2. Text: This is how the bot works
        // 3. Text: Invite new members to the channel to be able to control the bot
        // 4. Text: Before you begin: set a matching role
        // 5. Text: You can always ask for help /help or check the current status of the bot /status

        const BotChannel = client.channels.cache.get(
            guildData.bot_communication_channel_id
        ) as TextChannel

        BotChannel.send(
            `Hey 👋, This is the channel to communicate with the bot communications bot. 
            Options <>
            BlaBla`
        )
        BotChannel.send(
            `As a first step please set a matching role with the command: /setRole <Role>.`
        )
        BotChannel.send(
            `All users who have that role will be included in the next matching round.`
        )
    }
})

client.on('messageCreate', async (message) => {
    const guild = client.guilds.cache.get(message.guildId || '')
    // Typescript typeguard
    if (!guild) {
        return
    }

    const { data, error } = await supabase
        .from<Guilds>('guilds')
        .select()
        .eq('guild_id', message.guildId as string)

    let guildData: Guilds
    if (data && error == null && data.length > 0) {
        guildData = data[0]
        console.log(guildData)
    } else {
        console.log(
            'Guild with ID (message.guildid): ',
            message.guildId,
            "couldn't be found in supabase."
        )
        return
    }

    // if the author is another bot OR the command is not in the bot communications channel OR the command doesn't start with the correct prefix => ignore
    if (
        message.author.bot ||
        message.channelId !== guildData.bot_communication_channel_id ||
        message.content.indexOf(config.prefix) !== 0
    )
        return

    // extract command and arguments from message
    const input = message.content
        .slice(config.prefix.length)
        .trim()
        .split(/ +/g)
    const command = input.shift()
    const args = input.join(' ')

    // log command and arg on console (for debugging)
    console.log('Command: ', command)
    console.log('Args: ', args)

    if (command === 'alive') {
        await message.channel.send('Alive')
    }

    if (command === 'help') {
        console.log('---help---')
        await message.channel.send('Available commands:')
        await message.channel.send(
            '/setRoles <name of role1> <name of role2> <name of role3> ... => members of which role should be included in the matching process'
        )
        await message.channel.send('/status => get current status of the bot')
        await message.channel.send('/pause => pause bot')
        await message.channel.send('/resume or /start => resume or start bot')
        await message.channel.send(
            '/matchOnce => deletes previous matches and creates new matches'
        )
        await message.channel.send(
            `/deleteChannels => deletes all channels under ${BOT_CHANNEL_CATEGORY_NAME} except the channel to communicate with the bot.`
        )
        await message.channel.send(
            '/setDayOfWeek <day of week 0-6> => what day of the week (Sunday-Saturday) the matching process should be triggered'
        )
        await message.channel.send(
            '/setHour <hour 0-23> => what hour (0-23) the matching process should be triggered'
        )
        await message.channel.send(
            '/setMinute <minute 0-59> => what minute (0-59) the matching process should be triggered'
        )

        // Commented out to only show commands helpful for manual matches
        // await message.channel.send(
        //     '/setInterval <int> => how often (in days) should the matching process be triggered'
        // )
        // await message.channel.send(
        //     '/setGroupSize <int> => how many members should be included in one matching group'
        // )
        // await message.channel.send('/alive => check if bot is still alive')
        // await message.channel.send(
        //     '/nextDate => get date of the next round of matching'
        // )
    }

    if (command === 'status') {
        await message.channel.send(`Status: ${botStatus}`)
        await message.channel.send(
            `Roles: ${JSON.stringify(guildData.matching_roles)}`
        )
        await message.channel.send(
            `Blacklist: ${JSON.stringify(guildData.blacklist)}`
        )
        // await message.channel.send(
        //     `Day of Week: ${getDayOfWeekString(dayOfWeek)}`
        // )
        // const timeFormatted = hour + ':' + String(minute).padStart(2, '0')
        // await message.channel.send(`Time: ${timeFormatted}`)
        await message.channel.send(`GroupSize: ${groupSize}`)
    }

    if (command === 'setRoles') {
        const roles = args.split(',')
        const { error } = await supabase
            .from<Guilds>('guilds')
            .update({ matching_roles: roles })
            .eq('guild_id', guild.id)
        if (error) {
            console.log(
                'Error updating roles of guild: ',
                guild.id,
                'in supabase.',
                error
            )
        } else {
            message.reply(`New Roles: ${roles}`)
        }
    }

    if (command === 'setBlacklist') {
        const blacklist = guildData.blacklist
        message.reply(`Old Blacklist: ${JSON.stringify(blacklist)} `)
        const blacklistedMembers = args.split(',')
        const { error } = await supabase
            .from<Guilds>('guilds')
            .update({ blacklist: blacklistedMembers })
            .eq('guild_id', guild.id)
        if (error) {
            console.log(
                'Error updating blacklist of guild: ',
                guild.id,
                'in supabase.',
                error
            )
        } else {
            message.reply(`New Blacklist: ${blacklistedMembers}`)
        }
    }

    if (command === 'deleteChannels') {
        deleteMatchingChannels({
            guild,
            botMachingChannelName: BOT_MATCHING_CHANNEL_NAME,
        })
        message.reply(`Channels deleted.`)
    }

    if (command === 'matchOnce') {
        const roles = guildData.matching_roles as string[]
        const blacklist = guildData.blacklist as string[]
        // check if roles are set
        if (guildData.matching_roles && guildData.matching_roles.length > 0) {
            await matchUsers({
                botId,
                guild,
                roles,
                blacklist,
                matchingChannelName: BOT_MATCHING_CHANNEL_NAME,
                botChannelsCategoryName: BOT_CHANNEL_CATEGORY_NAME,
                supabase,
                dayOfWeek,
            })
            await message.channel.send(`Deleted previous matched channels! ✅`)
            await message.channel.send(`New matches created! ✅`)
            await message.channel.send(`---⚡🦎---`)
        } else {
            await message.channel.send(
                'Matching role is not set. Please do ...'
            )
        }
    }

    // if (command === 'testMatch') {
    //     const groups = await getNewGroups({ guild, config, roles, supabase })
    //     console.log('Groups: ')
    //     console.log(groups)
    //     deleteMatchingChannels({ guild, config })
    //     // Don't impact database
    //     // setHistoricalPairs({ collection, pairs: groups })
    //     createPrivateChannels({
    //         guild,
    //         config,
    //         dayOfWeek,
    //         userIDGroups: groups,
    //     })
    // }

    // if (command === 'setGroupSize') {
    //     groupSize = Number(args[0])
    //     message.reply(`New group size: ${groupSize}`)
    // }

    // if (command === 'datesForMonth') {
    //     if (!matchingJob) {
    //         message.reply('No matching job running')
    //         return
    //     }

    // if (command === 'pause') {
    //     botStatus = 'paused'
    //     await message.channel.send(`New status: ${botStatus}`)
    //     if (matchingJob) {
    //         matchingJob.stop()
    //     }
    // }

    // if (command === 'resume' || command === 'start') {
    //     botStatus = 'active'
    //     await message.channel.send(`New status: ${botStatus}`)

    //     // Check to see if roles are set
    //     if (roles.length === 0) {
    //         await message.channel.send(
    //             'No roles have been set, so no matches will be made. Run "/setRoles <name of role1> <name of role2> <name of role3> ..." to set roles'
    //         )
    //         return
    //     }

    //     if (command === 'start') {
    //         // Run once immediately
    //         await matchUsers({
    //             guild,
    //             config,
    //             supabase,
    //             dayOfWeek,
    //             roles,
    //         })
    //     }

    //     if (!matchingJob) {
    //         matchingJob = getCronJobHelper(guild)
    //     }
    //     matchingJob.start()
    //     console.log('---nextDates---')
    //     console.log(Object.keys(matchingJob))
    //     // console.log(matchingJob.nextDates())
    // }

    //     const datesObj = matchingJob
    //     const { dayOfMonth } = datesObj.cronTime
    //     console.log(matchingJob)
    //     let datesArray = Object.keys(dayOfMonth).map((date) => {
    //         if (dayOfMonth[date] && Number(date) >= new Date().getDate()) {
    //             return `${new Date().getMonth() + 1}/${date}`
    //         } else {
    //             return null
    //         }
    //     })
    //     datesArray = datesArray.filter((date) => date !== null)
    //     console.log(datesArray)
    //     message.reply(datesArray.join('\n'))
    // }

    // if (command === 'nextDate') {
    //     if (matchingJob) {
    //         console.log(matchingJob.nextDate().toISODate())
    //         message.reply(matchingJob.nextDate().toISODate())
    //     }
    // }

    // if (command === 'setDayOfWeek') {
    //     const newDayOfWeek = isNaN(Number(args)) ? -1 : Number(args)
    //     if (newDayOfWeek < 0 || newDayOfWeek > 6) {
    //         message.reply('Day of Week must be between 0-6, inclusive')
    //         return
    //     }
    //     dayOfWeek = newDayOfWeek

    //     if (matchingJob) {
    //         matchingJob.stop()
    //         matchingJob = getCronJobHelper(guild)
    //         matchingJob.start()
    //         message.reply('Matching time updated for upcoming round')
    //     }

    //     message.reply(getMatchingTimeFormatted({ dayOfWeek, hour, minute }))
    // }

    // if (command === 'setHour') {
    //     const newHour = isNaN(Number(args)) ? -1 : Number(args)
    //     if (newHour < 0 || newHour > 23) {
    //         message.reply('Hour must be between 0-23, inclusive')
    //         return
    //     }
    //     hour = newHour

    //     if (matchingJob) {
    //         matchingJob.stop()
    //         matchingJob = getCronJobHelper(guild)
    //         matchingJob.start()
    //         message.reply('Matching time updated for upcoming round.')
    //     }

    //     message.reply(getMatchingTimeFormatted({ dayOfWeek, hour, minute }))
    // }

    // if (command === 'setMinute') {
    //     const newMinute = isNaN(Number(args)) ? -1 : Number(args)
    //     if (newMinute < 0 || newMinute > 59) {
    //         message.reply('Minute must be between 0-59, inclusive')
    //         return
    //     }
    //     minute = newMinute

    //     if (matchingJob) {
    //         matchingJob.stop()
    //         matchingJob = getCronJobHelper(guild)
    //         matchingJob.start()
    //         message.reply('Matching time updated for upcoming round.')
    //     }

    //     message.reply(getMatchingTimeFormatted({ dayOfWeek, hour, minute }))
    // }
})

client.login(config.discordBotToken)
