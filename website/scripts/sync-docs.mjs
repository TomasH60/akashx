import { URL } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

// The runbooks in /docs are the source of truth. Only these reviewed files are published.
const pages = [
  [
    'TENANT_CLI.md',
    'tenant-cli',
    'Tenant deployments',
    'Create, inspect, resume, and close Akash tenant deployments.',
  ],
  [
    'SKIP_GO_TESTNET_BRIDGE.md',
    'testnet-bridge',
    'Testnet bridge',
    'Test a Sepolia USDC to Osmosis testnet bridge with Skip Go.',
  ],
  [
    'Akash local network deployment setup.md',
    'local-provider',
    'Local provider setup',
    'Configure the Windows and WSL provider lab and its tenant connection.',
  ],
];
const output = new URL('../src/content/docs/guides/', import.meta.url);
await mkdir(output, { recursive: true });
for (const [file, slug, title, description] of pages) {
  let body = await readFile(new URL(`../../docs/${file}`, import.meta.url), 'utf8');
  body = body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').replace(/^\s*# [^\n]+\n/, '');
  for (const [source, target] of pages) {
    body = body.replaceAll(`](${encodeURI(source)})`, `](../${target}/)`);
    body = body.replaceAll(`](${source})`, `](../${target}/)`);
  }
  // Repository source paths in runbooks should open GitHub, not a nonexistent site route.
  body = body.replace(
    /\]\((src\/[^)]+)\)/g,
    '](' + 'https://github.com/TomasH60/akashx/blob/main/$1)',
  );
  await writeFile(
    new URL(`${slug}.md`, output),
    `---\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(description)}\neditUrl: ${JSON.stringify(`https://github.com/TomasH60/akashx/edit/main/docs/${encodeURI(file)}`)}\n---\n\n${body.trim()}\n`,
  );
}
