import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
const root = fileURLToPath(new URL('../../', import.meta.url));
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'akashx-command-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
function run(...args: string[]) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'bin/dev.js', ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      ...process.env,
      AKASHX_CONFIG_DIR: directory,
      AKASHX_NETWORK: '',
      AKASHX_WALLET_PASSWORD: '',
      AKASHX_WALLET_FILE: '',
    },
  });
  if (result.error) throw result.error;
  return result;
}

// A test starts up to four CLI processes, each bounded by 10 seconds.
describe('tenant CLI', { timeout: 45_000 }, () => {
  it('discovers nested command groups and resume flags', () => {
    const help = run('deployment', 'deploy', '--help');
    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain('--resume');
    const manifest = run('deployment', 'manifest', 'send', '--help');
    expect(manifest.status, manifest.stderr).toBe(0);
    expect(manifest.stdout).toContain('--yes');
  });
  it('requires explicit authorization before a funding command can read a wallet or reach the chain', () => {
    const result = run('fund', 'mint-act', '1000000uakt');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('yes');
    expect(result.stderr).not.toContain('ENOENT');
  });
  it('saves configuration and validates a generated SDL through the CLI', () => {
    const configured = run('config', 'set', 'network', 'test-chain');
    expect(configured.status, configured.stderr).toBe(0);
    expect(JSON.parse(run('config', 'show').stdout).network).toBe('test-chain');
    const file = join(directory, 'web.yaml');
    expect(run('deployment', 'init', file).status).toBe(0);
    const validate = run('deployment', 'validate', file);
    expect(validate.status, validate.stderr).toBe(0);
    expect(validate.stdout).toContain('SDL valid');
  });
});
