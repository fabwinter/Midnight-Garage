#!/usr/bin/env node
/* Produces www/ (gitignored) containing exactly what the shipped app
   needs: index.html, css/, js/, assets/. Nothing else — no node_modules,
   docs/, tools/, .genwork/, supabase/, package*.json.

   This is what capacitor.config.json's webDir must point at (STORE-SHIP-
   PLAN.md P0-1) — with webDir "." (the old default), `cap sync` would
   copy the entire repo into the native app bundle.

   --release additionally overwrites js/build-flags.js in the output so
   ADMIN_ENABLED is false: the 5-tap Sandbox/Library/level-jump backdoor
   must not ship to App Review (STORE-SHIP-PLAN.md P0-8). The dev server
   (npm run dev) serves the repo directly and is unaffected — only a
   built www/ can ever have admin disabled.

   Usage:
     node tools/build-www.mjs             # dev-parity build, admin stays on
     node tools/build-www.mjs --release    # store build, admin off
     npm run build / npm run build:release */

import { cp, rm, mkdir, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RELEASE = process.argv.includes('--release');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'www');

const INCLUDE = ['index.html', 'css', 'js', 'assets'];

async function main(){
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  for(const name of INCLUDE){
    const src = join(ROOT, name);
    const dest = join(OUT, name);
    const s = await stat(src);
    await cp(src, dest, { recursive: s.isDirectory() });
  }

  if(RELEASE){
    const flagsPath = join(OUT, 'js', 'build-flags.js');
    await writeFile(flagsPath,
      "/* Overwritten by tools/build-www.mjs --release — do not edit the\n" +
      "   built copy directly, edit js/build-flags.js and rebuild. */\n" +
      "export const ADMIN_ENABLED = false;\n");
    console.log('Release build: ADMIN_ENABLED = false');
  }

  console.log(`Built ${OUT} (${INCLUDE.join(', ')})${RELEASE ? ' [release]' : ''}`);
}

main();
