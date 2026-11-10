import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';

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

        await interaction.reply({ content: "🤖 **AI sedang meracik soal kuis & gambar acak... Mohon tunggu sebentar!**", ephemeral: true });

        const channel = interaction.channel;

        try {
            // Meminta soal kuis ke AI Text gratis via Pollinations
            const prompt = `Buatkan 1 soal kuis pengetahuan umum / anime / game yang menarik dan acak dalam Bahasa Indonesia.
            Format respon HARUS berupa JSON murni tanpa markdown/backticks, dengan struktur persis seperti ini:
            {
              "question": "Pertanyaan kuis di sini...",
              "image_keyword": "english keyword for image generator, e.g. futuristic cyberpunk city",
              "options": [
                {"id": "A", "text": "Pilihan A"},
                {"id": "B", "text": "Pilihan B"},
                {"id": "C", "text": "Pilihan C"},
                {"id": "D", "text": "Pilihan D"}
              ],
              "correct": "A",
              "explanation": "Penjelasan singkat jawaban yang benar."
            }`;

            const aiRes = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai&json=true`);
            const rawText = await aiRes.text();
            
            // Bersihkan format jika ada markdown
            const cleanJson = rawText.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
            const q = JSON.parse(cleanJson);

            const generatedImageUrl = `[https://pollinations.ai/p/$](https://pollinations.ai/p/$){encodeURIComponent(q.image_keyword)}?width=800&height=500&seed=${Math.floor(Math.random() * 9999)}&nologo=true`;
            const timeLimit = 30;

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

            const msg = await channel.send({ embeds: [embed], components: [row] });
            await interaction.editReply({ content: "✅ Kuis AI berhasil dibuat dan dikirim ke channel!" });

            const answeredUsers = new Set();
            const collector = msg.createMessageComponentCollector({ time: timeLimit * 1000 });

            collector.on('collect', async i => {
                if (answeredUsers.has(i.user.id)) {
                    await i.reply({ content: "Kamu sudah menjawab soal ini!", ephemeral: true });
                    return;
                }

                answeredUsers.add(i.user.id);
                const chosenOpt = i.customId.split('_')[3];

                if (chosenOpt === q.correct) {
                    await i.reply({ content: `✅ **Benar sekali!** Jawaban kamu tepat.`, ephemeral: true });
                } else {
                    await i.reply({ content: `❌ **Jawaban salah!**`, ephemeral: true });
                }
            });

            collector.on('end', async () => {
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
                    .setDescription(`Waktu menjawab telah selesai!\n\n🔑 **Kunci Jawaban:** **${q.correct}**\n*${q.explanation}*`)
                    .setImage(generatedImageUrl)
                    .setColor(0xFFA500);

                await msg.edit({ embeds: [timeUpEmbed], components: [disabledRow] });
            });

        } catch (error) {
            console.error("Error AI Quiz Generator:", error);
            await interaction.editReply({ content: "❌ Gagal membuat kuis AI. Coba lagi beberapa saat lagi!" });
        }
    }
};
