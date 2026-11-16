import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import greetDashboard from './modules/greet_dashboard.js';

export default {
    slashOnly: false, // Ubah jadi false agar bisa support prefix
    data: new SlashCommandBuilder()
        .setName('greet')
        .setDescription('Manage welcome & goodbye settings')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('dashboard')
                .setDescription('Open the welcome & goodbye configuration dashboard'),
        ),

    async execute(interaction, config, client) {
        try {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need the **Manage Server** permission to use `/greet`.' });
            }

            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'dashboard':
                    return await greetDashboard.execute(interaction, config, client);
                default:
                    logger.warn(`Unknown /greet subcommand: ${subcommand}`);
            }
        } catch (error) {
            if (error instanceof TitanBotError) {
                return await replyUserError(interaction, { type: ErrorTypes.CONFIGURATION, message: error.userMessage || 'Something went wrong.' });
            }
            await handleInteractionError(interaction, error, { command: 'greet' });
        }
    },

    // Tambahan handler untuk Prefix Command (misal: a!greet dashboard)
    async executePrefix(message, args, config, client) {
        try {
            // Cek izin Manage Guild untuk user yang pakai prefix
            if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return message.reply('You need the **Manage Server** permission to use `greet`.');
            }

            const sub = args[0] ? args[0].toLowerCase() : 'dashboard'; // Default ke dashboard kalau kosong

            if (sub === 'dashboard') {
                // Karena modul greetDashboard biasanya butuh interaksi/message, 
                // kita sesuaikan pemanggilannya agar kompatibel dengan objek message
                return await greetDashboard.execute(message, config, client);
            } else {
                return message.reply('Subcommand tidak valid. Gunakan: `!greet dashboard`');
            }
        } catch (error) {
            logger.error(`Error in prefix greet command: ${error.message}`);
            await message.reply('Terjadi kesalahan saat memproses perintah.');
        }
    }
};
