import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Inisialisasi Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default {
    data: new SlashCommandBuilder()
        .setName('quiz')
        .setDescription('Mulai event kuis AI cepat-cepatan jawab!')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        if (!interaction.guild) {
            await interaction.reply({ content: "Fitur ini cuma bisa dipakai di dalam server ya!", ephemeral: true });
            return;
        }

        // Tampilkan balasan sementara karena AI butuh beberapa detik buat mikir
        await interaction.reply({ content: "🤖 **AI sedang membuat soal kuis & gambar acak... Mohon tunggu sebentar!**", ephemeral: true });

        const channel = interaction.channel;

        try {
            // 1. Minta Gemini AI buat generate soal acak
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const prompt = `Buatkan 1 soal kuis tebak-tebakan atau pengetahuan umum/anime/game yang menarik dan acak dalam Bahasa Indonesia.
            Format respon HARUS berupa JSON murni tanpa markdown/backticks seperti ini:
            {
              "question": "Pertanyaan kuis di sini...",
              "image_keyword": "english keyword for image generator, e.g. cute cat in space",
              "options": [
                {"id": "A", "text": "Pilihan A"},
                {"id": "B", "text": "Pilihan B"},
                {"id": "C", "text": "Pilihan C"},
                {"id": "D", "text": "Pilihan D"}
              ],
              "correct": "A",
              "explanation": "Penjelasan singkat jawaban yang benar."
            }`;

            const result = await model.generateContent(prompt);
            let textResponse = result.response.text().trim();

            // Bersihkan respon jika ada format ```json ``` dari AI
            textResponse = textResponse.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
            const q = JSON.parse(textResponse);

            // 2. Bikin Gambar AI Otomatis dari Keyword AI (Menggunakan Pollinations AI Gratis)
            const generatedImageUrl = `[https://pollinations.ai/p/$](https://pollinations.ai/p/$){encodeURIComponent(q.image_keyword)}?width=800&height=500&seed=${Math.floor(Math.random() * 9999)}&nologo=true`;

            const timeLimit = 30; // 30 detik timer per soal

            const embed = new EmbedBuilder()
                .setTitle(`🧩 AI Generated Quiz`)
                .setDescription(`**${q.question}**\n\n⏱️ Waktu menjawab: **${timeLimit} detik**!\nCepat-cepatan klik tombol di bawah!`)
                .setImage(generatedImageUrl)
                .setColor(0x9B59B6)
                .setFooter({ text: 'Soal & Gambar di-generate otomatis oleh AI ✨' });

            const row = new ActionRowBuilder();
            q.options.forEach(opt => {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`quiz_ai_opt_${opt.id}`)
                        .setLabel(`${opt.id}. ${opt.text}`)
                        .setStyle(ButtonStyle.Primary)
                );
            });

            // Kirim soal kuis ke channel
            const msg = await channel.send({ embeds: [embed], components: [row] });
            await interaction.editReply({ content: "✅ Kuis AI berhasil dibuat dan dikirim ke channel!" });

            const answeredUsers = new Set();
            const scores = new Map();
            const collector = msg.createMessageComponentCollector({ time: timeLimit * 1000 });

            collector.on('collect', async i => {
                if (answeredUsers.has(i.user.id)) {
                    await i.reply({ content: "Kamu sudah menjawab soal ini!", ephemeral: true });
                    return;
                }

                answeredUsers.add(i.user.id);
                const chosenOpt = i.customId.split('_')[3];

                if (chosenOpt === q.correct) {
                    const currentScore = scores.get(i.user.id) || 0;
                    scores.set(i.user.id, currentScore + 1);

                    await i.reply({ content: `✅ **Benar sekali!** Kamu menjawab paling cepat/tepat.`, ephemeral: true });
                } else {
                    await i.reply({ content: `❌ **Jawaban salah!**`, ephemeral: true });
                }
            });

            collector.on('end', async () => {
                // Kunci tombol kalau waktu habis
                const disabledRow = new ActionRowBuilder();
                q.options.forEach(opt => {
                    disabledRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`quiz_ai_opt_${opt.id}_disabled`)
                            .setLabel(`${opt.id}. ${opt.text}`)
                            .setStyle(opt.id === q.correct ? ButtonStyle.Success : ButtonStyle.Secondary)
                            .setDisabled(true)
                    );
                });

                const timeUpEmbed = new EmbedBuilder()
                    .setTitle(`⏰ Waktu Habis!`)
                    .setDescription(`Waktu menjawab telah selesai!\n\n🔑 **Kunci Jawaban:** Jawaban yang benar adalah **${q.correct}**.\n*${q.explanation}*`)
                    .setImage(generatedImageUrl)
                    .setColor(0xFFA500);

                await msg.edit({ embeds: [timeUpEmbed], components: [disabledRow] });
            });

        } catch (error) {
            console.error("Error AI Quiz Generator:", error);
            await interaction.editReply({ content: "❌ Gagal membuat kuis AI. Pastikan `GEMINI_API_KEY` di-setting dengan benar!" });
        }
    }
};
