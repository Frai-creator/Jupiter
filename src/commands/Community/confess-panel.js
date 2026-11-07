import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } from 'discord.js';

let confessionCount = 730; // Nomor urut awal confession
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
                    .setCustomId('open_confess_modal_clean')
                    .setLabel('Submit a confession!')
                    .setStyle(ButtonStyle.Primary),
            );

        await interaction.reply({ content: "Berhasil membuat panel confession!", ephemeral: true });
        const panelMessage = await interaction.channel.send({ embeds: [embed], components: [row] });

        // Collector buat tombol di panel utama
        const collector = panelMessage.createMessageComponentCollector();

        collector.on('collect', async i => {
            if (i.isButton() && i.customId === 'open_confess_modal_clean') {
                const modal = new ModalBuilder()
                    .setCustomId('confess_modal_clean')
                    .setTitle('Kirim Anonymous Confession');

                const confessInput = new TextInputBuilder()
                    .setCustomId('confess_message_clean')
                    .setLabel('Tulis pesan confession kamu di sini:')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Tulis pesan rahasiamu di sini...')
                    .setRequired(true)
                    .setMaxLength(1000);

                const modalRow = new ActionRowBuilder().addComponents(confessInput);
                modal.addComponents(modalRow);

                await i.showModal(modal);
            }
        });

        // Global listener buat nangkep submit modal & langsung kirim tanpa jejak balasan bot
        interaction.client.on('interactionCreate', async i => {
            if (!i.isModalSubmit() || i.customId !== 'confess_modal_clean') return;

            try {
                // KUNCI UTAMA: deferUpdate bikin modal langsung tutup bersih TANPA ada teks balasan bot!
                await i.deferUpdate();

                const pesan = i.fields.getTextInputValue('confess_message_clean');
                const targetChannel = i.client.channels.cache.get(CONFESSION_CHANNEL_ID);

                if (!targetChannel) return;

                confessionCount++;

                const confessEmbed = new EmbedBuilder()
                    .setTitle(`Anonymous Confession (#${confessionCount})`)
                    .setDescription(`"${pesan}"`)
                    .setColor(0x2b2d31);

                // Tombol di bawah hasil confession (bisa ditambah tombol lain kalau mau)
                const rowButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('open_confess_modal_clean')
                            .setLabel('Submit a confession!')
                            .setStyle(ButtonStyle.Primary),
                    );

                // Kirim hasil confession ke channel tujuan
                const sentMessage = await targetChannel.send({ embeds: [confessEmbed], components: [rowButton] });

                // Otomatis buat Thread buat tempat "Reply" diskusi
                await sentMessage.startThread({
                    name: `Confession Replies (#${confessionCount})`,
                    autoArchiveDuration: 1440,
                });

            } catch (error) {
                console.error("Error clean modal submit:", error);
            }
        });
    }
};
