import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';

const directory = fileURLToPath(new URL('../dist/', import.meta.url));
const origin = 'https://tomash60.github.io';
const base = '/akashx/';
async function walk(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory() ? walk(join(path, entry.name)) : [join(path, entry.name)],
      ),
    )
  ).flat();
}
const files = await walk(directory);
const errors = [];
for (const file of files.filter((path) => path.endsWith('.html'))) {
  const relative = file.slice(directory.length).replace(/index\.html$/, '');
  const page = new URL(`${base}${relative}`, origin);
  const html = await readFile(file, 'utf8');
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const link = match[1].replaceAll('&amp;', '&');
    const target = new URL(link, page);
    if (target.origin !== origin) continue;
    if (!target.pathname.startsWith(base)) {
      errors.push(`${page.pathname}: URL escapes Pages base: ${link}`);
      continue;
    }
    // Astro gives the standalone GitHub Pages 404 file a /404/ canonical URL.
    if (file.endsWith('/404.html') && target.pathname === `${base}404/`) continue;
    const local = resolve(directory, decodeURIComponent(target.pathname.slice(base.length)));
    try {
      const info = await stat(local);
      if (info.isDirectory()) await stat(join(local, 'index.html'));
    } catch {
      errors.push(`${page.pathname}: missing ${link}`);
    }
  }
}
if (errors.length) {
  process.stderr.write(errors.join('\n') + '\n');
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Checked internal links and assets across ${files.filter((path) => path.endsWith('.html')).length} HTML pages.\n`,
  );
}
