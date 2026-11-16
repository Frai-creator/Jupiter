import { MessageFlags } from 'discord.js';
import {
  buildConfessModal,
  buildReplyModal,
  buildReportModal,
  IDS,
  staffDelete,
  staffDismiss,
} from '../../../services/confessService.js';

// 💌 Buka form confession baru
const openConfess = {
  name: IDS.open,
  async execute(interaction) {
    await interaction.showModal(buildConfessModal());
  },
};

// 💬 Buka form balasan (customId: confess_reply:<nomor>)
const openReply = {
  name: IDS.reply,
  async execute(interaction, client, args = []) {
    const number = Number(args[0]);
    if (!Number.isInteger(number)) {
      await interaction.reply({ content: '❌ Tombol ini sudah tidak valid.', flags: MessageFlags.Ephemeral });
      return;
    }

    // Kalau tombol ditekan di dalam thread, balasan akan jadi reply langsung ke pesan tersebut
    const inThread = interaction.message?.channel?.isThread?.();
    const customId = inThread
      ? `${IDS.replySubmit}:${number}:${interaction.message.id}`
      : `${IDS.replySubmit}:${number}`;

    await interaction.showModal(buildReplyModal(number, customId));
  },
};

// 🚩 Laporkan pesan (confession atau balasan tempat tombol ini berada)
const openReport = {
  name: IDS.report,
  async execute(interaction, client, args = []) {
    const number = Number(args[0]);
    if (!Number.isInteger(number)) {
      await interaction.reply({ content: '❌ Tombol ini sudah tidak valid.', flags: MessageFlags.Ephemeral });
      return;
    }
    const { channelId, id } = interaction.message;
    await interaction.showModal(buildReportModal(number, `${IDS.reportSubmit}:${number}:${channelId}:${id}`));
  },
};

// 🗑️ / ✅ Tombol khusus staff di channel log
const deleteReported = {
  name: IDS.staffDelete,
  execute: (interaction, client, args) => staffDelete(interaction, args),
};
const dismissReport = {
  name: IDS.staffDismiss,
  execute: (interaction) => staffDismiss(interaction),
};

export default [openConfess, openReply, openReport, deleteReported, dismissReport];
