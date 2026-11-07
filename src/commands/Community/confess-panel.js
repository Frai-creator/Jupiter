import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } from 'discord.js';

let confessionCount = 1; // Nomor urut awal confession
const CONFESSION_CHANNEL_ID = '1568453562818629837'; // Ganti pakai ID channel tujuan confession kamu

export default {
    data: new SlashCommandBuilder()
        .setName('setup-confess')
        .setDescription('Kirim panel tombol confession ke channel ini')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        if (!interaction.guild) {
            await interaction.reply({ content: "Fitur ini cuma bisa dipakai di dalam server ya!", ephemeral: true });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle('💌 Anonymous Confession Wall')
            .setDescription('Mau nyatain perasaan, kasih pesan rahasia, atau curhat tanpa ketahuan siapa pengirimnya?\n\nKlik tombol **"Submit a confession!"** di bawah buat mulai kirim pesan rahasia kamu secara anonim! ✨')
            .setColor(0xFFB6C1)
            .setFooter({ text: 'Pesan kamu dijamin aman dan anonim!' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('open_confess_modal_titan') // Pakai ID unik biar gak bentrok
                    .setLabel('Submit a confession!')
                    .setStyle(ButtonStyle.Primary),
            );

        await interaction.reply({ content: "Berhasil membuat panel confession!", ephemeral: true });
        const panelMessage = await interaction.channel.send({ embeds: [embed], components: [row] });

        // --- SISTEM LISTENER NUMPANG LANGSUNG DI SINI ---
        // Ini bikin bot otomatis nge-listen klik tombol & submit modal dari panel yang baru dikirim tanpa lewat event handler luar!
        const collector = panelMessage.createMessageComponentCollector();

        collector.on('collect', async i => {
            try {
                // 1. Kalau tombol diklik
                if (i.isButton() && i.customId === 'open_confess_modal_titan') {
                    const modal = new ModalBuilder()
                        .setCustomId('confess_modal_titan')
                        .setTitle('Kirim Anonymous Confession');

                    const confessInput = new TextInputBuilder()
                        .setCustomId('confess_message_titan')
                        .setLabel('Tulis pesan confession kamu di sini:')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('Tulis pesan rahasiamu di sini...')
                        .setRequired(true)
                        .setMaxLength(1000);

                    const modalRow = new ActionRowBuilder().addComponents(confessInput);
                    modal.addComponents(modalRow);

                    await i.showModal(modal);
                }
            } catch (err) {
                console.error("Error button collector:", err);
            }
        });

        // 2. Listener khusus buat nangkap saat modalnya di-submit
        interaction.client.on('interactionCreate', async i => {
            if (!i.isModalSubmit() || i.customId !== 'confess_modal_titan') return;

            try {
                await i.deferReply({ ephemeral: true });

                const pesan = i.fields.getTextInputValue('confess_message_titan');
                const targetChannel = i.client.channels.cache.get(CONFESSION_CHANNEL_ID);

                if (!targetChannel) {
                    await i.editReply({ content: "Waduh, channel tujuan confession belum diatur dengan benar di kode!" });
                    return;
                }

                confessionCount++;

                const confessEmbed = new EmbedBuilder()
                    .setTitle(`Anonymous Confession (#${confessionCount})`)
                    .setDescription(`"${pesan}"`)
                    .setColor(0x2b2d31);

                const rowButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('open_confess_modal_titan')
                            .setLabel('Submit a confession!')
                            .setStyle(ButtonStyle.Primary),
                    );

                const sentMessage = await targetChannel.send({ embeds: [confessEmbed], components: [rowButton] });

                // Bikin Thread otomatis di bawahnya
                await sentMessage.startThread({
                    name: `Confession Replies (#${confessionCount})`,
                    autoArchiveDuration: 1440,
                });

                await i.editReply({ content: "Sip! Confession kamu berhasil dikirim secara anonim. ✨" });
            } catch (error) {
                console.error("Error modal submit:", error);
                if (i.isRepliable() && !i.replied) {
                    await i.reply({ content: `Terjadi kesalahan: ${error.message}`, ephemeral: true }).catch(() => {});
                }
            }
        });
    }
};
