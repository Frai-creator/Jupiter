import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { deleteFromDb, getFromDb, setInDb } from '../utils/database.js';
import { renderIntroCard } from '../utils/introCard.js';
import { logger } from '../utils/logger.js';

/* ───────────────────────── Konstanta ───────────────────────── */

export const COLORS = {
  brand: 0xa78bfa,
  success: 0x57f287,
  error: 0xed4245,
  warn: 0xfbbf24,
};

export const IDS = {
  open: 'intro_open',
  edit: 'intro_edit',
  greet: 'intro_greet',
  submit: 'intro_submit',
};

const FIELDS = {
  name: 'intro_name',
  age: 'intro_age',
  gender: 'intro_gender',
  origin: 'intro_origin',
  bio: 'intro_bio',
};

export const GENDERS = {
  cowok: { label: 'Cowok', emoji: '🙋‍♂️' },
  cewek: { label: 'Cewek', emoji: '🙋‍♀️' },
  rahasia: { label: 'Rahasia', emoji: '🤫' },
};

const LIMITS = { name: 24, origin: 24, bio: 140, minAge: 13, maxAge: 99 };
const COOLDOWN_MS = 45_000;
const LINK_REGEX = /(https?:\/\/|www\.|discord\.gg\/|discord\.com\/invite)/i;
const NO_PINGS = { parse: [] };

/* ───────────────────────── Penyimpanan ───────────────────────── */

const configKey = (guildId) => `guild:${guildId}:intro:config`;
const counterKey = (guildId) => `guild:${guildId}:intro:counter`;
const userKey = (guildId, userId) => `guild:${guildId}:intro:user:${userId}`;

export const getIntroConfig = (guildId) => getFromDb(configKey(guildId), null);
export const saveIntroConfig = (guildId, config) => setInDb(configKey(guildId), config);
export const getIntro = (guildId, userId) => getFromDb(userKey(guildId, userId), null);
const saveIntro = (guildId, userId, data) => setInDb(userKey(guildId, userId), data);
export const deleteIntro = (guildId, userId) => deleteFromDb(userKey(guildId, userId));

// Lock sederhana supaya nomor & hitungan sapaan tidak bentrok kalau banyak yang menekan bareng
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

const nextIntroNumber = (guildId) =>
  withLock(`n:${guildId}`, async () => {
    const next = (Number(await getFromDb(counterKey(guildId), 0)) || 0) + 1;
    await setInDb(counterKey(guildId), next);
    return next;
  });

/* ───────────────────────── Cooldown ───────────────────────── */

const cooldowns = new Map();
const cooldownLeft = (guildId, userId) =>
  Math.max(0, (cooldowns.get(`${guildId}:${userId}`) ?? 0) - Date.now());
const startCooldown = (guildId, userId) =>
  cooldowns.set(`${guildId}:${userId}`, Date.now() + COOLDOWN_MS);

/* ───────────────────────── Helper umum ───────────────────────── */

const errorEmbed = (message) =>
  new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Gagal').setDescription(message);

const fail = (interaction, message) => interaction.editReply({ embeds: [errorEmbed(message)] });

const ephemeralError = (interaction, message) =>
  interaction.reply({ embeds: [errorEmbed(message)], flags: MessageFlags.Ephemeral });

