import { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';

const CONFESSION_CHANNEL_ID = '1568453562818629837'; // Ganti pakai ID channel tujuan confession
let confessionCount = 730; // Nomor urut awal

export default (client) => {
    client.on('interactionCreate', async (interaction) => {
        try {
            // 1. Tangkap klik tombol "Kirim Confession"
            if (interaction.isButton() && interaction.customId === 'open_confess_modal') {
                const modal = new ModalBuilder()
                    .setCustomId('confess_modal')
                    .setTitle('Kirim Anonymous Confession');

                const confessInput = new TextInputBuilder()
                    .setCustomId('confess_message')
                    .setLabel('Tulis pesan confession kamu di sini:')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Tulis pesan rahasiamu di sini...')
                    .setRequired(true)
                    .setMaxLength(1000);

                const row = new ActionRowBuilder().addComponents(confessInput);
                modal.addComponents(row);

                // Langsung tampilkan modal tanpa jeda lama
                await interaction.showModal(modal);
                return;
            }

            // 2. Tangkap saat modal di-submit
            if (interaction.isModalSubmit() && interaction.customId === 'confess_modal') {
                await interaction.deferReply({ ephemeral: true }); // Mencegah timeout (loading dulu)

                const pesan = interaction.fields.getTextInputValue('confess_message');
                const targetChannel = interaction.client.channels.cache.get(CONFESSION_CHANNEL_ID);

                if (!targetChannel) {
                    await interaction.editReply({ content: "Waduh, channel tujuan confession belum disetting dengan benar!" });
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

                // Kirim ke channel tujuan
                const sentMessage = await targetChannel.send({ embeds: [embed], components: [row] });

                // Bikin Thread otomatis
                await sentMessage.startThread({
                    name: `Confession Replies (#${confessionCount})`,
                    autoArchiveDuration: 1440,
                });

                await interaction.editReply({ content: "Sip! Confession kamu berhasil dikirim secara anonim. ✨" });
            }
        } catch (error) {
            console.error("Error di confession handler:", error);
            if (interaction.isRepliable() && !interaction.replied) {
                await interaction.reply({ content: `Terjadi kesalahan: ${error.message}`, ephemeral: true }).catch(() => {});
            }
        }
    });
};
