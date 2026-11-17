# Leveling system

## Commands (slash **and** prefix, default prefix `a!`)

| Command | Prefix example | Who |
| --- | --- | --- |
| `/rank [user]` | `a!rank`, `a!rank @user`, `a!xp`, `a!lvl` | everyone |
| `/leaderboard [page]` | `a!lb`, `a!lb 2`, `a!top` | everyone |
| `/leveladd user levels` | `a!leveladd @user 5` (`a!ladd`) | Manage Server |
| `/levelremove user levels` | `a!levelremove @user 2` (`a!lremove`) | Manage Server |
| `/levelset user level` | `a!levelset @user 10` (`a!lset`) | Manage Server |
| `/level setup` | `a!level setup #channel` | Manage Server |
| `/level dashboard` | slash only | Manage Server |
| `/prefix [new_prefix\|reset]` | `a!prefix`, `a!prefix !` | view: everyone, change: Manage Server |

Messages that are bot commands never earn XP.

## Level-up message placeholders
`{user}` `{username}` `{level}` `{oldLevel}` `{xp}` `{xpNeeded}` `{totalXp}` `{server}`

## Settings (all in `/level dashboard`)
- Announcement style: **embed** (progress bar, reward info) or **plain text**
- Reward mode: **stack** (keep every role) or **replace** (only the highest)
- Channel, XP range, cooldown, role rewards (levels 1-1000), ignored channels/roles

## Code layout (`src/services/leveling/`)
- `levelMath.js` – pure XP/level math (curve unchanged, so old data stays valid)
- `levelConfig.js` – defaults, config normalisation, message templating
- `leveling.js` – storage, leaderboard (cached), admin add/remove/set
- `levelRoles.js` – the one place that grants/removes reward roles
- `xpSystem.js` – message XP, level-ups, announcements
- `levelEmbeds.js` – every leveling embed
- `levelAdminCommand.js` – shared flow for leveladd/levelremove/levelset
