import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    PermissionFlagsBits 
} from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('confess')
        .setDescription('Kirim panel confess rahasia ke channel ini')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // --- KONFIGURASI CHANNEL ---
        const LOG_CHANNEL_ID = '1568826233125470309'; // Ganti dengan ID channel log kamu
        // ---------------------------

        await interaction.deferReply({ ephemeral: true });

        const embed = new EmbedBuilder()
            .setTitle('💌 Anonymous Confession System')
            .setDescription('Punya pesan rahasia, uneg-uneg, atau sesuatu yang ingin disampaikan secara anonim? \n\nKlik tombol di bawah untuk mengirim pesan rahasia!')
            .setColor(0xFF69B4)
            .setFooter({ text: 'Identitas pengirim dijamin 100% aman dan dirahasiakan.' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_submit_confess')
                .setLabel('Submit a confession!')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('💌')
        );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.editReply({ content: '✅ Panel confess berhasil dikirim ke channel ini!' });
    },

    // Handle interaksi tombol dan modal
    async handleInteraction(interaction) {
        const LOG_CHANNEL_ID = '1568826233125470309'; // Ganti dengan ID channel log kamu
        const logChannel = interaction.client.channels.cache.get(LOG_CHANNEL_ID);

        try {
            // 1. Ketika user klik tombol "Submit a confession!" (HARUS LANGSUNG SHOW MODAL TANPA DEFER)
            if (interaction.isButton() && interaction.customId === 'btn_submit_confess') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_confess_input')
                    .setTitle('Kirim Pesan Confess');

                const messageInput = new TextInputBuilder()
                    .setCustomId('confess_message_input')
                    .setLabel('Apa isi pesan rahasiamu?')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Tulis pesan rahasia kamu di sini...')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(messageInput));
                return await interaction.showModal(modal);
            }

            // 2. Ketika user klik tombol "Reply" pada pesan confess
            if (interaction.isButton() && interaction.customId.startsWith('btn_reply_confess_')) {
                const confessId = interaction.customId.split('_')[3];

                const modal = new ModalBuilder()
                    .setCustomId(`modal_reply_input_${confessId}`)
                    .setTitle(`Balas Confess (#${confessId})`);

                const replyInput = new TextInputBuilder()
                    .setCustomId('confess_reply_message_input')
                    .setLabel('Tulis balasan anonimmu:')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Ketik balasan di sini...')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(replyInput));
                return await interaction.showModal(modal);
            }

            // 3. Ketika modal Submit Confess dikirim
            if (interaction.isModalSubmit() && interaction.customId === 'modal_confess_input') {
                await interaction.deferReply({ ephemeral: true });

                const confessText = interaction.fields.getTextInputValue('confess_message_input');
                const confessNumber = Math.floor(Math.random() * 900) + 100; // Generate nomor acak confess

                const confessEmbed = new EmbedBuilder()
                    .setTitle(`Anonymous Confession (#${confessNumber})`)
                    .setDescription(`"${confessText}"`)
                    .setColor(0x9B59B6)
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('btn_submit_confess')
                        .setLabel('Submit a confession!')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('💌'),
                    new ButtonBuilder()
                        .setCustomId(`btn_reply_confess_${confessNumber}`)
                        .setLabel('Reply')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('💬')
                );

                const sentMessage = await interaction.channel.send({ embeds: [confessEmbed], components: [row] });

                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle(`🔍 Log Confess Baru (#${confessNumber})`)
                        .addFields(
                            { name: 'Pengirim Asli', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: false },
                            { name: 'Isi Pesan', value: confessText, inline: false },
                            { name: 'ID Pesan Publik', value: sentMessage.id, inline: true }
                        )
                        .setColor(0xFFA500)
                        .setTimestamp();

                    await logChannel.send({ embeds: [logEmbed] });
                }

                return await interaction.editReply({ content: '✅ Pesan confess kamu berhasil dikirim secara anonim!' });
            }

            // 4. Ketika modal Reply Confess dikirim
            if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_reply_input_')) {
                await interaction.deferReply({ ephemeral: true });

                const confessId = interaction.customId.split('_')[3];
                const replyText = interaction.fields.getTextInputValue('confess_reply_message_input');

                const replyEmbed = new EmbedBuilder()
                    .setTitle(`Confess Replies (#${confessId})`)
                    .setDescription(`> 👤 **Anonymous Reply:** ${replyText}`)
                    .setColor(0x3498DB)
                    .setTimestamp();

                await interaction.channel.send({ embeds: [replyEmbed] });

                if (logChannel) {
                    const replyLogEmbed = new EmbedBuilder()
                        .setTitle(`💬 Log Balasan Confess (#${confessId})`)
                        .addFields(
                            { name: 'Pembuat Balasan (Asli)', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: false },
                            { name: 'Isi Balasan', value: replyText, inline: false }
                        )
                        .setColor(0x00FFCC)
                        .setTimestamp();

                    await logChannel.send({ embeds: [replyLogEmbed] });
                }

                return await interaction.editReply({ content: '✅ Balasan anonim kamu berhasil dikirim!' });
            }

        } catch (error) {
            console.error('Error pada handler confess:', error);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: '❌ Terjadi kesalahan saat memproses confess.' }).catch(() => {});
            }
        }
    }
};
