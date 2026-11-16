import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  FileUploadBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { deleteFromDb, getFromDb, setInDb } from '../utils/database.js';
import { logger } from '../utils/logger.js';

/* ───────────────────────── Konstanta ───────────────────────── */

export const COLORS = {
  confession: 0xffb6c1, // pink
  reply: 0x5865f2, // blurple
  success: 0x57f287,
  error: 0xed4245,
  log: 0xffa500,
};

export const IDS = {
  open: 'confess_open',
  reply: 'confess_reply',
  submit: 'confess_submit',
  replySubmit: 'confess_reply_submit',
  report: 'confess_report',
  reportSubmit: 'confess_report_submit',
  staffDelete: 'confess_staff_delete',
  staffDismiss: 'confess_staff_dismiss',
};

const FIELDS = { text: 'confess_text', image: 'confess_image', reason: 'confess_reason' };
const REPORT_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB (aman untuk semua level server)
const IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};
const COOLDOWN_MS = 30_000;
const NO_PINGS = { parse: [] };

/* ───────────────────────── Penyimpanan ───────────────────────── */

const configKey = (guildId) => `guild:${guildId}:confess:config`;
const counterKey = (guildId) => `guild:${guildId}:confess:counter`;
const postKey = (guildId, number) => `guild:${guildId}:confess:post:${number}`;

export const getConfessConfig = (guildId) => getFromDb(configKey(guildId), null);
export const saveConfessConfig = (guildId, config) => setInDb(configKey(guildId), config);
export const setConfessCounter = (guildId, value) => setInDb(counterKey(guildId), value);
const getPost = (guildId, number) => getFromDb(postKey(guildId, number), null);
const savePost = (guildId, post) => setInDb(postKey(guildId, post.number), post);

// Lock sederhana supaya nomor confession / reply tidak bentrok kalau banyak yang kirim bareng
const locks = new Map();
async function withLock(key, fn) {
  const previous = locks.get(key) ?? Promise.resolve();
  const run = previous.catch(() => {}).then(fn);
  locks.set(key, run);
  try {
    return await run;
  } finally {
    if (locks.get(key) === run) locks.delete(key);
  }
}

function nextConfessionNumber(guildId) {
  return withLock(`n:${guildId}`, async () => {
    const next = (Number(await getFromDb(counterKey(guildId), 0)) || 0) + 1;
    await setInDb(counterKey(guildId), next);
    return next;
  });
}

function nextReplyNumber(guildId, number) {
  return withLock(`r:${guildId}:${number}`, async () => {
    const post = await getPost(guildId, number);
    if (!post) return null;
    post.replyCount = (post.replyCount ?? 0) + 1;
    await savePost(guildId, post);
    return post.replyCount;
  });
}

/* ───────────────────────── Cooldown ───────────────────────── */

const cooldowns = new Map();
const cooldownLeft = (guildId, userId) =>
  Math.max(0, (cooldowns.get(`${guildId}:${userId}`) ?? 0) - Date.now());
const startCooldown = (guildId, userId) =>
  cooldowns.set(`${guildId}:${userId}`, Date.now() + COOLDOWN_MS);

/* ───────────────────────── Helper tampilan ───────────────────────── */

const quote = (text) =>
  text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
    .slice(0, 4000);

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const errorEmbed = (message) =>
  new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Gagal').setDescription(message);

const fail = (interaction, message) => interaction.editReply({ embeds: [errorEmbed(message)] });

const reportButton = (number) =>
  new ButtonBuilder()
    .setCustomId(`${IDS.report}:${number}`)
    .setLabel('Lapor')
    .setEmoji('🚩')
    .setStyle(ButtonStyle.Danger);

/** Tombol di bawah confession (di channel) */
export function confessionButtons(number, { threadUrl } = {}) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${IDS.reply}:${number}`)
      .setLabel('Reply')
      .setEmoji('💬')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(IDS.open)
      .setLabel('Confess')
      .setEmoji('💌')
      .setStyle(ButtonStyle.Secondary),
    reportButton(number),
  );
  if (threadUrl) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel('Lihat Balasan')
        .setEmoji('🧵')
        .setStyle(ButtonStyle.Link)
        .setURL(threadUrl),
    );
  }
  return row;
}

/** Tombol di bawah balasan (di thread) */
export function replyButtons(number) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${IDS.reply}:${number}`)
      .setLabel('Balas')
      .setEmoji('↩️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(IDS.open)
      .setLabel('Confess')
      .setEmoji('💌')
      .setStyle(ButtonStyle.Secondary),
    reportButton(number),
  );
}

