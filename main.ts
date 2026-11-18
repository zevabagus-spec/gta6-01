// Solmar Heat — entry program for gta6-01 (Node 22+, standard library only).
//
// What it does, in order: work out where the entry lives and where the
// grader wants its output, copy the playable game and the screenshots
// there, then ask the kit's vendored dossier builder to summarise them
// into dossier.json. The same inputs always produce the same bytes: the
// copy is a plain recursive copy and the dossier builder is deterministic,
// so the grader's two runs agree byte for byte.
//
// Run it outside the grader with:
//   MAKEFUN_OUTPUT_DIR=/tmp/solmar-out node main.ts
// and play the game itself with `node serve.ts` (http://localhost:8080).

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyTree(sourceName: string): void {
  const source = join(repoRoot, sourceName);
  const target = join(outputDir, sourceName);
  if (!existsSync(source)) return;
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
}

mkdirSync(outputDir, { recursive: true });
copyTree('game');
copyTree('screenshots');

const dossierText = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossierText);
console.log(`Solmar Heat dossier written: ${outputDir}/dossier.json (${dossierText.length} bytes)`);
