import { readFile, writeFile } from 'node:fs/promises';
import {
  generateManifest,
  generateManifestVersion,
  manifestToSortedJSON,
  yaml,
  type SDLInput,
} from '@akashnetwork/chain-sdk';
export async function loadSDL(path: string) {
  const input = yaml.raw<SDLInput>(await readFile(path, 'utf8'));
  const result = generateManifest(input);
  if (!result.ok) throw new Error(`Invalid SDL: ${JSON.stringify(result.value)}`);
  return {
    ...result.value,
    hash: await generateManifestVersion(result.value.groups),
    manifest: manifestToSortedJSON(result.value.groups),
  };
}
export async function initSDL(path: string): Promise<void> {
  await writeFile(
    path,
    `version: "2.0"
services:
  web:
    image: nginx:stable-alpine
    expose:
      - port: 80
        as: 80
        to:
          - global: true
profiles:
  compute:
    web:
      resources:
        cpu:
          units: 0.5
        memory:
          size: 512Mi
        storage:
          size: 1Gi
  placement:
    default:
      pricing:
        web:
          denom: uact
          amount: 1000
deployment:
  web:
    default:
      profile: web
      count: 1
`,
    { flag: 'wx', mode: 0o600 },
  );
}
