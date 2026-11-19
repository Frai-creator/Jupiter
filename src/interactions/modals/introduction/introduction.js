import { IDS, submitIntro } from '../../../services/introductionService.js';

export default [
  {
    name: IDS.submit,
    execute: (interaction) => submitIntro(interaction),
  },
];
