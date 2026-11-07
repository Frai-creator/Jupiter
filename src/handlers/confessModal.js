import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const CONFESSION_CHANNEL_ID = '1568453562818629837'; // Ganti pakai ID channel tujuan confession kamu
let confessionCount = 730; // Nomor urut awal

export default {
    id: 'confess_modal', // Harus sama persis dengan customId di modal
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const pesan = interaction.fields.getTextInputValue('confess_message');
        const targetChannel = interaction.client.channels.cache.get(CONFESSION_CHANNEL_ID);

        if (!targetChannel) {
            await interaction.editReply({ content: "Waduh, channel tujuan confession belum diatur dengan benar!" });
            return;
        }

        confessionCount++;

        const embed = new EmbedBuilder()
            .setTitle(`Anonymous Confession (#${confessionCount})`)
            .setDescription(`"${pesan}"`)
            .setColor(0x2b2d31);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('open_confess_modal')
                    .setLabel('Submit a confession!')
                    .setStyle(ButtonStyle.Primary),
            );

        const sentMessage = await targetChannel.send({ embeds: [embed], components: [row] });

        // Bikin Thread otomatis di bawah pesan confession
        await sentMessage.startThread({
            name: `Confession Replies (#${confessionCount})`,
            autoArchiveDuration: 1440,
        });

        await interaction.editReply({ content: "Sip! Confession kamu berhasil dikirim secara anonim. ✨" });
    },
};
