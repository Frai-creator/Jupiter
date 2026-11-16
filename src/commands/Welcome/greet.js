import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import greetDashboard from './modules/greet_dashboard.js';

export default {
    // Jangan set slashOnly: true, biarkan false atau kosong agar support prefix
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

    // Tambahkan executePrefix agar langsung nembak ke greetDashboard.execute
    async executePrefix(message, args, client, prefix, guildConfig) {
        try {
            if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return message.reply('You need the **Manage Server** permission to use `greet`.');
            }

            // Langsung eksekusi dashboard tanpa ribet ngecek subcommand berlapis
            return await greetDashboard.execute(message, guildConfig, client);
        } catch (error) {
            logger.error(`Error in prefix greet command: ${error.message}`);
            await message.reply('Terjadi kesalahan saat memproses perintah greet.');
        }
    }
};
