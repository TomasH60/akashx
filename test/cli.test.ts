import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));

function runCli(...args: string[]) {
  return spawnSync(process.execPath, ['--import', 'tsx', 'bin/dev.js', ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10_000,
  });
}

describe('CLI', () => {
  it('shows root help', () => {
    const result = runCli('--help');

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('USAGE');
    expect(result.stdout).toContain('hello');
  });

  it('greets the world by default', () => {
    const result = runCli('hello');

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe('Hello, world!');
  });

  it('greets a supplied name', () => {
    const result = runCli('hello', 'Tomas');

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe('Hello, Tomas!');
  });

  it('shows command help', () => {
    const result = runCli('hello', '--help');

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('NAME');
  });

  it('rejects unknown flags', () => {
    const result = runCli('hello', '--unknown');

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Nonexistent flag');
  });
});