const cleanText = (text) =>
  String(text ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const REQUIRED_PERMS = [
  ['ViewChannel', PermissionFlagsBits.ViewChannel],
  ['SendMessages', PermissionFlagsBits.SendMessages],
  ['AttachFiles', PermissionFlagsBits.AttachFiles],
  ['ReadMessageHistory', PermissionFlagsBits.ReadMessageHistory],
];

export function missingPermissions(channel, member) {
  const perms = channel.permissionsFor(member);
  return REQUIRED_PERMS.filter(([, flag]) => !perms?.has(flag)).map(([name]) => name);
}

export function canMakeThreads(channel, member) {
  const perms = channel.permissionsFor(member);
  return Boolean(
    perms?.has(PermissionFlagsBits.CreatePublicThreads) &&
      perms?.has(PermissionFlagsBits.SendMessagesInThreads),
  );
}

/* ───────────────────────── Tombol & panel ───────────────────────── */

const openButton = () =>
  new ButtonBuilder()
    .setCustomId(IDS.open)
    .setLabel('Isi Formulir Introduction')
    .setEmoji('📝')
    .setStyle(ButtonStyle.Primary);

/** Satu tombol "Isi Formulir Introduction" (dipakai di panel & pesan welcome) */
export const introOpenRow = () => new ActionRowBuilder().addComponents(openButton());

/** Tombol di bawah kartu introduction member */
export function cardButtons(userId, greetCount = 0) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${IDS.greet}:${userId}`)
      .setLabel(greetCount > 0 ? `Sapa • ${greetCount}` : 'Sapa')
      .setEmoji('👋')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${IDS.edit}:${userId}`)
      .setLabel('Edit')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(IDS.open)
      .setLabel('Isi Punyamu')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Secondary),
  );
}

/** Panel utama (dikirim lewat /introduction setup) — dilengkapi contoh kartu */
export async function buildPanel(guild, config) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.brand)
    .setAuthor({ name: guild.name, iconURL: guild.iconURL({ size: 128 }) ?? undefined })
    .setTitle('✦ Perkenalkan Dirimu!')
    .setDescription(
      [
        `Biar makin akrab di **${guild.name}**, yuk bikin **kartu introduction** punyamu sendiri.`,
        '',
        '**1 ▸** Tekan tombol **Isi Formulir Introduction** di bawah',
        '**2 ▸** Isi formulir singkat: nama, umur, gender, asal & bio',
        `**3 ▸** Kartumu langsung muncul di <#${config.channelId}> ✨`,
        '',
        '💫 Member lain bisa **menyapamu** lewat tombol 👋 di kartu',
        '✏️ Mau ganti isi? Tekan tombol yang sama, data lamamu akan terisi otomatis',
      ].join('\n'),
    )
    .setFooter({ text: 'Satu kartu per member • Dilarang menyertakan link' });

  const payload = { embeds: [embed], components: [introOpenRow()], files: [] };

  try {
    const png = await renderIntroCard({
      name: 'Nama Kamu',
      handle: 'username',
      avatarUrl: guild.iconURL({ extension: 'png', size: 512, forceStatic: true }) ?? undefined,
      serverName: guild.name,
      age: 18,
      gender: 'Rahasia',
      origin: 'Kota Asalmu',
      bio: 'Tulis sapaan, hobi, atau alasan kamu join di sini supaya member lain gampang mengenalmu!',
      introNumber: 1,
      userId: `sample:${guild.id}`,
    });
    payload.files.push(new AttachmentBuilder(png, { name: 'intro-preview.png' }));
    embed.setImage('attachment://intro-preview.png');
  } catch (error) {
    logger.warn('Introduction: gagal membuat contoh kartu', { error: error.message });
  }
  return payload;
}

/* ───────────────────────── Modal (formulir) ───────────────────────── */

