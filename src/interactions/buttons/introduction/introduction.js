import { IDS, openForm, greet, editOwn } from '../../../services/introductionService.js';

// 📝 Buka formulir introduction (panel, pesan welcome, atau kartu member)
const open = {
  name: IDS.open,
  execute: (interaction) => openForm(interaction),
};

// ✏️ Edit kartu sendiri (customId: intro_edit:<userId>)
const edit = {
  name: IDS.edit,
  execute: (interaction, client, args) => editOwn(interaction, args),
};

// 👋 Sapa pemilik kartu (customId: intro_greet:<userId>)
const sapa = {
  name: IDS.greet,
  execute: (interaction, client, args) => greet(interaction, args),
};

export default [open, edit, sapa];
