import { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';

const CONFESSION_CHANNEL_ID = '1568453562818629837'; // Ganti pakai ID channel tujuan hasil confession dikirim

export default (client) => {
    // 1. Ketika tombol "Kirim Confession" ditekan, munculkan Pop-up Modal
    client.on('interactionCreate', async (interaction) => {
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
        }

        // 2. Ketika user men-submit modal confession
        if (interaction.isModalSubmit() && interaction.customId === 'confess_modal') {
            const pesan = interaction.fields.getTextInputValue('confess_message');
            const targetChannel = interaction.client.channels.cache.get(CONFESSION_CHANNEL_ID);

            if (!targetChannel) {
                await interaction.reply({ content: "Waduh, channel tujuan confession belum disetting dengan benar oleh admin!", ephemeral: true });
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('💌 New Confession')
                .setDescription(pesan)
                .setColor(0xFFB6C1)
                .setFooter({ text: 'Kirim confession kamu secara anonim lewat panel server!' })
                .setTimestamp();

            try {
                await targetChannel.send({ embeds: [embed] });
                await interaction.reply({ content: "Sip! Confession kamu berhasil dikirim secara anonim ke channel tujuan. ✨", ephemeral: true });
            } catch (error) {
                await interaction.reply({ content: `Gagal ngirim confession: ${error.message}`, ephemeral: true });
            }
        }
    });
};
