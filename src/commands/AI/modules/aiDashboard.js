// aiDashboard.js
// Tampilan status + dashboard interaktif untuk /ai panel.

import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType,
    EmbedBuilder, MessageFlags, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { PERSONAS, getPersona } from '../../../services/ai/aiPersonas.js';
import { getProviderInfo } from '../../../services/ai/aiProvider.js';
import {
    getAiConfig, saveAiConfig, clearMemory, safeChat, buildReplyEmbed, syncTriggerMode,
    TRIGGER_MODES, LANGUAGES, LENGTHS, STYLES, LABELS,
} from '../../../services/ai/aiService.js';

const PREFIX = 'aidash:';

const cycle = (list, current) => list[(list.indexOf(current) + 1) % list.length];
const onOff = (v) => (v ? '✅ Aktif' : '❌ Mati');
const bar = (value, max, size = 10) => {
    const filled = Math.round((value / max) * size);
    return '▰'.repeat(filled) + '▱'.repeat(size - filled);
};

// ───────────────────────── tampilan ─────────────────────────

export function buildStatusEmbed(cfg, guild) {
    const persona = getPersona(cfg.persona);
    const provider = getProviderInfo();

    const blurb = cfg.persona === 'custom' && cfg.customPrompt
        ? `> ${cfg.customPrompt.replace(/\n+/g, ' ').slice(0, 220)}${cfg.customPrompt.length > 220 ? '…' : ''}`
        : persona.desc;

    const channels = cfg.channels.length ? cfg.channels.map((id) => `<#${id}>`).join(' ') : '—';

    return new EmbedBuilder()
        .setColor(persona.color)
        .setTitle(`🤖 Pengaturan AI · ${guild.name}`.slice(0, 256))
        .setDescription(`${persona.emoji} **${persona.label}** · memakai nama **${cfg.name}**\n${blurb}`)
        .addFields(
            { name: '🔌 Status', value: cfg.enabled ? '🟢 Aktif' : '🔴 Nonaktif', inline: true },
            { name: '🎯 Trigger', value: LABELS.trigger[cfg.triggerMode], inline: true },
            { name: '🔐 Akses', value: cfg.allowedRoleId ? `<@&${cfg.allowedRoleId}>` : 'Semua member', inline: true },
            { name: '📍 Channel AI', value: channels, inline: false },
            { name: '🌐 Bahasa', value: LABELS.language[cfg.language], inline: true },
            { name: '📏 Panjang', value: LABELS.length[cfg.length], inline: true },
            { name: '💬 Gaya', value: LABELS.style[cfg.style], inline: true },
            { name: '🎨 Kreativitas', value: `\`${bar(cfg.creativity, 1.5)}\` ${cfg.creativity.toFixed(1)}`, inline: false },
            { name: '🧠 Memori', value: `${cfg.memory} giliran`, inline: true },
            { name: '⏱️ Cooldown', value: `${cfg.cooldown} detik`, inline: true },
            { name: '👀 Konteks channel', value: cfg.contextMessages ? `${cfg.contextMessages} pesan` : 'Mati', inline: true },
            { name: '😀 Emoji', value: onOff(cfg.emoji), inline: true },
            { name: '🖼️ Baca gambar', value: onOff(cfg.vision), inline: true },
            { name: '📚 Info server', value: cfg.serverInfo ? `Terisi (${cfg.serverInfo.length} karakter)` : 'Kosong', inline: true },
            { name: '⚙️ Mesin', value: `${provider.name}${provider.model !== '-' ? ` · \`${provider.model}\`` : ''}`, inline: false },
        );
}

export function buildDashboard(cfg, guild) {
    const personaMenu = new StringSelectMenuBuilder()
        .setCustomId(`${PREFIX}persona`)
        .setPlaceholder('🎭 Pilih personality AI')
        .addOptions(Object.entries(PERSONAS).map(([id, p]) => ({
            label: p.label,
            value: id,
            description: p.desc.slice(0, 100),
            emoji: p.emoji,
            default: id === cfg.persona,
        })));

    const channelMenu = new ChannelSelectMenuBuilder()
        .setCustomId(`${PREFIX}channels`)
        .setPlaceholder('📍 Pilih channel obrolan AI (kosongkan untuk menghapus)')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(0)
        .setMaxValues(10);
    if (cfg.channels.length) channelMenu.setDefaultChannels(cfg.channels);

    const cycleRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${PREFIX}trigger`).setLabel(LABELS.trigger[cfg.triggerMode]).setEmoji('🎯').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`${PREFIX}language`).setLabel(LABELS.language[cfg.language]).setEmoji('🌐').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`${PREFIX}length`).setLabel(LABELS.length[cfg.length]).setEmoji('📏').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`${PREFIX}style`).setLabel(LABELS.style[cfg.style]).setEmoji('💬').setStyle(ButtonStyle.Secondary),
    );

    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${PREFIX}toggle`).setLabel(cfg.enabled ? 'AI Aktif' : 'AI Nonaktif').setStyle(cfg.enabled ? ButtonStyle.Success : ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`${PREFIX}persona-edit`).setLabel('Edit Persona').setEmoji('✏️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`${PREFIX}tuning`).setLabel('Tuning').setEmoji('🎛️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`${PREFIX}test`).setLabel('Tes').setEmoji('🧪').setStyle(ButtonStyle.Secondary),
    );

    const miscRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${PREFIX}emoji`).setLabel(cfg.emoji ? 'Emoji: On' : 'Emoji: Off').setEmoji('😀').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`${PREFIX}vision`).setLabel(cfg.vision ? 'Gambar: On' : 'Gambar: Off').setEmoji('🖼️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`${PREFIX}resetmem`).setLabel('Hapus Memori').setEmoji('🧹').setStyle(ButtonStyle.Secondary),
    );

    return {
        embeds: [buildStatusEmbed(cfg, guild)],
        components: [
            new ActionRowBuilder().addComponents(personaMenu),
            new ActionRowBuilder().addComponents(channelMenu),
            cycleRow,
            actionRow,
            miscRow,
        ],
    };
}

