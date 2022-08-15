import { Guild } from 'discord.js'

type getParticipatingUserIDsArgs = {
    guild: Guild
    roles: string[]
    blacklist: string[]
}

export async function getParticipatingUserIDs({
    guild,
    roles,
    blacklist,
}: getParticipatingUserIDsArgs): Promise<Set<string>> {
    // get blacklist
    if (blacklist == null) {
        blacklist = []
    }

    if (!guild) return new Set<string>()
    try {
        await guild.members.fetch()
        const participatingUserIDs: Set<string> = new Set()
        for (const roleName of roles) {
            const roleData = guild.roles.cache.find(
                (role) => role.name == roleName
            )
            if (!roleData) continue
            const filteredUsersWithRole = roleData.members
                .filter((m) => !blacklist.includes(m.user.username))
                .map((m) => m.user.id)
            for (const user of filteredUsersWithRole) {
                participatingUserIDs.add(user)
            }
        }

        return participatingUserIDs
    } catch (err) {
        console.error(err)
    }
    return new Set<string>()
}
