import { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const CONFESSION_CHANNEL_ID = '1568453562818629837'; // Ganti pakai ID channel tujuan confession

// Variabel buat nyimpen nomor urut confession (auto increment)
let confessionCount = 730; // Mulai dari angka sebelum foto lo biar nyambung

export default (client) => {
    // 1. Ketika tombol "Submit a confession!" ditekan, munculkan Pop-up Modal
    client.on('interactionCreate', async (interaction) => {
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

            await interaction.showModal(modal);
        }

        // 2. Ketika user men-submit modal confession
        if (interaction.isModalSubmit() && interaction.customId === 'confess_modal') {
            const pesan = interaction.fields.getTextInputValue('confess_message');
            const targetChannel = interaction.client.channels.cache.get(CONFESSION_CHANNEL_ID);

            if (!targetChannel) {
                await interaction.reply({ content: "Waduh, channel tujuan confession belum disetting dengan benar!", ephemeral: true });
                return;
            }

            confessionCount++; // Tambah nomor urut otomatis

            // Buat Embed mirip banget kayak di foto
            const embed = new EmbedBuilder()
                .setTitle(`Anonymous Confession (#${confessionCount})`)
                .setDescription(`"${pesan}"`)
                .setColor(0x2b2d31); // Warna gelap ala embed Discord

            // Tombol interaktif di bawah pesan confession
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('open_confess_modal')
                        .setLabel('Submit a confession!')
                        .setStyle(ButtonStyle.Primary),
                    // Kalau mau ditambah tombol lain misal poll, bisa diaktifkan di bawah:
                    /*
                    new ButtonBuilder()
                        .setCustomId('submit_poll')
                        .setLabel('Submit a poll!')
                        .setStyle(ButtonStyle.Secondary),
                    */
                );

            try {
                // Kirim pesan utama ke channel
                const sentMessage = await targetChannel.send({ embeds: [embed], components: [row] });

                // Bikin Thread otomatis di bawah pesan tersebut buat diskusi/balasan
                await sentMessage.startThread({
                    name: `Confession Replies (#${confessionCount})`,
                    autoArchiveDuration: 1440, // Ars otomatis setelah 24 jam tidak aktif
                });

                await interaction.reply({ content: "Sip! Confession kamu berhasil dikirim secara anonim. ✨", ephemeral: true });
            } catch (error) {
                await interaction.reply({ content: `Gagal ngirim confession: ${error.message}`, ephemeral: true });
            }
        }
    });
};