// ───────────────────────── modal ─────────────────────────

function input(id, label, style, { required = false, max = 100, value = '', placeholder = '' } = {}) {
    const field = new TextInputBuilder()
        .setCustomId(id)
        .setLabel(label)
        .setStyle(style)
        .setRequired(required)
        .setMaxLength(max);
    if (placeholder) field.setPlaceholder(placeholder.slice(0, 100));
    if (value) field.setValue(String(value).slice(0, max));
    return new ActionRowBuilder().addComponents(field);
}

/** Form: nama AI, personality custom, info server. Dipakai oleh dashboard dan /ai tulis-persona. */
export async function promptPersonaModal(interaction, client, guildId) {
    const cfg = await getAiConfig(client, guildId);
    const modalId = `${PREFIX}persona-modal:${interaction.id}`;

    const modal = new ModalBuilder()
        .setCustomId(modalId)
        .setTitle('Edit Persona AI')
        .addComponents(
            input('name', 'Nama AI', TextInputStyle.Short, { required: true, max: 24, value: cfg.name, placeholder: 'mis. Jupiter' }),
            input('prompt', 'Personality custom', TextInputStyle.Paragraph, {
                max: 1500, value: cfg.customPrompt,
                placeholder: 'mis. Kamu kucing penjaga server yang suka bilang "nyaa" dan galak tapi sayang.',
            }),
            input('info', 'Info server (opsional)', TextInputStyle.Paragraph, {
                max: 1500, value: cfg.serverInfo,
                placeholder: 'Aturan, channel penting, event, nama staff, dll. AI akan memakainya sebagai rujukan.',
            }),
        );

    await interaction.showModal(modal);
    const submitted = await interaction
        .awaitModalSubmit({ filter: (m) => m.customId === modalId && m.user.id === interaction.user.id, time: 300_000 })
        .catch(() => null);
    if (!submitted) return null;

    const name = submitted.fields.getTextInputValue('name').trim() || cfg.name;
    const customPrompt = submitted.fields.getTextInputValue('prompt').trim();
    const serverInfo = submitted.fields.getTextInputValue('info').trim();

    const patch = { name, customPrompt, serverInfo };
    if (customPrompt && customPrompt !== cfg.customPrompt) patch.persona = 'custom';

    return { submitted, cfg: await saveAiConfig(client, guildId, patch) };
}