/** Panel utama (dikirim lewat /setup-confess) */
export function buildPanel({ staffCanReview }) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.confession)
    .setTitle('💌 Anonymous Confession Wall')
    .setDescription(
      [
        'Mau nyatain perasaan, curhat, atau kirim pesan rahasia?',
        'Tulis aja, **identitasmu nggak akan ditampilkan** ke member lain. ✨',
        '',
        '📝 **Tulis** pesanmu lewat tombol di bawah',
        '🖼️ **Lampirkan foto** kalau mau (opsional)',
        '💬 **Balas** confession orang lain, juga secara anonim',
        ...(staffCanReview ? ['🚩 **Laporkan** pesan yang melanggar aturan ke staff'] : []),
      ].join('\n'),
    )
    .setFooter({
      text: staffCanReview
        ? '🔒 Anonim untuk member • Staff dapat meninjau bila ada pelanggaran'
        : '🔒 Pengirim dirahasiakan',
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(IDS.open)
      .setLabel('Submit a confession!')
      .setEmoji('💌')
      .setStyle(ButtonStyle.Primary),
  );
  return { embeds: [embed], components: [row] };
}

/* ───────────────────────── Modal ───────────────────────── */

function buildModal({ customId, title, textLabel, placeholder }) {
  const text = new TextInputBuilder()
    .setCustomId(FIELDS.text)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(placeholder)
    .setRequired(true)
    .setMinLength(3)
    .setMaxLength(1500);

  const image = new FileUploadBuilder()
    .setCustomId(FIELDS.image)
    .setRequired(false)
    .setMinValues(0)
    .setMaxValues(1);

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addLabelComponents(
      new LabelBuilder().setLabel(textLabel).setTextInputComponent(text),
      new LabelBuilder()
        .setLabel('🖼️ Foto (opsional)')
        .setDescription('PNG, JPG, GIF, atau WEBP • maks 8 MB')
        .setFileUploadComponent(image),
    );
}

export const buildConfessModal = () =>
  buildModal({
    customId: IDS.submit,
    title: '💌 Kirim Anonymous Confession',
    textLabel: '📝 Isi confession kamu',
    placeholder: 'Tulis pesan rahasiamu di sini...',
  });

export const buildReplyModal = (number, customId) =>
  buildModal({
    customId,
    title: `💬 Balas Confession #${number}`,
    textLabel: '💬 Tulis balasanmu',
    placeholder: 'Tulis balasan anonimmu di sini...',
  });

/* ───────────────────────── Foto ───────────────────────── */

/** Baca & validasi foto dari modal. Return {} (tanpa foto), {image} atau {error}. */
async function readImage(interaction) {
  let files = null;
  try {
    files = interaction.fields.getUploadedFiles(FIELDS.image, false);
  } catch {
    return {};
  }
  const attachment = files?.first();
  if (!attachment) return {};

  const mime = (attachment.contentType ?? '').split(';')[0].toLowerCase();
  const ext = IMAGE_TYPES[mime];
  if (!ext) return { error: '🖼️ Format foto harus **PNG, JPG, GIF, atau WEBP**.' };
  if (attachment.size > MAX_IMAGE_BYTES) return { error: '🖼️ Ukuran foto maksimal **8 MB**.' };

  try {
    const res = await fetch(attachment.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) return { error: '🖼️ Ukuran foto maksimal **8 MB**.' };
    return { image: { buffer, ext } };
  } catch (error) {
    logger.warn('Confess: gagal mengunduh foto', { error: error.message });
    return { error: '🖼️ Foto gagal diproses, coba kirim ulang.' };
  }
}

function makeAttachment(image, baseName) {
  if (!image) return null;
  const name = `${baseName}.${image.ext}`;
  return { name, file: new AttachmentBuilder(image.buffer, { name }) };
}

/* ───────────────────────── Log staff ───────────────────────── */

async function sendLog(client, config, { kind, number, replyNo, user, text, jumpUrl, image }) {
  if (!config?.logChannelId) return;
  try {
    const channel = await client.channels.fetch(config.logChannelId);
    const isReply = kind === 'reply';
    const attachment = makeAttachment(image, `log-${number}${isReply ? `-r${replyNo}` : ''}`);

    const embed = new EmbedBuilder()
      .setColor(isReply ? COLORS.reply : COLORS.log)
      .setTitle(isReply ? `💬 Log Reply • #${number}-${replyNo}` : `📋 Log Confession • #${number}`)
      .addFields(
        { name: '👤 Pengirim', value: `<@${user.id}> (\`${user.id}\`)` },
        { name: '📝 Isi', value: clip(text, 1000) },
        { name: '🖼️ Foto', value: image ? 'Ya' : 'Tidak', inline: true },
        { name: '🔗 Pesan', value: jumpUrl ? `[Buka](${jumpUrl})` : '-', inline: true },
      )
      .setTimestamp();
    if (attachment) embed.setImage(`attachment://${attachment.name}`);

    await channel.send({
      embeds: [embed],
      files: attachment ? [attachment.file] : [],
      allowedMentions: NO_PINGS,
    });
  } catch (error) {
    logger.warn('Confess: gagal kirim log', { error: error.message });
  }
}

