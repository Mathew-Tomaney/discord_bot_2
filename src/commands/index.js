import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Load every command module in this folder. Returns Map<name, module>. */
export async function loadCommands() {
  const commands = new Map();
  for (const file of readdirSync(here)) {
    if (!file.endsWith('.js') || file === 'index.js') continue;
    const mod = await import(pathToFileURL(join(here, file)).href);
    if (!mod.data || !mod.execute) {
      console.warn(`Skipping ${file}: missing data or execute export`);
      continue;
    }
    commands.set(mod.data.name, mod);
  }
  return commands;
}
