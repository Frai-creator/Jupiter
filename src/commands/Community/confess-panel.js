import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } from 'discord.js';

let confessionCount = 10; 
const CONFESSION_CHANNEL_ID = '1568818853583257636'; // Ganti pakai ID channel tujuan confession kamu
const CHANNEL_LOG_ID = '1568826233125470309'; // Ganti pakai ID channel khusus log admin

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
            .setDescription('Mau nyatain perasaan, kasih pesan rahasia, atau curhat tanpa ketahuan siapa pengirimnya?\n\nKlik tombol **"Submit a confession! 💌"** di bawah buat mulai kirim pesan rahasia kamu secara anonim! ✨')
            .setColor(0xFFB6C1)
            .setFooter({ text: 'Pesan kamu dijamin aman dan anonim!' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('open_confess_modal_clean')
                    .setLabel('Submit a confession!')
                    .setEmoji('💌')
                    .setStyle(ButtonStyle.Primary),
            );

        await interaction.reply({ content: "Berhasil membuat panel confession!", ephemeral: true });
        const panelMessage = await interaction.channel.send({ embeds: [embed], components: [row] });

        // Global listener buat nangkep semua tombol & modal
        interaction.client.on('interactionCreate', async i => {
            try {
                // 1. Ketika tombol "Submit a confession!" diklik (baik dari panel atau dari bawah pesan confession)
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

                // 2. Submit Modal Confession Utama
                if (i.isModalSubmit() && i.customId === 'confess_modal_clean') {
                    await i.deferUpdate();

                    const pesan = i.fields.getTextInputValue('confess_message_clean');
                    const targetChannel = i.client.channels.cache.get(CONFESSION_CHANNEL_ID);
                    const logChannel = i.client.channels.cache.get(CHANNEL_LOG_ID);

                    if (!targetChannel) return;

                    confessionCount++;

                    const confessEmbed = new EmbedBuilder()
                        .setTitle(`Anonymous Confession (#${confessionCount})`)
                        .setDescription(`"${pesan}"`)
                        .setColor(0x2b2d31);

                    const rowButton = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('open_confess_modal_clean')
                                .setLabel('Submit a confession!')
                                .setEmoji('💌')
                                .setStyle(ButtonStyle.Primary),
                            new ButtonBuilder()
                                .setCustomId(`open_reply_modal_${confessionCount}`)
                                .setLabel('Reply')
                                .setEmoji('💬')
                                .setStyle(ButtonStyle.Secondary),
                        );

                    const sentMessage = await targetChannel.send({ embeds: [confessEmbed], components: [rowButton] });

                    await sentMessage.startThread({
                        name: `Confession Replies (#${confessionCount})`,
                        autoArchiveDuration: 1440,
                    });

                    // Kirim log ke channel admin
                    if (logChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle(`📋 Confession Log (#${confessionCount})`)
                            .addFields(
                                { name: '👤 Pengirim Asli', value: `${i.user.tag} (${i.user.id})`, inline: false },
                                { name: '💬 Isi Pesan', value: `"${pesan}"`, inline: false }
                            )
                            .setColor(0xFFA500)
                            .setTimestamp();

                        await logChannel.send({ embeds: [logEmbed] });
                    }
                }

                // 3. Ketika tombol "Reply" diklik
                if (i.isButton() && i.customId.startsWith('open_reply_modal_')) {
                    const confNum = i.customId.split('_')[3];

                    const replyModal = new ModalBuilder()
                        .setCustomId(`reply_submit_modal_${confNum}`)
                        .setTitle(`Reply to Confession #${confNum}`);

                    const replyInput = new TextInputBuilder()
                        .setCustomId('reply_message')
                        .setLabel('Tulis balasan kamu di sini:')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('Tulis balasan rahasiamu...')
                        .setRequired(true)
                        .setMaxLength(1000);

                    const replyRow = new ActionRowBuilder().addComponents(replyInput);
                    replyModal.addComponents(replyRow);

                    await i.showModal(replyModal);
                }

                // 4. Ketika Modal Reply di-submit (DITAMBAHKAN LOG DI SINI)
                if (i.isModalSubmit() && i.customId.startsWith('reply_submit_modal_')) {
                    await i.deferUpdate();

                    const confNum = i.customId.split('_')[3];
                    const replyText = i.fields.getTextInputValue('reply_message');
                    const targetChannel = i.client.channels.cache.get(CONFESSION_CHANNEL_ID);
                    const logChannel = i.client.channels.cache.get(CHANNEL_LOG_ID);

                    if (!targetChannel) return;

                    const fetchedThreads = await targetChannel.threads.fetchActive();
                    let targetThread = fetchedThreads.threads.find(th => th.name === `Confession Replies (#${confNum})`);

                    if (!targetThread) {
                        const archivedThreads = await targetChannel.threads.fetchArchived();
                        targetThread = archivedThreads.threads.find(th => th.name === `Confession Replies (#${confNum})`);
                    }

                    if (targetThread) {
                        await targetThread.send({
                            content: `💬 **Anonymous Reply:**\n> ${replyText}`
                        });
                    }

                    // Kirim log balasan ke channel admin
                    if (logChannel) {
                        const replyLogEmbed = new EmbedBuilder()
                            .setTitle(`💬 Reply Log (#${confNum})`)
                            .addFields(
                                { name: '👤 Pembuat Balasan (Asli)', value: `${i.user.tag} (${i.user.id})`, inline: false },
                                { name: '📝 Isi Balasan', value: `"${replyText}"`, inline: false }
                            )
                            .setColor(0x3498DB)
                            .setTimestamp();

                        await logChannel.send({ embeds: [replyLogEmbed] });
                    }
                }
            } catch (error) {
                console.error("Error interaction handler:", error);
            }
        });
    }
};