/* ───────────────────────── Thread ───────────────────────── */

async function ensureThread(client, guildId, post) {
  const channel = await client.channels.fetch(post.channelId).catch(() => null);
  if (!channel) return null;

  let thread = post.threadId ? await channel.threads?.fetch(post.threadId).catch(() => null) : null;

  if (!thread) {
    const message = await channel.messages.fetch(post.messageId).catch(() => null);
    if (!message) return null;
    thread = await message
      .startThread({ name: `💬 Confession #${post.number}`, autoArchiveDuration: 1440 })
      .catch(() => null);
  }
  if (thread && thread.id !== post.threadId) {
    post.threadId = thread.id;
    await savePost(guildId, post);
  }
  if (thread?.archived) await thread.setArchived(false).catch(() => {});
  return thread;
}

/* ───────────────────────── Aksi utama ───────────────────────── */

export async function submitConfession(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { client, guildId, user } = interaction;

  if (!guildId) return fail(interaction, 'Fitur ini hanya bisa dipakai di dalam server.');

  const config = await getConfessConfig(guildId);
  const channel = config ? await client.channels.fetch(config.channelId).catch(() => null) : null;
  if (!channel) {
    return fail(interaction, 'Channel confession belum diatur. Minta admin menjalankan `/setup-confess`.');
  }

  const wait = cooldownLeft(guildId, user.id);
  if (wait > 0) return fail(interaction, `⏳ Tunggu **${Math.ceil(wait / 1000)} detik** lagi sebelum mengirim lagi.`);

  const text = interaction.fields.getTextInputValue(FIELDS.text).trim();
  if (text.length < 3) return fail(interaction, 'Pesan terlalu pendek.');

  const { image, error } = await readImage(interaction);
  if (error) return fail(interaction, error);

  const number = await nextConfessionNumber(guildId);
  const attachment = makeAttachment(image, `confess-${number}`);

  const embed = new EmbedBuilder()
    .setColor(COLORS.confession)
    .setTitle(`💌 Anonymous Confession #${number}`)
    .setDescription(quote(text))
    .setFooter({ text: '🔒 Pengirim anonim • Tekan 💬 Reply untuk membalas' })
    .setTimestamp();
  if (attachment) embed.setImage(`attachment://${attachment.name}`);

  let message;
  try {
    message = await channel.send({
      embeds: [embed],
      components: [confessionButtons(number)],
      files: attachment ? [attachment.file] : [],
      allowedMentions: NO_PINGS,
    });
  } catch (err) {
    logger.error('Confess: gagal mengirim confession', { error: err.message });
    return fail(interaction, 'Bot tidak bisa mengirim ke channel confession. Cek izin bot di channel itu.');
  }

  let thread = null;
  try {
    thread = await message.startThread({ name: `💬 Confession #${number}`, autoArchiveDuration: 1440 });
    await message.edit({ components: [confessionButtons(number, { threadUrl: thread.url })] });
  } catch (err) {
    logger.warn('Confess: gagal membuat thread', { error: err.message });
  }

  await savePost(guildId, {
    number,
    channelId: channel.id,
    messageId: message.id,
    threadId: thread?.id ?? null,
    createdAt: Date.now(),
    replyCount: 0,
  });

  startCooldown(guildId, user.id);
  await sendLog(client, config, { kind: 'confession', number, user, text, jumpUrl: message.url, image });

  return interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('✅ Confession terkirim!')
        .setDescription(`Pesanmu sudah diposting secara anonim sebagai **#${number}** ✨`),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Lihat Confession').setEmoji('🔗').setStyle(ButtonStyle.Link).setURL(message.url),
      ),
    ],
  });
}

