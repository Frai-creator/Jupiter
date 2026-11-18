// greetService.js
// Builds and sends the welcome / goodbye messages (embed + canvas card).

import { AttachmentBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getColor, botConfig } from '../config/bot.js';
import { formatWelcomeMessage, formatDuration, ordinal } from '../utils/welcome.js';
import { renderGreetCard, resolveTheme, CARD_THEMES } from '../utils/welcomeCard.js';
import { logger } from '../utils/logger.js';

// Titles that older versions saved as the default; treated as "not customised" so they pick up the new look.
const LEGACY_DEFAULT_TITLES = new Set(['🎉 Welcome!', '👋 Goodbye']);

const CARD_DEFAULTS = {
    welcome: { enabled: true, theme: 'aurora', title: 'WELCOME', subtitle: 'to {server}' },
    goodbye: { enabled: true, theme: 'sunset', title: 'GOODBYE', subtitle: 'Thanks for being part of {server}' },
};

function pickImageUrl(value) {
    if (!value) return null;
    if (typeof value === 'string') return value;
    return value.url || null;
}

export function getCardSettings(cfg, kind) {
    const raw = (kind === 'goodbye' ? cfg?.leaveCard : cfg?.welcomeCard) || {};
    const def = CARD_DEFAULTS[kind];
    return {
        enabled: raw.enabled !== false,
        theme: resolveTheme(raw.theme, def.theme),
        title: (raw.title || def.title),
        subtitle: (raw.subtitle ?? def.subtitle),
    };
}

function backgroundUrl(cfg, kind) {
    return kind === 'goodbye'
        ? pickImageUrl(cfg?.leaveEmbed?.image)
        : (cfg?.welcomeImage || pickImageUrl(cfg?.welcomeEmbed?.image));
}

function intColor(hex) {
    return parseInt(String(hex).replace('#', ''), 16);
}

/**
 * Builds the message payload (content, embeds, files, allowedMentions) for a welcome or goodbye.
 * Never throws because of the card: if rendering fails the embed is sent without the image.
 */
