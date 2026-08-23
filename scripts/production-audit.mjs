import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const roots = ['src/app', 'src/lib', 'convex', 'renderer'].map((path) => join(root, path));
const forbidden = [/https?:\/\/(?:example\.com|mock-asset\.com)/i];
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '_generated') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (/\.(?:ts|tsx|js|mjs)$/.test(entry.name)) files.push(path);
  }
}
for (const dir of roots) await walk(dir);
const failures = [];
for (const file of files) {
  const content = await readFile(file, 'utf8');
  for (const pattern of forbidden) if (pattern.test(content)) failures.push(`${file}: ${pattern}`);
}
if (failures.length) { console.error('Production audit failed'); console.error(failures.join('\n')); process.exit(1); }
console.log(`Production audit passed: ${files.length} source files scanned`);