export async function submitReply(interaction, args = []) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { client, guildId, user } = interaction;

  const number = Number(args[0]);
  const replyToId = args[1] ?? null;
  if (!guildId || !Number.isInteger(number)) return fail(interaction, 'Tombol ini sudah tidak valid.');

  const config = await getConfessConfig(guildId);
  const post = await getPost(guildId, number);
  if (!post) return fail(interaction, `Confession **#${number}** tidak ditemukan.`);

  const wait = cooldownLeft(guildId, user.id);
  if (wait > 0) return fail(interaction, `⏳ Tunggu **${Math.ceil(wait / 1000)} detik** lagi sebelum membalas lagi.`);

  const text = interaction.fields.getTextInputValue(FIELDS.text).trim();
  if (text.length < 3) return fail(interaction, 'Balasan terlalu pendek.');

  const { image, error } = await readImage(interaction);
  if (error) return fail(interaction, error);

  const thread = await ensureThread(client, guildId, post);
  if (!thread) return fail(interaction, 'Thread balasan tidak bisa dibuka (mungkin sudah dihapus).');

  const replyNo = await nextReplyNumber(guildId, number);
  const attachment = makeAttachment(image, `reply-${number}-${replyNo}`);

  const embed = new EmbedBuilder()
    .setColor(COLORS.reply)
    .setTitle('💬 Balasan Anonim')
    .setDescription(quote(text))
    .setFooter({ text: `🔒 Anonim • Balasan #${replyNo} untuk Confession #${number}` })
    .setTimestamp();
  if (attachment) embed.setImage(`attachment://${attachment.name}`);

  const payload = {
    embeds: [embed],
    components: [replyButtons(number)],
    files: attachment ? [attachment.file] : [],
    allowedMentions: NO_PINGS,
  };
  if (replyToId) payload.reply = { messageReference: replyToId, failIfNotExists: false };

  let sent;
  try {
    sent = await thread.send(payload);
  } catch (err) {
    logger.error('Confess: gagal mengirim balasan', { error: err.message });
    return fail(interaction, 'Bot tidak bisa mengirim balasan di thread ini. Cek izin bot.');
  }

  startCooldown(guildId, user.id);
  await sendLog(client, config, { kind: 'reply', number, replyNo, user, text, jumpUrl: sent.url, image });

  return interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('✅ Balasan terkirim!')
        .setDescription(`Balasanmu untuk **Confession #${number}** sudah diposting secara anonim 💬`),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Lihat Balasan').setEmoji('🔗').setStyle(ButtonStyle.Link).setURL(sent.url),
      ),
    ],
  });
}

/* ───────────────────────── Izin bot (untuk /setup-confess) ───────────────────────── */

const REQUIRED_PERMS = [
  ['ViewChannel', PermissionFlagsBits.ViewChannel],
  ['SendMessages', PermissionFlagsBits.SendMessages],
  ['EmbedLinks', PermissionFlagsBits.EmbedLinks],
  ['AttachFiles', PermissionFlagsBits.AttachFiles],
  ['CreatePublicThreads', PermissionFlagsBits.CreatePublicThreads],
  ['SendMessagesInThreads', PermissionFlagsBits.SendMessagesInThreads],
];

export function missingPermissions(channel, member) {
  const perms = channel.permissionsFor(member);
  return REQUIRED_PERMS.filter(([, flag]) => !perms?.has(flag)).map(([name]) => name);
}


/* ───────────────────────── 🚩 Laporan ───────────────────────── */

const messageUrl = (guildId, channelId, messageId) =>
  `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;

export function buildReportModal(number, customId) {
  const reason = new TextInputBuilder()
    .setCustomId(FIELDS.reason)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Contoh: mengandung SARA, doxxing, spam, dll.')
    .setRequired(true)
    .setMinLength(5)
    .setMaxLength(300);

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(`🚩 Laporkan Confession #${number}`)
    .addLabelComponents(new LabelBuilder().setLabel('📝 Alasan laporan').setTextInputComponent(reason));
}

