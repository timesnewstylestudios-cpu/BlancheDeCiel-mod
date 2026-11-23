/* SPDX-License-Identifier: GPL-3.0-or-later */

export const SCALE_BDL = `title Tonleiter
tempo 120
sprite Bühne
sprite Figur
pos 0 0
dir 90
scale 100
shown 1
clear-scripts
script 40 40
  when flag
  note 60 0.35
  note 62 0.35
  note 64 0.35
  note 65 0.35
  note 67 0.7
  say "Tonleiter" 1
end
`;

export const TABLE_BDL = `title Summe
tables-reset
cleartable mess
table mess 10
table mess 20
table mess 30
sprite Bühne
sprite Figur
pos -20 20
dir 90
clear-scripts
script 40 40
  when flag
  share mess
  job sum mess 1
  say (join "Summe " (jobresult sum mess 1)) 2
end
`;

export const SAMPLE_EXTENSION = `(function (Scratch) {
  'use strict';
  class Extension {
    getInfo() {
      return {
        id: 'bdcEcho',
        name: 'Echo',
        color1: '#5B4B8A',
        blocks: [
          {
            opcode: 'shout',
            blockType: Scratch.BlockType.COMMAND,
            text: 'rufe [TEXT]',
            arguments: {
              TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: 'Hallo' }
            }
          }
        ]
      };
    }
    shout(args) {
      console.log(args.TEXT);
    }
  }
  Scratch.extensions.register(new Extension());
}(Scratch));
`;
