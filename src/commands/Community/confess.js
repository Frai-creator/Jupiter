import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const CONFESSION_CHANNEL_ID = '1568453562818629837'; // Ganti ID channel tujuan

export default {
    data: new SlashCommandBuilder()
        .setName('confess')
        .setDescription('Kirim confession anonim ke channel khusus')
        .addStringOption(option =>
            option.setName('pesan')
                .setDescription('Pesan confession yang mau dikirim')
                .setRequired(true)
        ),
    async execute(interaction) {
        if (!interaction.guild) {
            await interaction.reply({ content: "Fitur ini cuma bisa dipakai di dalam server ya!", ephemeral: true });
            return;
        }

        const pesan = interaction.options.getString('pesan');
        const channel = interaction.client.channels.cache.get(CONFESSION_CHANNEL_ID);

        if (!channel) {
            await interaction.reply({ content: "Waduh, channel confession-nya gak ketemu! Coba lapor admin.", ephemeral: true });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle('💌 New Confession')
            .setDescription(pesan)
            .setColor(0xFFB6C1)
            .setFooter({ text: 'Kirim confession kamu pakai /confess secara anonim!' });

        try {
            await channel.send({ embeds: [embed] });
            await interaction.reply({ content: "Sip! Confession kamu berhasil dikirim secara anonim. ✨", ephemeral: true });
        } catch (error) {
            await interaction.reply({ content: `Gagal ngirim confession: ${error.message}`, ephemeral: true });
        }
    },
};
