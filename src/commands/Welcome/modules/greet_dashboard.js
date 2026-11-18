import { getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
    LabelBuilder,
    FileUploadBuilder,
    TextDisplayBuilder,
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { getWelcomeConfig, saveWelcomeConfig } from '../../../utils/database.js';
import { botHasPermission } from '../../../utils/permissionGuard.js';
import { buildGreetPayload, getCardSettings } from '../../../services/greetService.js';
import { CARD_THEMES, resolveTheme } from '../../../utils/welcomeCard.js';

async function deferComponent(interaction) {
    if (interaction.deferred || interaction.replied) {
        return true;
    }

    try {
        await interaction.deferUpdate();
        return true;
    } catch (error) {
        logger.debug('Component interaction expired or already acknowledged:', error.message);
        return false;
    }
}

async function sendEphemeralFollowUp(interaction, payload) {
    try {
        await interaction.followUp({
            ...payload,
            flags: MessageFlags.Ephemeral,
        });
    } catch (error) {
        logger.debug('Failed to send ephemeral follow-up:', error.message);
    }
}

function cardStatus(cfg, kind) {
    const card = getCardSettings(cfg, kind);
    return card.enabled ? `On · ${CARD_THEMES[card.theme].label}` : 'Off';
}

function buildDashboardEmbed(cfg, guild) {
    const welcomeChannel = cfg.channelId ? `<#${cfg.channelId}>` : '`Not set`';
    const goodbyeChannel = cfg.goodbyeChannelId ? `<#${cfg.goodbyeChannelId}>` : '`Not set`';

    const rawWelcome = cfg.welcomeMessage || 'Welcome {user} to {server}!';
    const rawGoodbye = cfg.leaveMessage || '{user.tag} has left the server.';
    const welcomePreview = `\`${rawWelcome.length > 55 ? rawWelcome.substring(0, 55) + '…' : rawWelcome}\``;
    const goodbyePreview = `\`${rawGoodbye.length > 55 ? rawGoodbye.substring(0, 55) + '…' : rawGoodbye}\``;

    return new EmbedBuilder()
        .setTitle('👋 Greet System Dashboard')
        .setDescription(
            `Manage welcome & goodbye settings for **${guild.name}**.\nUse the toggles to enable/disable each side, then select an option to edit.`,
        )
        .setColor(getColor('info'))
        .addFields(
            { name: 'Welcome Channel', value: welcomeChannel, inline: true },
            { name: 'Welcome Status', value: cfg.enabled ? 'Enabled' : 'Disabled', inline: true },
            { name: 'Welcome Ping', value: cfg.welcomePing ? 'On' : 'Off', inline: true },
            { name: 'Goodbye Channel', value: goodbyeChannel, inline: true },
            { name: 'Goodbye Status', value: cfg.goodbyeEnabled ? 'Enabled' : 'Disabled', inline: true },
            { name: 'Goodbye Ping', value: cfg.goodbyePing ? 'On' : 'Off', inline: true },
            { name: 'Welcome Card', value: cardStatus(cfg, 'welcome'), inline: true },
            { name: 'Goodbye Card', value: cardStatus(cfg, 'goodbye'), inline: true },
            { name: '\u200b', value: '\u200b', inline: true },
            { name: 'Welcome Message', value: welcomePreview, inline: false },
            { name: 'Goodbye Message', value: goodbyePreview, inline: false },
        )
        .setFooter({ text: 'Dashboard closes after 10 minutes of inactivity' })
        .setTimestamp();
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`greet_cfg_${guildId}`)
        .setPlaceholder('Select a setting to configure...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Welcome Channel')
                .setDescription('Set the channel where welcome messages are sent')
                .setValue('welcome_channel')
                .setEmoji('🟢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Welcome Message')
                .setDescription('Edit the text shown when a member joins')
                .setValue('welcome_message')
                .setEmoji('💬'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Welcome Image')
                .setDescription('Set the image for welcome messages')
                .setValue('welcome_image')
                .setEmoji('🖼️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Goodbye Channel')
                .setDescription('Set the channel where goodbye messages are sent')
                .setValue('goodbye_channel')
                .setEmoji('🔴'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Goodbye Message')
                .setDescription('Edit the text shown when a member leaves')
                .setValue('goodbye_message')
                .setEmoji('💬'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Goodbye Image')
                .setDescription('Set the image for goodbye messages')
                .setValue('goodbye_image')
                .setEmoji('🖼️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Welcome Card Style')
                .setDescription('Theme, title and subtitle of the welcome banner')
                .setValue('welcome_card')
                .setEmoji('🎨'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Goodbye Card Style')
                .setDescription('Theme, title and subtitle of the goodbye banner')
                .setValue('goodbye_card')
                .setEmoji('🎨'),
        );
}

function buildButtonRow(cfg, guildId, disabled = false) {
    const welcomeOn = cfg.enabled === true;
    const goodbyeOn = cfg.goodbyeEnabled === true;
    const welcomePingOn = cfg.welcomePing === true;
    const goodbyePingOn = cfg.goodbyePing === true;
    
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`greet_cfg_toggle_welcome_${guildId}`)
                .setLabel('Welcome')
                .setStyle(welcomeOn ? ButtonStyle.Success : ButtonStyle.Danger)
                .setEmoji('🟢')
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId(`greet_cfg_toggle_goodbye_${guildId}`)
                .setLabel('Goodbye')
                .setStyle(goodbyeOn ? ButtonStyle.Success : ButtonStyle.Danger)
                .setEmoji('🔴')
                .setDisabled(disabled),
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`greet_cfg_ping_welcome_${guildId}`)
                .setLabel('Ping Welcome')
                .setStyle(welcomePingOn ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('🔔')
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId(`greet_cfg_ping_goodbye_${guildId}`)
                .setLabel('Ping Goodbye')
                .setStyle(goodbyePingOn ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('🔔')
                .setDisabled(disabled),
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`greet_cfg_card_welcome_${guildId}`)
                .setLabel('Welcome Card')
                .setStyle(getCardSettings(cfg, 'welcome').enabled ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('🖼️')
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId(`greet_cfg_card_goodbye_${guildId}`)
                .setLabel('Goodbye Card')
                .setStyle(getCardSettings(cfg, 'goodbye').enabled ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('🖼️')
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId(`greet_cfg_preview_welcome_${guildId}`)
                .setLabel('Preview Welcome')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('👁️')
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId(`greet_cfg_preview_goodbye_${guildId}`)
                .setLabel('Preview Goodbye')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('👁️')
                .setDisabled(disabled),
        ),
    ];
}

async function refreshDashboard(rootInteraction, cfg, guildId) {
    try {
        const selectMenu = buildSelectMenu(guildId);
        await InteractionHelper.safeEditReply(rootInteraction, {
            embeds: [buildDashboardEmbed(cfg, rootInteraction.guild)],
            components: [
                ...buildButtonRow(cfg, guildId),
                new ActionRowBuilder().addComponents(selectMenu),
            ],
        });
    } catch (error) {
        logger.debug('Could not refresh greet dashboard (interaction may have expired):', error.message);
    }
}

export default {
    prefixOnly: false,
    async execute(interaction, config, client) {
        try {
            const guildId = interaction.guild.id;
            const cfg = await getWelcomeConfig(client, guildId);

            if (!cfg.channelId && !cfg.goodbyeChannelId) {
                throw new TitanBotError(
                    'Greet system not configured',
                    ErrorTypes.CONFIGURATION,
                    'Neither Welcome nor Goodbye has been set up yet. Run `/welcome setup` or `/goodbye setup` first.',
                );
            }

            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!interaction.deferred) {
                return;
            }

            const selectMenu = buildSelectMenu(guildId);

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [buildDashboardEmbed(cfg, interaction.guild)],
                components: [
                    ...buildButtonRow(cfg, guildId),
                    new ActionRowBuilder().addComponents(selectMenu),
                ],
            });

            const collector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: i =>
                    i.user.id === interaction.user.id && i.customId === `greet_cfg_${guildId}`,
                time: 600_000,
            });

            collector.on('collect', async selectInteraction => {
                const selectedOption = selectInteraction.values[0];
                try {
                    switch (selectedOption) {
                        case 'welcome_channel':
                            await handleWelcomeChannel(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'welcome_message':
                            await handleWelcomeMessage(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'welcome_image':
                            await handleWelcomeImage(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'goodbye_channel':
                            await handleGoodbyeChannel(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'goodbye_message':
                            await handleGoodbyeMessage(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'goodbye_image':
                            await handleGoodbyeImage(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'welcome_card':
                            await handleCardStyle('welcome', selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'goodbye_card':
                            await handleCardStyle('goodbye', selectInteraction, interaction, cfg, guildId, client);
                            break;
                    }
                } catch (error) {
                    if (error instanceof TitanBotError) {
                        logger.debug(`Greet config validation error: ${error.message}`);
                    } else {
                        logger.error('Unexpected greet dashboard error:', error);
                    }

                    const errorMessage =
                        error instanceof TitanBotError
                            ? error.userMessage || 'An error occurred while processing your selection.'
                            : 'An unexpected error occurred while updating the configuration.';

                    if (!selectInteraction.replied && !selectInteraction.deferred) {
                        await selectInteraction.deferUpdate().catch(() => {});
                    }

                    await replyUserError(selectInteraction, {
                        type: ErrorTypes.CONFIGURATION,
                        message: errorMessage,
                    }).catch(() => {});
                }
            });

            const btnCollector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.Button,
                filter: i =>
                    i.user.id === interaction.user.id &&
                    (i.customId === `greet_cfg_toggle_welcome_${guildId}` ||
                        i.customId === `greet_cfg_toggle_goodbye_${guildId}` ||
                        i.customId === `greet_cfg_ping_welcome_${guildId}` ||
                        i.customId === `greet_cfg_ping_goodbye_${guildId}` ||
                        i.customId === `greet_cfg_card_welcome_${guildId}` ||
                        i.customId === `greet_cfg_card_goodbye_${guildId}` ||
                        i.customId === `greet_cfg_preview_welcome_${guildId}` ||
                        i.customId === `greet_cfg_preview_goodbye_${guildId}`),
                time: 600_000,
            });

            btnCollector.on('collect', async btnInteraction => {
                try {
                    if (!await deferComponent(btnInteraction)) {
                        return;
                    }

                    const customId = btnInteraction.customId;

                    if (customId === `greet_cfg_toggle_welcome_${guildId}`) {
                        cfg.enabled = !cfg.enabled;
                        await saveWelcomeConfig(client, guildId, cfg);
                        await sendEphemeralFollowUp(btnInteraction, {
                            embeds: [
                                successEmbed(
                                    '✅ Welcome Updated',
                                    `Welcome messages are now **${cfg.enabled ? 'enabled' : 'disabled'}**.`,
                                ),
                            ],
                        });
                    } else if (customId === `greet_cfg_toggle_goodbye_${guildId}`) {
                        cfg.goodbyeEnabled = !cfg.goodbyeEnabled;
                        await saveWelcomeConfig(client, guildId, cfg);
                        await sendEphemeralFollowUp(btnInteraction, {
                            embeds: [
                                successEmbed(
                                    '✅ Goodbye Updated',
                                    `Goodbye messages are now **${cfg.goodbyeEnabled ? 'enabled' : 'disabled'}**.`,
                                ),
                            ],
                        });
                    } else if (customId === `greet_cfg_ping_welcome_${guildId}`) {
                        cfg.welcomePing = !cfg.welcomePing;
                        await saveWelcomeConfig(client, guildId, cfg);
                        await sendEphemeralFollowUp(btnInteraction, {
                            embeds: [
                                successEmbed(
                                    '✅ Welcome Ping Updated',
                                    `Joining users will${cfg.welcomePing ? '' : ' **not**'} be pinged in the welcome message.`,
                                ),
                            ],
                        });
                    } else if (customId === `greet_cfg_ping_goodbye_${guildId}`) {
                        cfg.goodbyePing = !cfg.goodbyePing;
                        await saveWelcomeConfig(client, guildId, cfg);
                        await sendEphemeralFollowUp(btnInteraction, {
                            embeds: [
                                successEmbed(
                                    '✅ Goodbye Ping Updated',
                                    `Leaving users will${cfg.goodbyePing ? '' : ' **not**'} be pinged in the goodbye message.`,
                                ),
                            ],
                        });
                    } else if (customId === `greet_cfg_card_welcome_${guildId}` || customId === `greet_cfg_card_goodbye_${guildId}`) {
                        const isGoodbye = customId.includes('_card_goodbye_');
                        const key = isGoodbye ? 'leaveCard' : 'welcomeCard';
                        const current = getCardSettings(cfg, isGoodbye ? 'goodbye' : 'welcome');
                        cfg[key] = { ...(cfg[key] || {}), enabled: !current.enabled };
                        await saveWelcomeConfig(client, guildId, cfg);
                        await sendEphemeralFollowUp(btnInteraction, {
                            embeds: [
                                successEmbed(
                                    `✅ ${isGoodbye ? 'Goodbye' : 'Welcome'} Card Updated`,
                                    `The ${isGoodbye ? 'goodbye' : 'welcome'} banner image is now **${!current.enabled ? 'enabled' : 'disabled'}**.`,
                                ),
                            ],
                        });
                    } else if (customId === `greet_cfg_preview_welcome_${guildId}` || customId === `greet_cfg_preview_goodbye_${guildId}`) {
                        const kind = customId.includes('_preview_goodbye_') ? 'goodbye' : 'welcome';
                        try {
                            const payload = await buildGreetPayload(kind, btnInteraction.member ?? interaction.member, cfg, { preview: true });
                            await sendEphemeralFollowUp(btnInteraction, payload);
                        } catch (previewError) {
                            logger.error('Failed to build greet preview:', previewError);
                            await sendEphemeralFollowUp(btnInteraction, { content: 'Could not generate the preview. Please try again.' });
                        }
                        return;
                    }

                    await refreshDashboard(interaction, cfg, guildId);
                } catch (error) {
                    logger.error('Error handling greet dashboard button:', error);
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    btnCollector.stop();
                    try {
                        await InteractionHelper.safeEditReply(interaction, {
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle('Dashboard Timed Out')
                                    .setDescription('This dashboard has been closed due to inactivity. Please run the command again to continue.')
                                    .setColor(getColor('error'))
                            ],
                            components: [],
                        });
                    } catch (error) {
                        logger.debug('Could not update dashboard on timeout:', error.message);
                    }
                }
            });
        } catch (error) {
            if (error instanceof TitanBotError) throw error;
            logger.error('Unexpected error in greet_dashboard:', error);
            throw new TitanBotError(
                `Greet dashboard failed: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'Failed to open the greet dashboard.',
            );
        }
    },
};

async function handleWelcomeChannel(selectInteraction, rootInteraction, cfg, guildId, client) {
    if (!await deferComponent(selectInteraction)) {
        return;
    }

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('greet_cfg_welcome_channel')
        .setPlaceholder('Select a text channel...')
        .addChannelTypes(ChannelType.GuildText)
        .setMaxValues(1);

    await sendEphemeralFollowUp(selectInteraction, {
        embeds: [
            new EmbedBuilder()
                .setTitle('🟢 Welcome Channel')
                .setDescription(
                    `**Current:** ${cfg.channelId ?`<#${cfg.channelId}>`: '`Not set`'}\n\nSelect the channel where welcome messages will be sent.`,
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(channelSelect)],
    });

    const chanCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'greet_cfg_welcome_channel',
        time: 60_000,
        max: 1,
    });

    chanCollector.on('collect', async chanInteraction => {
        if (!await deferComponent(chanInteraction)) {
            return;
        }
        const channel = chanInteraction.channels.first();

        if (!botHasPermission(channel, ['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
            await replyUserError(chanInteraction, {
                type: ErrorTypes.PERMISSION,
                message: `I need **View Channel**, **Send Messages**, and **Embed Links** in ${channel}.`,
            });
            return;
        }

        cfg.channelId = channel.id;
        await saveWelcomeConfig(client, guildId, cfg);

        await sendEphemeralFollowUp(chanInteraction, {
            embeds: [successEmbed('Channel Updated', `Welcome messages will now be sent in ${channel}.`)],
        });

        await refreshDashboard(rootInteraction, cfg, guildId);
    });

    chanCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'No channel was selected. The setting was not changed.',
            }).catch(() => {});
        }
    });
}

async function handleWelcomeMessage(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('greet_cfg_welcome_message')
        .setTitle('Edit Welcome Message')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('message_input')
                    .setLabel('Message (variables: {user}, {server}, etc)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(cfg.welcomeMessage || 'Welcome {user} to {server}!')
                    .setMaxLength(2000)
                    .setMinLength(1)
                    .setRequired(true),
            ),
        );

    try {
        await selectInteraction.showModal(modal);
    } catch {
        return;
    }

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'greet_cfg_welcome_message' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    cfg.welcomeMessage = submitted.fields.getTextInputValue('message_input').trim();
    await saveWelcomeConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [successEmbed('Welcome Message Updated', 'The welcome message has been saved.')],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleWelcomeImage(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('greet_cfg_welcome_image')
        .setTitle('Set Welcome Image');

    const imageHint = new TextDisplayBuilder()
        .setContent('Provide a direct image URL **or** upload a file below. If both are given, the uploaded file takes priority. Leave the URL blank and skip the upload to remove the image.');

    const urlLabel = new LabelBuilder()
        .setLabel('Image URL (optional)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('image_input')
                .setPlaceholder('https://example.com/welcome.png')
                .setStyle(TextInputStyle.Short)
                .setValue(cfg.welcomeImage || '')
                .setRequired(false),
        );

    const uploadLabel = new LabelBuilder()
        .setLabel('Or upload an image file (optional)')
        .setFileUploadComponent(
            new FileUploadBuilder()
                .setCustomId('image_upload')
                .setRequired(false),
        );

    modal
        .addTextDisplayComponents(imageHint)
        .addLabelComponents(urlLabel, uploadLabel);

    try {
        await selectInteraction.showModal(modal);
    } catch {
        return;
    }

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'greet_cfg_welcome_image' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const uploadedFiles = submitted.fields.getUploadedFiles('image_upload');
    let imageUrl = uploadedFiles?.at(0)?.url ?? submitted.fields.getTextInputValue('image_input').trim();

    if (imageUrl) {
        try {
            new URL(imageUrl);
            if (!['http:', 'https:'].includes(new URL(imageUrl).protocol)) {
                await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Image URL must start with `http://` or `https://`.' });
                return;
            }
        } catch {
            await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Please provide a valid image URL.' });
            return;
        }
    }

    cfg.welcomeImage = imageUrl || null;
    await saveWelcomeConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [successEmbed('Welcome Image Updated', `Image ${imageUrl ? 'updated' : 'removed'} successfully.`)],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleWelcomePing(selectInteraction, rootInteraction, cfg, guildId, client) {
    if (!await deferComponent(selectInteraction)) {
        return;
    }

    cfg.welcomePing = !cfg.welcomePing;
    await saveWelcomeConfig(client, guildId, cfg);

    await sendEphemeralFollowUp(selectInteraction, {
        embeds: [
            successEmbed(
                '✅ Welcome Ping Updated',
                `Joining users will${cfg.welcomePing ? '' : ' **not**'} be pinged in the welcome message.`,
            ),
        ],
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleGoodbyeChannel(selectInteraction, rootInteraction, cfg, guildId, client) {
    if (!await deferComponent(selectInteraction)) {
        return;
    }

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('greet_cfg_goodbye_channel')
        .setPlaceholder('Select a text channel...')
        .addChannelTypes(ChannelType.GuildText)
        .setMaxValues(1);

    await sendEphemeralFollowUp(selectInteraction, {
        embeds: [
            new EmbedBuilder()
                .setTitle('🔴 Goodbye Channel')
                .setDescription(
                    `**Current:** ${cfg.goodbyeChannelId ?`<#${cfg.goodbyeChannelId}>`: '`Not set`'}\n\nSelect the channel where goodbye messages will be sent.`,
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(channelSelect)],
    });

    const chanCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'greet_cfg_goodbye_channel',
        time: 60_000,
        max: 1,
    });

    chanCollector.on('collect', async chanInteraction => {
        if (!await deferComponent(chanInteraction)) {
            return;
        }
        const channel = chanInteraction.channels.first();

        if (!botHasPermission(channel, ['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
            await replyUserError(chanInteraction, {
                type: ErrorTypes.PERMISSION,
                message: `I need **View Channel**, **Send Messages**, and **Embed Links** in ${channel}.`,
            });
            return;
        }

        cfg.goodbyeChannelId = channel.id;
        await saveWelcomeConfig(client, guildId, cfg);

        await sendEphemeralFollowUp(chanInteraction, {
            embeds: [successEmbed('Channel Updated', `Goodbye messages will now be sent in ${channel}.`)],
        });

        await refreshDashboard(rootInteraction, cfg, guildId);
    });

    chanCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'No channel was selected. The setting was not changed.',
            }).catch(() => {});
        }
    });
}

async function handleGoodbyeMessage(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('greet_cfg_goodbye_message')
        .setTitle('Edit Goodbye Message')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('message_input')
                    .setLabel('Message (variables: {user}, {server}, etc)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(cfg.leaveMessage || '{user.tag} has left the server.')
                    .setMaxLength(2000)
                    .setMinLength(1)
                    .setRequired(true),
            ),
        );

    try {
        await selectInteraction.showModal(modal);
    } catch {
        return;
    }

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'greet_cfg_goodbye_message' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    cfg.leaveMessage = submitted.fields.getTextInputValue('message_input').trim();
    await saveWelcomeConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [successEmbed('Goodbye Message Updated', 'The goodbye message has been saved.')],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleGoodbyeImage(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('greet_cfg_goodbye_image')
        .setTitle('Set Goodbye Image');

    const imageHint = new TextDisplayBuilder()
        .setContent('Provide a direct image URL **or** upload a file below. If both are given, the uploaded file takes priority. Leave the URL blank and skip the upload to remove the image.');

    const urlLabel = new LabelBuilder()
        .setLabel('Image URL (optional)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('image_input')
                .setPlaceholder('https://example.com/goodbye.png')
                .setStyle(TextInputStyle.Short)
                .setValue(
                    typeof cfg.leaveEmbed?.image === 'string'
                        ? cfg.leaveEmbed.image
                        : cfg.leaveEmbed?.image?.url || ''
                )
                .setRequired(false),
        );

    const uploadLabel = new LabelBuilder()
        .setLabel('Or upload an image file (optional)')
        .setFileUploadComponent(
            new FileUploadBuilder()
                .setCustomId('image_upload')
                .setRequired(false),
        );

    modal
        .addTextDisplayComponents(imageHint)
        .addLabelComponents(urlLabel, uploadLabel);

    try {
        await selectInteraction.showModal(modal);
    } catch {
        return;
    }

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'greet_cfg_goodbye_image' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const uploadedFiles = submitted.fields.getUploadedFiles('image_upload');
    let imageUrl = uploadedFiles?.at(0)?.url ?? submitted.fields.getTextInputValue('image_input').trim();

    if (imageUrl) {
        try {
            new URL(imageUrl);
            if (!['http:', 'https:'].includes(new URL(imageUrl).protocol)) {
                await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Image URL must start with `http://` or `https://`.' });
                return;
            }
        } catch {
            await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Please provide a valid image URL.' });
            return;
        }
    }

    const nextLeaveEmbed = { ...(cfg.leaveEmbed || {}) };
    if (imageUrl) {
        nextLeaveEmbed.image = imageUrl;
    } else {
        delete nextLeaveEmbed.image;
    }

    cfg.leaveEmbed = nextLeaveEmbed;
    await saveWelcomeConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [successEmbed('Goodbye Image Updated', `Image ${imageUrl ? 'updated' : 'removed'} successfully.`)],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleGoodbyePing(selectInteraction, rootInteraction, cfg, guildId, client) {
    if (!await deferComponent(selectInteraction)) {
        return;
    }

    cfg.goodbyePing = !cfg.goodbyePing;
    await saveWelcomeConfig(client, guildId, cfg);

    await sendEphemeralFollowUp(selectInteraction, {
        embeds: [
            successEmbed(
                '✅ Goodbye Ping Updated',
                `Leaving users will${cfg.goodbyePing ? '' : ' **not**'} be pinged in the goodbye message.`,
            ),
        ],
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleCardStyle(kind, selectInteraction, rootInteraction, cfg, guildId, client) {
    const isGoodbye = kind === 'goodbye';
    const key = isGoodbye ? 'leaveCard' : 'welcomeCard';
    const modalId = `greet_cfg_${kind}_card`;
    const current = getCardSettings(cfg, kind);

    const modal = new ModalBuilder()
        .setCustomId(modalId)
        .setTitle(`${isGoodbye ? 'Goodbye' : 'Welcome'} Card Style`)
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('card_theme')
                    .setLabel(`Theme: ${Object.keys(CARD_THEMES).join(', ')}`)
                    .setStyle(TextInputStyle.Short)
                    .setValue(current.theme)
                    .setMaxLength(20)
                    .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('card_title')
                    .setLabel('Small title on the card')
                    .setStyle(TextInputStyle.Short)
                    .setValue(String(current.title).slice(0, 28))
                    .setMaxLength(28)
                    .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('card_subtitle')
                    .setLabel('Line under the name ({server}, {username}...)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(String(current.subtitle ?? '').slice(0, 80))
                    .setMaxLength(80)
                    .setRequired(false),
            ),
        );

    try {
        await selectInteraction.showModal(modal);
    } catch {
        return;
    }

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === modalId && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const themeInput = submitted.fields.getTextInputValue('card_theme').trim().toLowerCase();
    if (!CARD_THEMES[themeInput]) {
        await replyUserError(submitted, {
            type: ErrorTypes.VALIDATION,
            message: `Unknown theme. Choose one of: ${Object.keys(CARD_THEMES).map(t => `\`${t}\``).join(', ')}.`,
        });
        return;
    }

    cfg[key] = {
        ...(cfg[key] || {}),
        theme: resolveTheme(themeInput),
        title: submitted.fields.getTextInputValue('card_title').trim() || current.title,
        subtitle: submitted.fields.getTextInputValue('card_subtitle').trim(),
    };
    await saveWelcomeConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [successEmbed(`${isGoodbye ? 'Goodbye' : 'Welcome'} Card Updated`, 'Card style saved. Use the **Preview** buttons to see it.')],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}
