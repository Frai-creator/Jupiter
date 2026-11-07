import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';

export default {
    id: 'open_confess_modal', // Harus sama persis dengan customId di tombol
    async execute(interaction) {
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
    },
};