export function buildIntroModal({ customId = IDS.submit, prefill = {}, fallbackName = '' } = {}) {
  const name = new TextInputBuilder()
    .setCustomId(FIELDS.name)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Nama panggilanmu')
    .setRequired(true)
    .setMinLength(2)
    .setMaxLength(LIMITS.name);
  const nameValue = prefill.name ?? fallbackName;
  if (nameValue) name.setValue(String(nameValue).slice(0, LIMITS.name));

  const age = new TextInputBuilder()
    .setCustomId(FIELDS.age)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Contoh: 18')
    .setRequired(true)
    .setMinLength(2)
    .setMaxLength(2);
  if (prefill.age) age.setValue(String(prefill.age));

  const gender = new StringSelectMenuBuilder()
    .setCustomId(FIELDS.gender)
    .setPlaceholder('Pilih gender')
    .setRequired(true)
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      Object.entries(GENDERS).map(([value, g]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(g.label)
          .setValue(value)
          .setEmoji(g.emoji)
          .setDefault(prefill.gender === value),
      ),
    );

  const origin = new TextInputBuilder()
    .setCustomId(FIELDS.origin)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Kota / provinsi asalmu')
    .setRequired(true)
    .setMinLength(2)
    .setMaxLength(LIMITS.origin);
  if (prefill.origin) origin.setValue(String(prefill.origin).slice(0, LIMITS.origin));

  const bio = new TextInputBuilder()
    .setCustomId(FIELDS.bio)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Hobi, alasan join, atau sapaan buat member lain ✨')
    .setRequired(true)
    .setMinLength(5)
    .setMaxLength(LIMITS.bio);
  if (prefill.bio) bio.setValue(String(prefill.bio).slice(0, LIMITS.bio));

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(prefill.name ? '✏️ Edit Introduction' : '📝 Formulir Introduction')
    .addLabelComponents(
      new LabelBuilder().setLabel('Nama panggilan').setTextInputComponent(name),
      new LabelBuilder().setLabel('Umur').setDescription(`${LIMITS.minAge}–${LIMITS.maxAge} tahun`).setTextInputComponent(age),
      new LabelBuilder().setLabel('Gender').setStringSelectMenuComponent(gender),
      new LabelBuilder().setLabel('Asal').setTextInputComponent(origin),
      new LabelBuilder()
        .setLabel('Pesan / bio singkat')
        .setDescription(`Maks ${LIMITS.bio} karakter`)
        .setTextInputComponent(bio),
    );
}

/** Dipanggil saat tombol 📝 / ✏️ ditekan */
export async function openForm(interaction) {
  const { guildId, user, member } = interaction;
  if (!guildId) return ephemeralError(interaction, 'Fitur ini hanya bisa dipakai di dalam server.');

  const config = await getIntroConfig(guildId);
  if (!config?.channelId) {
    return ephemeralError(interaction, 'Sistem introduction belum diatur. Minta admin menjalankan `/introduction setup`.');
  }

  const prefill = (await getIntro(guildId, user.id)) ?? {};
  const fallbackName = member?.displayName ?? user.globalName ?? user.username ?? '';
  return interaction.showModal(buildIntroModal({ prefill, fallbackName }));
}

/* ───────────────────────── Baca & validasi formulir ───────────────────────── */

function readSelect(interaction, id) {
  try {
    const values = interaction.fields.getStringSelectValues(id);
    if (values?.length) return values[0];
  } catch {
    /* lanjut ke cara lain */
  }
  try {
    return interaction.fields.getField(id)?.values?.[0] ?? null;
  } catch {
    return null;
  }
}

function readForm(interaction) {
  const name = cleanText(interaction.fields.getTextInputValue(FIELDS.name));
  const ageRaw = cleanText(interaction.fields.getTextInputValue(FIELDS.age));
  const origin = cleanText(interaction.fields.getTextInputValue(FIELDS.origin));
  const bio = cleanText(interaction.fields.getTextInputValue(FIELDS.bio));
  const gender = readSelect(interaction, FIELDS.gender);

  if (name.length < 2) return { error: '📛 Nama terlalu pendek.' };
  if (!/^\d{1,2}$/.test(ageRaw)) return { error: '🎂 Umur harus berupa **angka** (contoh: `18`).' };
  const age = Number(ageRaw);
  if (age < LIMITS.minAge || age > LIMITS.maxAge) {
    return { error: `🎂 Umur harus di antara **${LIMITS.minAge}–${LIMITS.maxAge}** tahun.` };
  }
  if (!GENDERS[gender]) return { error: '⚧️ Pilih gender dulu ya.' };
  if (origin.length < 2) return { error: '📍 Asal terlalu pendek.' };
  if (bio.length < 5) return { error: '💬 Bio terlalu pendek, tulis minimal beberapa kata ya.' };
  if ([name, origin, bio].some((t) => LINK_REGEX.test(t))) {
    return { error: '🔗 Link / invite server tidak boleh ada di introduction.' };
  }
  return { data: { name, age, gender, origin, bio } };
}