async function promptTuningModal(interaction, client, guildId) {
    const cfg = await getAiConfig(client, guildId);
    const modalId = `${PREFIX}tuning-modal:${interaction.id}`;

    const modal = new ModalBuilder()
        .setCustomId(modalId)
        .setTitle('Tuning AI')
        .addComponents(
            input('creativity', 'Kreativitas (0.1 - 1.5)', TextInputStyle.Short, { required: true, max: 4, value: cfg.creativity.toFixed(1), placeholder: '0.8' }),
            input('memory', 'Memori, jumlah giliran (0 - 20)', TextInputStyle.Short, { required: true, max: 2, value: String(cfg.memory), placeholder: '8' }),
            input('cooldown', 'Cooldown per user, detik (0 - 60)', TextInputStyle.Short, { required: true, max: 2, value: String(cfg.cooldown), placeholder: '5' }),
            input('context', 'Konteks channel, jumlah pesan (0 - 10)', TextInputStyle.Short, { required: true, max: 2, value: String(cfg.contextMessages), placeholder: '0' }),
        );

    await interaction.showModal(modal);
    const submitted = await interaction
        .awaitModalSubmit({ filter: (m) => m.customId === modalId && m.user.id === interaction.user.id, time: 300_000 })
        .catch(() => null);
    if (!submitted) return null;

    const read = (id) => submitted.fields.getTextInputValue(id).trim();
    const next = await saveAiConfig(client, guildId, {
        creativity: read('creativity'),
        memory: read('memory'),
        cooldown: read('cooldown'),
        contextMessages: read('context'),
    });
    return { submitted, cfg: next };
}

// ───────────────────────── runner ─────────────────────────

export async function runDashboard(interaction, client) {
    const guild = interaction.guild;
    const first = await getAiConfig(client, guild.id);
    const reply = await interaction.editReply(buildDashboard(first, guild));

    const collector = reply.createMessageComponentCollector({
        filter: (i) => i.user.id === interaction.user.id && i.customId.startsWith(PREFIX),
        time: 600_000,
    });

    collector.on('collect', async (i) => {
        try {
            const cfg = await getAiConfig(client, guild.id);
            const action = i.customId.slice(PREFIX.length);
            let patch = null;

            switch (action) {
                case 'persona': {
                    const value = i.values[0];
                    if (value === 'custom' && !cfg.customPrompt) {
                        const res = await promptPersonaModal(i, client, guild.id);
                        if (res) await res.submitted.update(buildDashboard(res.cfg, guild));
                        return;
                    }
                    patch = { persona: value };
                    break;
                }
                case 'channels': {
                    const channels = i.values;
                    patch = { channels, triggerMode: syncTriggerMode(channels, cfg.triggerMode) };
                    break;
                }
                case 'trigger': patch = { triggerMode: cycle(TRIGGER_MODES, cfg.triggerMode) }; break;
                case 'language': patch = { language: cycle(LANGUAGES, cfg.language) }; break;
                case 'length': patch = { length: cycle(LENGTHS, cfg.length) }; break;
                case 'style': patch = { style: cycle(STYLES, cfg.style) }; break;
                case 'toggle': patch = { enabled: !cfg.enabled }; break;
                case 'emoji': patch = { emoji: !cfg.emoji }; break;
                case 'vision': patch = { vision: !cfg.vision }; break;

                case 'persona-edit': {
                    const res = await promptPersonaModal(i, client, guild.id);
                    if (res) await res.submitted.update(buildDashboard(res.cfg, guild));
                    return;
                }
                case 'tuning': {
                    const res = await promptTuningModal(i, client, guild.id);
                    if (res) await res.submitted.update(buildDashboard(res.cfg, guild));
                    return;
                }
                case 'test': {
                    await i.deferReply({ flags: MessageFlags.Ephemeral });
                    const result = await safeChat({
                        guild,
                        channel: i.channel ?? { id: i.channelId, name: 'preview' },
                        userId: i.user.id,
                        displayName: i.member?.displayName || i.user.username,
                        cfg,
                        text: 'Halo! Perkenalkan dirimu dalam 2-3 kalimat sesuai kepribadianmu.',
                        useMemory: false,
                    });
                    await i.editReply({
                        content: '🧪 **Preview** (tidak disimpan ke memori)',
                        embeds: [buildReplyEmbed(cfg, result.text)],
                    });
                    return;
                }
                case 'resetmem': {
                    clearMemory(guild.id);
                    await i.reply({ content: '🧹 Memori percakapan AI di server ini sudah dihapus.', flags: MessageFlags.Ephemeral });
                    return;
                }
                default:
                    return;
            }

            const next = await saveAiConfig(client, guild.id, patch);
            await i.update(buildDashboard(next, guild));
        } catch (error) {
            logger.error('[AI] dashboard error:', error);
            const payload = { content: 'Gagal memproses pilihanmu. Coba lagi ya.', flags: MessageFlags.Ephemeral };
            if (i.deferred || i.replied) await i.followUp(payload).catch(() => {});
            else await i.reply(payload).catch(() => {});
        }
    });

    collector.on('end', async () => {
        try {
            const cfg = await getAiConfig(client, guild.id);
            await interaction.editReply({ embeds: [buildStatusEmbed(cfg, guild)], components: [] });
        } catch {
            // pesan sudah dihapus / interaksi kedaluwarsa
        }
    });
}