export async function buildGreetPayload(kind, member, cfg, opts = {}) {
    const { canEmbed = true, canAttach = true, preview = false } = opts;
    const isGoodbye = kind === 'goodbye';
    const user = member.user ?? member;
    const guild = member.guild;
    const data = { user, guild, member };

    const card = getCardSettings(cfg, kind);
    const theme = CARD_THEMES[card.theme];
    const embedCfg = (isGoodbye ? cfg.leaveEmbed : cfg.welcomeEmbed) || {};
    const ping = isGoodbye ? Boolean(cfg.goodbyePing) : Boolean(cfg.welcomePing);

    const message = formatWelcomeMessage(
        (isGoodbye
            ? (cfg.leaveMessage || embedCfg.description || botConfig.welcome?.defaultGoodbyeMessage)
            : (cfg.welcomeMessage || embedCfg.description || botConfig.welcome?.defaultWelcomeMessage))
            || (isGoodbye ? '{user.tag} has left the server.' : 'Welcome {user} to {server}!'),
        data,
    );

    const memberCount = guild?.memberCount ?? 0;
    const createdTs = user.createdTimestamp ?? null;
    const joinedTs = member.joinedTimestamp ?? null;
    const displayName = member.displayName || user.displayName || user.username || 'Unknown';

    // ── canvas card ──
    const fileName = `${kind}-card.png`;
    const files = [];
    if (card.enabled && canAttach) {
        try {
            const chips = isGoodbye
                ? [`Members now ${memberCount.toLocaleString('en-US')}`, joinedTs ? `With us ${formatDuration(Date.now() - joinedTs)}` : null]
                : [`Member #${memberCount.toLocaleString('en-US')}`, createdTs ? `Account ${formatDuration(Date.now() - createdTs)} old` : null];

            const png = await renderGreetCard({
                kind,
                username: displayName,
                avatarUrl: user.displayAvatarURL({ extension: 'png', size: 512, forceStatic: true }),
                title: formatWelcomeMessage(card.title, data),
                subtitle: formatWelcomeMessage(card.subtitle || '', data),
                chips,
                theme: card.theme,
                backgroundUrl: backgroundUrl(cfg, kind),
                seed: user.id,
            });
            files.push(new AttachmentBuilder(png, { name: fileName }));
        } catch (error) {
            logger.warn(`[Greet] Failed to render ${kind} card: ${error.message}`);
        }
    }
    const hasCard = files.length > 0;

    // ── mentions ──
    const mention = user.toString();
    const allowedMentions = !preview && ping ? { users: [user.id] } : { parse: [] };
    const pingText = !preview && ping ? mention : undefined;

    // No EmbedLinks permission: plain text (+ card if we are allowed to attach one).
    if (!canEmbed) {
        return {
            content: [pingText && !message.includes(mention) ? pingText : null, message].filter(Boolean).join(' '),
            files,
            allowedMentions,
        };
    }

    // ── embed ──
    const color = hasCard
        ? intColor(theme.accent[0])
        : (embedCfg.color ? getColor(embedCfg.color) : getColor(isGoodbye ? 'error' : 'success'));

    const customTitle = embedCfg.title && !LEGACY_DEFAULT_TITLES.has(embedCfg.title) ? embedCfg.title : null;
    const title = formatWelcomeMessage(
        customTitle || (isGoodbye ? '👋 Goodbye, {displayName}' : '✨ Welcome to {server}!'),
        data,
    );
    const footerText = embedCfg.footer
        ? formatWelcomeMessage(embedCfg.footer, data)
        : (isGoodbye ? `Goodbye from ${guild.name}` : `Welcome to ${guild.name}`);

    const embed = new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: guild.name, iconURL: guild.iconURL({ size: 128 }) ?? undefined })
        .setTitle(title)
        .setDescription(message)
        .setFooter({ text: footerText, iconURL: guild.iconURL({ size: 64 }) ?? undefined })
        .setTimestamp();

    if (isGoodbye) {
        embed.addFields(
            { name: '👤 Member', value: `**${user.tag ?? user.username}**\n\`${user.id}\``, inline: true },
            { name: '📅 Joined', value: joinedTs ? `<t:${Math.floor(joinedTs / 1000)}:D>\n<t:${Math.floor(joinedTs / 1000)}:R>` : 'Unknown', inline: true },
            { name: '👥 Members Now', value: `**${memberCount.toLocaleString('en-US')}**`, inline: true },
        );
    } else {
        embed.addFields(
            { name: '👤 Member', value: `${mention}\n\`${user.id}\``, inline: true },
            { name: '🗓️ Account Created', value: createdTs ? `<t:${Math.floor(createdTs / 1000)}:D>\n<t:${Math.floor(createdTs / 1000)}:R>` : 'Unknown', inline: true },
            { name: '👥 You Are', value: `**${ordinal(memberCount)}** member`, inline: true },
        );
    }

    if (hasCard) {
        embed.setImage(`attachment://${fileName}`);
    } else {
        // Card disabled / unavailable → classic look: avatar thumbnail + optional static image.
        embed.setThumbnail(user.displayAvatarURL({ size: 256 }));
        const staticImage = backgroundUrl(cfg, kind);
        if (staticImage) embed.setImage(staticImage);
    }

    return { content: pingText, embeds: [embed], files, allowedMentions };
}

async function deliver(kind, member, cfg, channelId) {
    const { guild } = member;
    const channel = channelId ? guild.channels.cache.get(channelId) : null;
    if (!channel?.isTextBased?.()) return false;

    const me = guild.members.me;
    const perms = me ? channel.permissionsFor(me) : null;
    if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
        logger.debug(`[Greet] Missing permission to send ${kind} message in channel ${channel.id} (guild ${guild.id})`);
        return false;
    }

    const payload = await buildGreetPayload(kind, member, cfg, {
        canEmbed: perms.has(PermissionFlagsBits.EmbedLinks),
        canAttach: perms.has(PermissionFlagsBits.AttachFiles),
    });

    try {
        await channel.send(payload);
    } catch (error) {
        // Last resort: retry without the card so the member is still greeted.
        logger.warn(`[Greet] Sending ${kind} message failed (${error.message}); retrying without card`);
        if (!payload.files?.length) return false;
        const embeds = payload.embeds?.map(e => {
            const copy = EmbedBuilder.from(e);
            copy.setImage(null);
            return copy;
        });
        await channel.send({ ...payload, files: [], embeds });
    }
    return true;
}

export async function sendWelcome(member, cfg) {
    if (!cfg?.enabled || !cfg.channelId) return false;
    try {
        return await deliver('welcome', member, cfg, cfg.channelId);
    } catch (error) {
        logger.error('[Greet] Failed to send welcome message:', error);
        return false;
    }
}

export async function sendGoodbye(member, cfg) {
    if (!cfg?.goodbyeEnabled || !cfg.goodbyeChannelId) return false;
    try {
        return await deliver('goodbye', member, cfg, cfg.goodbyeChannelId);
    } catch (error) {
        logger.error('[Greet] Failed to send goodbye message:', error);
        return false;
    }
      }
                  
