import { IDS, submitConfession, submitReply, submitReport } from '../../../services/confessService.js';

export default [
  {
    name: IDS.submit,
    execute: (interaction) => submitConfession(interaction),
  },
  {
    name: IDS.replySubmit,
    execute: (interaction, client, args) => submitReply(interaction, args),
  },
  {
    name: IDS.reportSubmit,
    execute: (interaction, client, args) => submitReport(interaction, args),
  },
];
