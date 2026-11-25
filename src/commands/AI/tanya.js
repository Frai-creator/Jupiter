import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, InteractionContextType } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
    getAiConfig, safeChat, takeCooldown, clearMemory, buildReplyEmbed, chunkText, fetchImageParts,
} from '../../services/ai/aiService.js';

const NOTICE = { flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } };

export default {
    data: new SlashCommandBuilder()
        .setName('tanya')
        .setDescription('Tanya AI server ini apa saja')
        .setContexts(InteractionContextType.Guild)
        .addStringOption((o) => o.setName('pertanyaan').setDescription('Mau tanya atau ngobrol apa?').setRequired(true).setMaxLength(1500))
        .addAttachmentOption((o) => o.setName('gambar').setDescription('Gambar yang mau dibahas (opsional)'))
        .addBooleanOption((o) => o.setName('lupakan').setDescription('Hapus ingatan AI tentang obrolan kita sebelumnya')),

    async execute(interaction, config, client) {
        const { guild } = interaction;
        if (!guild) return interaction.reply({ content: 'Command ini hanya bisa dipakai di server.', ...NOTICE });

        const cfg = await getAiConfig(client, guild.id);
        if (!cfg.enabled) {
            return interaction.reply({ content: 'AI belum diaktifkan di server ini. Minta admin menjalankan `/ai panel`.', ...NOTICE });
        }

        const member = interaction.member;
        if (cfg.allowedRoleId) {
            const allowed = member?.roles?.cache?.has(cfg.allowedRoleId) || member?.permissions?.has(PermissionFlagsBits.ManageGuild);
            if (!allowed) {
                return interaction.reply({ content: `Fitur AI hanya untuk member dengan role <@&${cfg.allowedRoleId}>.`, ...NOTICE });
            }
        }

        const remaining = takeCooldown(guild.id, interaction.user.id, cfg);
        if (remaining > 0) {
            return interaction.reply({ content: `Santai dulu ya, tunggu ${Math.ceil(remaining / 1000)} detik lagi.`, ...NOTICE });
        }

        await InteractionHelper.safeDefer(interaction);

        if (interaction.options.getBoolean('lupakan')) clearMemory(guild.id, interaction.user.id);

        const text = interaction.options.getString('pertanyaan');
        const attachment = interaction.options.getAttachment('gambar');
        const images = cfg.vision && attachment ? await fetchImageParts([attachment], 1) : [];

        const result = await safeChat({
            guild,
            channel: interaction.channel ?? { id: interaction.channelId, name: 'obrolan' },
            userId: interaction.user.id,
            displayName: member?.displayName || interaction.user.username,
            cfg,
            text,
            images,
        });

        const allowedMentions = { parse: [] };
        const chunks = chunkText(result.text, cfg.style === 'embed' ? 3900 : 1800).slice(0, 3);
        const toPayload = (chunk, index) => {
            if (cfg.style === 'embed') return { embeds: [buildReplyEmbed(cfg, chunk)], allowedMentions };
            // Teks biasa: tampilkan pertanyaan di atas agar jelas konteksnya (hanya di potongan pertama).
            const header = index === 0 ? `> ${text.replace(/\n+/g, ' ').slice(0, 150)}\n\n` : '';
            return { content: `${header}${chunk}`, allowedMentions };
        };

        await interaction.editReply(toPayload(chunks[0], 0));
        for (let i = 1; i < chunks.length; i++) {
            await interaction.followUp(toPayload(chunks[i], i));
        }
    },
};