/* ───────────────────────── Render kartu ───────────────────────── */

function renderFor(guild, user, record) {
  return renderIntroCard({
    name: record.name,
    handle: user.username,
    avatarUrl: user.displayAvatarURL({ extension: 'png', size: 512, forceStatic: true }),
    serverName: guild.name,
    age: record.age,
    gender: GENDERS[record.gender]?.label ?? '-',
    origin: record.origin,
    bio: record.bio,
    introNumber: record.number,
    userId: user.id,
    timestamp: record.createdAt,
  });
}

const cardFile = (png) => new AttachmentBuilder(png, { name: 'introduction.png' });

/** Dipakai /introduction lihat */
export async function renderStoredCard(guild, user, record) {
  return cardFile(await renderFor(guild, user, record));
}

/* ───────────────────────── Kirim formulir ───────────────────────── */

export async function submitIntro(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { client, guild, guildId, user } = interaction;

  if (!guildId) return fail(interaction, 'Fitur ini hanya bisa dipakai di dalam server.');

  const config = await getIntroConfig(guildId);
  const channel = config?.channelId ? await client.channels.fetch(config.channelId).catch(() => null) : null;
  if (!channel) {
    return fail(interaction, 'Channel introduction belum diatur / sudah dihapus. Minta admin menjalankan `/introduction setup`.');
  }

  const wait = cooldownLeft(guildId, user.id);
  if (wait > 0) return fail(interaction, `⏳ Tunggu **${Math.ceil(wait / 1000)} detik** lagi sebelum mengirim lagi.`);

  const { data, error } = readForm(interaction);
  if (error) return fail(interaction, error);

  const previous = await getIntro(guildId, user.id);
  const record = {
    ...(previous ?? {}),
    ...data,
    number: previous?.number ?? (await nextIntroNumber(guildId)),
    createdAt: previous?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    greeters: previous?.greeters ?? [],
  };

  let png;
  try {
    png = await renderFor(guild, user, record);
  } catch (err) {
    logger.error('Introduction: gagal membuat kartu', { error: err.message });
    return fail(interaction, 'Kartu gagal dibuat, coba lagi sebentar lagi ya.');
  }

  const buttons = cardButtons(user.id, record.greeters.length);
  let message = null;
  let edited = false;

  // Edit: perbarui kartu lama di tempat (kalau pesannya masih ada)
  if (previous?.messageId && previous.channelId === channel.id) {
    const old = await channel.messages.fetch(previous.messageId).catch(() => null);
    if (old) {
      try {
        message = await old.edit({ files: [cardFile(png)], attachments: [], components: [buttons], allowedMentions: NO_PINGS });
        edited = true;
      } catch (err) {
        logger.warn('Introduction: gagal mengedit kartu lama', { error: err.message });
      }
    }
  }

  if (!message) {
    try {
      message = await channel.send({
        content: `🎉 Silakan sambut kedatangan <@${user.id}>!`,
        files: [cardFile(png)],
        components: [buttons],
        allowedMentions: { users: [user.id] },
      });
    } catch (err) {
      logger.error('Introduction: gagal mengirim kartu', { error: err.message });
      return fail(interaction, 'Bot tidak bisa mengirim ke channel introduction. Cek izin bot di channel itu.');
    }
    record.greeters = [];
    record.threadId = null;
  }

  record.channelId = channel.id;
  record.messageId = message.id;

  // Thread sapaan untuk kartu baru
  if (!record.threadId) {
    try {
      const thread = await message.startThread({
        name: `👋 Sapa ${record.name}`.slice(0, 90),
        autoArchiveDuration: 1440,
      });
      record.threadId = thread.id;
      await thread.send({
        content: `Halo semuanya! Ayo sapa dan berteman dengan <@${user.id}> di sini 👋✨`,
        allowedMentions: NO_PINGS,
      });
    } catch (err) {
      logger.warn('Introduction: gagal membuat thread', { error: err.message });
    }
  }

  await saveIntro(guildId, user.id, record);
  startCooldown(guildId, user.id);

  // Role otomatis setelah introduction
  let roleNote = null;
  if (config.roleId) {
    const member = interaction.member ?? (await guild.members.fetch(user.id).catch(() => null));
    const role = guild.roles.cache.get(config.roleId);
    if (member && role && !member.roles.cache.has(role.id)) {
      try {
        await member.roles.add(role, 'Sudah mengisi introduction');
        roleNote = `🎖️ Kamu mendapat role ${role}`;
      } catch (err) {
        logger.warn('Introduction: gagal memberi role', { error: err.message });
      }
    }
  }

  return interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle(edited ? '✅ Introduction diperbarui!' : '✅ Introduction terkirim!')
        .setDescription(
          [edited ? 'Kartumu sudah diperbarui ✨' : 'Kartumu sudah diposting, selamat datang! ✨', roleNote]
            .filter(Boolean)
            .join('\n'),
        ),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Lihat Kartuku').setEmoji('🔗').setStyle(ButtonStyle.Link).setURL(message.url),
      ),
    ],
  });
}

