import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';

// Daftar Soal Quiz (Bisa kamu tambah/ubah sesuka hati)
const quizQuestions = [
    {
        question: "Siapakah karakter di bawah ini?",
        image: "https://i.imgur.com/813u3PN.png", // Ganti link gambar soal ke-1
        options: [
            { id: 'A', text: 'Jett (Valorant)' },
            { id: 'B', text: 'Raiden Shogun (Genshin)' },
            { id: 'C', text: 'Yae Miko' },
            { id: 'D', text: 'Vero' }
        ],
        correct: 'A',
        explanation: 'Jawaban yang benar adalah **A) Jett (Valorant)**!'
    },
    {
        question: "Apa nama framework bot yang sedang kita pakai?",
        image: "https://i.imgur.com/example2.png", // Ganti link gambar soal ke-2
        options: [
            { id: 'A', text: 'Python' },
            { id: 'B', text: 'Discord.js (Node.js)' },
            { id: 'C', text: 'React.js' },
            { id: 'D', text: 'Ruby' }
        ],
        correct: 'B',
        explanation: 'Jawaban yang benar adalah **B) Discord.js (Node.js)**!'
    }
];

export default {
    data: new SlashCommandBuilder()
        .setName('quiz')
        .setDescription('Mulai event kuis cepat-cepatan jawab berhadiah!')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        if (!interaction.guild) {
            await interaction.reply({ content: "Fitur ini cuma bisa dipakai di dalam server ya!", ephemeral: true });
            return;
        }

        await interaction.reply({ content: "🎮 **Event Quiz dimulai!** Soal pertama akan segera dikirim...", ephemeral: true });

        const channel = interaction.channel;
        let currentQuestionIndex = 0;
        const scores = new Map(); // Menyimpan skor peserta (userId -> poin)

        const sendNextQuestion = async () => {
            if (currentQuestionIndex >= quizQuestions.length) {
                // Quiz Selesai, tampilkan Leaderboard
                const sortedScores = [...scores.entries()].sort((a, b) => b[1] - a[1]);
                let leaderboardText = sortedScores.length > 0 
                    ? sortedScores.map(([userId, score], index) => `**#${index + 1}** <@${userId}> — **${score} Poin**`).join('\n')
                    : '_(Belum ada yang menjawab dengan benar)_';

                const endEmbed = new EmbedBuilder()
                    .setTitle('🎉 EVENT QUIZ SELESAI!')
                    .setDescription(`Terima kasih semuanya yang sudah ikut berpartisipasi!\n\n🏆 **Leaderboard Pemenang:**\n${leaderboardText}`)
                    .setColor(0x00FF00)
                    .setTimestamp();

                await channel.send({ embeds: [endEmbed] });
                return;
            }

            const q = quizQuestions[currentQuestionIndex];
            const timeLimit = 30; // Waktu 30 detik per soal

            const embed = new EmbedBuilder()
                .setTitle(`🧩 Soal Kuis #${currentQuestionIndex + 1} / ${quizQuestions.length}`)
                .setDescription(`**${q.question}**\n\n⏱️ Waktu menjawab: **${timeLimit} detik**!\nCepat-cepatan klik tombol di bawah!`)
                .setImage(q.image)
                .setColor(0xFFB6C1)
                .setFooter({ text: 'Pilih jawaban yang paling tepat!' });

            // Membuat tombol pilihan ganda (A, B, C, D)
            const row = new ActionRowBuilder();
            q.options.forEach(opt => {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`quiz_opt_${opt.id}`)
                        .setLabel(opt.id)
                        .setStyle(ButtonStyle.Primary)
                );
            });

            const msg = await channel.send({ embeds: [embed], components: [row] });

            const answeredUsers = new Set();
            let correctAnswerUser = null;

            const collector = msg.createMessageComponentCollector({ time: timeLimit * 1000 });

            collector.on('collect', async i => {
                if (answeredUsers.has(i.user.id)) {
                    await i.reply({ content: "Kamu sudah menjawab soal ini sebelumnya!", ephemeral: true });
                    return;
                }

                answeredUsers.add(i.user.id);
                const chosenOpt = i.customId.split('_')[2];

                if (chosenOpt === q.correct) {
                    // Jika benar, catat poin
                    const currentScore = scores.get(i.user.id) || 0;
                    scores.set(i.user.id, currentScore + 1);
                    correctAnswerUser = i.user;

                    await i.reply({ content: `✅ **Benar!** Kamu mendapatkan poin.`, ephemeral: true });
                    collector.stop('correct_answered'); // Langsung hentikan waktu karena udah ada yang benar (atau bisa dilanjutin sampai waktu habis)
                } else {
                    await i.reply({ content: `❌ **Kurang tepat!** Coba lagi atau tunggu soal berikutnya.`, ephemeral: true });
                }
            });

            collector.on('end', async (collected, reason) => {
                // Matikan semua tombol setelah waktu habis / ada yang benar
                const disabledRow = new ActionRowBuilder();
                q.options.forEach(opt => {
                    disabledRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`quiz_opt_${opt.id}_disabled`)
                            .setLabel(opt.id)
                            .setStyle(opt.id === q.correct ? ButtonStyle.Success : ButtonStyle.Secondary)
                            .setDisabled(true)
                    );
                });

                const timeUpEmbed = new EmbedBuilder()
                    .setTitle(`⏰ Waktu Habis - Soal #${currentQuestionIndex + 1}`)
                    .setDescription(`Waktu menjawab telah selesai!\n\n🔑 ${q.explanation}`)
                    .setImage(q.image)
                    .setColor(0xFFA500);

                await msg.edit({ embeds: [timeUpEmbed], components: [disabledRow] });

                // Jeda 3 detik sebelum lanjut ke soal berikutnya
                currentQuestionIndex++;
                setTimeout(sendNextQuestion, 3000);
            });
        };

        // Mulai soal pertama
        sendNextQuestion();
    }
};
