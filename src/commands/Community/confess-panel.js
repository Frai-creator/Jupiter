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
            .setDescription('Mau nyatain perasaan, kasih pesan rahasia, atau curhat tanpa ketahuan siapa pengirimnya?\n\nKlik tombol **"Kirim Confession"** di bawah buat mulai kirim pesan rahasia kamu secara anonim! ✨')
            .setColor(0xFFB6C1)
            .setFooter({ text: 'Pesan kamu dijamin aman dan anonim!' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('open_confess_modal')
                    .setLabel('Submit a confession!')
                    .setStyle(ButtonStyle.Primary),
            );

        await interaction.reply({ content: "Berhasil membuat panel confession!", ephemeral: true });
        await interaction.channel.send({ embeds: [embed], components: [row] });
    },

    // Handle interaksi tombol dan modal langsung di file ini supaya gak timeout/nyangkut
    async executeInteraction(interaction) {
        try {
            // 1. Saat tombol diklik, langsung munculkan Modal (tanpa jeda)
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
                return;
            }

            // 2. Saat modal dikirim (submit)
            if (interaction.isModalSubmit() && interaction.customId === 'confess_modal') {
                await interaction.deferReply({ ephemeral: true });

                const pesan = interaction.fields.getTextInputValue('confess_message');
                const targetChannel = interaction.client.channels.cache.get(CONFESSION_CHANNEL_ID);

                if (!targetChannel) {
                    await interaction.editReply({ content: "Waduh, channel tujuan confession belum diatur dengan benar di kode!" });
                    return;
                }

                confessionCount++;

                const confessEmbed = new EmbedBuilder()
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

                const sentMessage = await targetChannel.send({ embeds: [confessEmbed], components: [row] });

                // Bikin Thread otomatis di bawahnya
                await sentMessage.startThread({
                    name: `Confession Replies (#${confessionCount})`,
                    autoArchiveDuration: 1440,
                });

                await interaction.editReply({ content: "Sip! Confession kamu berhasil dikirim secara anonim. ✨" });
            }
        } catch (error) {
            console.error("Error confession interaction:", error);
            if (interaction.isRepliable() && !interaction.replied) {
                await interaction.reply({ content: `Terjadi kesalahan: ${error.message}`, ephemeral: true }).catch(() => {});
            }
        }
    }
};
