import { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('confess')
        .setDescription('Kirim pesan rahasia secara anonim ke channel tujuan')
        .addStringOption(option =>
            option.setName('pesan')
                .setDescription('Isi pesan rahasia yang ingin kamu sampaikan')
                .setRequired(true)
        )
        .addUserOption(option =>
            option.setName('tujuan')
                .setDescription('(Opsional) Tag orang yang ingin kamu tuju')
                .setRequired(false)
        ),

    async execute(interaction) {
        // --- KONFIGURASI CHANNEL ---
        // Ganti ID di bawah ini dengan ID channel publik tempat confess dikirim
        const CONFESS_CHANNEL_ID = '1568818853583257636';
        // Ganti ID di bawah ini dengan ID channel log khusus admin/staff
        const LOG_CHANNEL_ID = '1568826233125470309';
        // ---------------------------

        await interaction.deferReply({ ephemeral: true });

        const pesan = interaction.options.getString('pesan');
        const targetUser = interaction.options.getUser('tujuan');

        const confessChannel = interaction.client.channels.cache.get(CONFESS_CHANNEL_ID);
        const logChannel = interaction.client.channels.cache.get(LOG_CHANNEL_ID);

        if (!confessChannel) {
            return interaction.editReply({ content: '❌ Channel confess publik belum diatur atau tidak ditemukan oleh bot!' });
        }

        try {
            // 1. Buat Embed untuk Publik
            const publicEmbed = new EmbedBuilder()
                .setTitle('💌 Pesan Confess Baru')
                .setDescription(`> "${pesan}"`)
                .setColor(0xFF69B4)
                .setFooter({ text: 'Kirim confess-mu sendiri menggunakan /confess' })
                .setTimestamp();

            if (targetUser) {
                publicEmbed.addFields({ name: 'Ditujukan Kepada', value: `${targetUser}`, inline: true });
            }

            // Kirim pesan confess ke channel publik
            const sentMessage = await confessChannel.send({
                content: targetUser ? `${targetUser}, ada pesan untukmu!` : '',
                embeds: [publicEmbed]
            });

            // 2. Buat Embed untuk Log (Mencatat pengirim asli)
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('🔍 Log Confess Terkirim')
                    .addFields(
                        { name: 'Pengirim Asli', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: false },
                        { name: 'Isi Pesan', value: pesan, inline: false },
                        { name: 'Target Tujuan', value: targetUser ? `${targetUser.tag}` : 'Tidak ada', inline: true },
                        { name: 'ID Pesan', value: sentMessage.id, inline: true }
                    )
                    .setColor(0xFFA500)
                    .setTimestamp();

                const logMsg = await logChannel.send({ embeds: [logEmbed] });

                // --- SISTEM TRACKING REPLY ---
                // Collector untuk memantau jika ada yang mereply pesan confess tersebut
                const filter = m => m.reference && m.reference.messageId === sentMessage.id;
                const replyCollector = confessChannel.createMessageCollector({ filter });

                replyCollector.on('collect', async replyMsg => {
                    const replyLogEmbed = new EmbedBuilder()
                        .setTitle('💬 Seseorang Membalas Confess')
                        .setDescription(`Pesan confess dari **${interaction.user.tag}** telah dibalas oleh **${replyMsg.author.tag}** (<@${replyMsg.author.id}>)`)
                        .addFields(
                            { name: 'Isi Balasan', value: replyMsg.content || '[Lampiran/Media]', inline: false },
                            { name: 'Link Pesan', value: `[Klik ke Pesan](${replyMsg.url})`, inline: true }
                        )
                        .setColor(0x3498DB)
                        .setTimestamp();

                    await logChannel.send({ embeds: [replyLogEmbed] });
                });
            }

            await interaction.editReply({ content: '✅ Pesan confess kamu berhasil dikirim secara anonim!' });

        } catch (error) {
            console.error('Error saat mengirim confess:', error);
            await interaction.editReply({ content: '❌ Terjadi kesalahan saat mengirim pesan confess.' });
        }
    }
};