export async function submitReport(interaction, args = []) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { client, guildId, user } = interaction;

  const number = Number(args[0]);
  const channelId = args[1];
  const messageId = args[2];
  if (!guildId || !Number.isInteger(number) || !channelId || !messageId) {
    return fail(interaction, 'Tombol ini sudah tidak valid.');
  }

  const config = await getConfessConfig(guildId);
  if (!config?.logChannelId) {
    return fail(interaction, 'Fitur laporan belum aktif karena admin belum mengatur channel log.');
  }

  const dupKey = `guild:${guildId}:confess:report:${messageId}:${user.id}`;
  if (await getFromDb(dupKey, null)) {
    return fail(interaction, 'Kamu sudah melaporkan pesan ini. Staff akan segera meninjau 🙏');
  }

  const reason = interaction.fields.getTextInputValue(FIELDS.reason).trim();
  const post = await getPost(guildId, number);
  const isReply = post ? post.messageId !== messageId : false;
  const url = messageUrl(guildId, channelId, messageId);

  try {
    const logChannel = await client.channels.fetch(config.logChannelId);
    const embed = new EmbedBuilder()
      .setColor(COLORS.error)
      .setTitle(`🚩 Laporan • ${isReply ? 'Balasan' : 'Confession'} #${number}`)
      .addFields(
        { name: '📝 Alasan', value: clip(reason, 500) },
        { name: '🔗 Pesan', value: `[Buka pesan](${url})`, inline: true },
        { name: '🙋 Pelapor', value: `<@${user.id}>`, inline: true },
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${IDS.staffDelete}:${number}:${channelId}:${messageId}`)
        .setLabel('Hapus Pesan')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(IDS.staffDismiss)
        .setLabel('Abaikan')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Secondary),
    );

    await logChannel.send({ embeds: [embed], components: [row], allowedMentions: NO_PINGS });
  } catch (error) {
    logger.error('Confess: gagal mengirim laporan', { error: error.message });
    return fail(interaction, 'Laporan gagal dikirim ke staff. Coba lagi nanti.');
  }

  await setInDb(dupKey, true, REPORT_TTL_SECONDS);
  return interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('🚩 Laporan terkirim!')
        .setDescription('Terima kasih, staff akan meninjau pesan ini. Identitas pengirim tetap dirahasiakan.'),
    ],
  });
}

/* ───────────────────────── 🗑️ Aksi staff ───────────────────────── */

const isStaff = (interaction) => interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);

const noPermission = (interaction) =>
  interaction.reply({
    embeds: [errorEmbed('Kamu butuh izin **Manage Messages** untuk memakai tombol ini.')],
    flags: MessageFlags.Ephemeral,
  });

/** Hapus satu pesan confession/balasan. Kalau itu postingan utama, thread & datanya ikut dihapus. */
async function removeMessage(client, guildId, number, channelId, messageId) {
  const post = await getPost(guildId, number);
  const channel = await client.channels.fetch(channelId).catch(() => null);
  const message = channel ? await channel.messages.fetch(messageId).catch(() => null) : null;
  if (!message) return false;

  const isPost = post?.messageId === messageId;
  if (isPost) {
    const thread =
      message.thread ?? (post.threadId ? await channel.threads?.fetch(post.threadId).catch(() => null) : null);
    await thread?.delete().catch(() => {});
  }

  const deleted = await message.delete().then(() => true).catch(() => false);
  if (deleted && isPost) await deleteFromDb(postKey(guildId, number));
  return deleted;
}

/** Dipakai oleh /confess-hapus */
export async function deleteConfession(client, guildId, number, actor) {
  const post = await getPost(guildId, number);
  if (!post) return false;

  const ok = await removeMessage(client, guildId, number, post.channelId, post.messageId);
  if (ok) {
    const config = await getConfessConfig(guildId);
    if (config?.logChannelId) {
      const logChannel = await client.channels.fetch(config.logChannelId).catch(() => null);
      await logChannel
        ?.send({
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.log)
              .setTitle(`🗑️ Confession #${number} dihapus`)
              .setDescription(`Dihapus oleh <@${actor.id}>`)
              .setTimestamp(),
          ],
          allowedMentions: NO_PINGS,
        })
        .catch(() => {});
    }
  }
  return ok;
}

function closeReport(interaction, text, color) {
  const base = interaction.message.embeds[0];
  const embed = base ? EmbedBuilder.from(base) : new EmbedBuilder();
  return interaction.editReply({
    embeds: [embed.setColor(color).setFooter({ text })],
    components: [],
  });
}

export async function staffDelete(interaction, args = []) {
  if (!isStaff(interaction)) return noPermission(interaction);
  await interaction.deferUpdate();

  const [numberArg, channelId, messageId] = args;
  const number = Number(numberArg);
  const ok = await removeMessage(interaction.client, interaction.guildId, number, channelId, messageId);

  return closeReport(
    interaction,
    ok
      ? `🗑️ Pesan dihapus oleh ${interaction.user.tag}`
      : `⚠️ Pesan sudah tidak ada • ditandai oleh ${interaction.user.tag}`,
    ok ? COLORS.success : COLORS.log,
  );
}

export async function staffDismiss(interaction) {
  if (!isStaff(interaction)) return noPermission(interaction);
  await interaction.deferUpdate();
  return closeReport(interaction, `✅ Laporan diabaikan oleh ${interaction.user.tag}`, COLORS.log);
}