/* ───────────────────────── Tombol 👋 Sapa ───────────────────────── */

export async function greet(interaction, args) {
  const targetId = args?.[0];
  const { guildId, user } = interaction;
  if (!guildId || !targetId) return ephemeralError(interaction, 'Tombol ini sudah tidak valid.');

  if (targetId === user.id) {
    return interaction.reply({
      content: '😅 Nggak bisa menyapa diri sendiri, tapi kamu tetap keren!',
      flags: MessageFlags.Ephemeral,
    });
  }

  const outcome = await withLock(`g:${guildId}:${targetId}`, async () => {
    const record = await getIntro(guildId, targetId);
    if (!record) return { missing: true };
    record.greeters = record.greeters ?? [];
    if (record.greeters.includes(user.id)) return { already: true };
    record.greeters.push(user.id);
    await saveIntro(guildId, targetId, record);
    return { record };
  });

  if (outcome.missing) return ephemeralError(interaction, 'Data introduction ini tidak ditemukan.');
  if (outcome.already) {
    return interaction.reply({ content: '👋 Kamu sudah menyapa dia sebelumnya!', flags: MessageFlags.Ephemeral });
  }

  const { record } = outcome;
  await interaction.update({ components: [cardButtons(targetId, record.greeters.length)] });

  // Umumkan sapaan di thread (tanpa ping)
  if (record.threadId) {
    try {
      const thread = await interaction.client.channels.fetch(record.threadId);
      if (thread?.archived) await thread.setArchived(false).catch(() => {});
      await thread.send({
        content: `👋 **${interaction.member?.displayName ?? user.username}** menyapa <@${targetId}>!`,
        allowedMentions: NO_PINGS,
      });
    } catch (err) {
      logger.debug('Introduction: gagal mengirim sapaan ke thread', { error: err.message });
    }
  }
}

/* ───────────────────────── Tombol ✏️ Edit ───────────────────────── */

export async function editOwn(interaction, args) {
  if (args?.[0] !== interaction.user.id) {
    return ephemeralError(
      interaction,
      'Tombol **Edit** cuma buat pemilik kartu ini. Mau bikin punyamu? Tekan **📝 Isi Punyamu**.',
    );
  }
  return openForm(interaction);
}

/* ───────────────────────── Hapus (staff) ───────────────────────── */

export async function removeIntro(client, guildId, userId) {
  const record = await getIntro(guildId, userId);
  if (!record) return false;

  if (record.channelId && record.messageId) {
    const channel = await client.channels.fetch(record.channelId).catch(() => null);
    const message = await channel?.messages?.fetch(record.messageId).catch(() => null);
    await message?.delete().catch(() => {});
  }
  if (record.threadId) {
    const thread = await client.channels.fetch(record.threadId).catch(() => null);
    await thread?.delete().catch(() => {});
  }
  await deleteIntro(guildId, userId);
  return true;
}
