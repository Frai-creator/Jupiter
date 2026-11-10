import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';

// Daftar Soal Quiz (Ganti `image` dengan link gambar asli/valid, misal upload dulu ke Discord lalu salin link gambarnya)
const quizQuestions = [
    {
        question: "Siapakah karakter di bawah ini?",
        image: "https://media.discordapp.net/attachments/...", // Ganti pakai link gambar asli
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
        image: "https://media.discordapp.net/attachments/...", // Ganti pakai link gambar asli
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

// Fungsi untuk mengacak urutan soal (Randomizer)
function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

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

        await interaction.reply({ content: "🎮 **Event Quiz dimulai!** Soal diacak dan akan segera dikirim...", ephemeral: true });

        const channel = interaction.channel;
        let currentQuestionIndex = 0;
        const scores = new Map();

        // Acak soal setiap kali command /quiz dijalankan
        const randomizedQuestions = shuffleArray(quizQuestions);

        const sendNextQuestion = async () => {
            if (currentQuestionIndex >= randomizedQuestions.length) {
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

            const q = randomizedQuestions[currentQuestionIndex];
            const timeLimit = 30; // 30 detik

            const embed = new EmbedBuilder()
                .setTitle(`🧩 Soal Kuis #${currentQuestionIndex + 1} / ${randomizedQuestions.length}`)
                .setDescription(`**${q.question}**\n\n⏱️ Waktu menjawab: **${timeLimit} detik**!\nCepat-cepatan klik tombol di bawah!`)
                .setColor(0xFFB6C1)
                .setFooter({ text: 'Pilih jawaban yang paling tepat!' });

            // Hanya pasang gambar jika link-nya valid / ada isinya
            if (q.image && q.image.startsWith('http')) {
                embed.setImage(q.image);
            }

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
            const collector = msg.createMessageComponentCollector({ time: timeLimit * 1000 });

            collector.on('collect', async i => {
                if (answeredUsers.has(i.user.id)) {
                    await i.reply({ content: "Kamu sudah menjawab soal ini sebelumnya!", ephemeral: true });
                    return;
                }

                answeredUsers.add(i.user.id);
                const chosenOpt = i.customId.split('_')[2];

                if (chosenOpt === q.correct) {
                    const currentScore = scores.get(i.user.id) || 0;
                    scores.set(i.user.id, currentScore + 1);

                    await i.reply({ content: `✅ **Benar!** Kamu mendapatkan poin.`, ephemeral: true });
                } else {
                    await i.reply({ content: `❌ **Kurang tepat!**`, ephemeral: true });
                }
            });

            collector.on('end', async (collected, reason) => {
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
                    .setColor(0xFFA500);

                if (q.image && q.image.startsWith('http')) {
                    timeUpEmbed.setImage(q.image);
                }

                await msg.edit({ embeds: [timeUpEmbed], components: [disabledRow] });

                currentQuestionIndex++;
                setTimeout(sendNextQuestion, 3000);
            });
        };

        sendNextQuestion();
    }
};
