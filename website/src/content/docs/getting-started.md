---
title: Installation
description: Install akashx from source and run your first read-only commands.
---

## Requirements

- Node.js **22.18+ within 22.x**, or **24.x**.
- npm and Git.
- A terminal. Secret-entry examples in these docs use **zsh**.

## Install from source

```sh
git clone https://github.com/TomasH60/akashx.git
cd akashx
npm ci
npm run build
npm link
akashx --help
```

`npm link` makes the local build available as `akashx`. After editing TypeScript,
run `npm run build` again. During development, use `npm run dev -- <command>` to
run the source directly.

## Inspect your configuration

```sh
akashx config show
akashx deployment --help
akashx bridge --help
```

Tenant commands default to Akash `sandbox-2`. The bridge's `--environment` flag
selects Skip networks independently. An Osmosis testnet balance does not fund an
Akash sandbox wallet.

## Choose a workflow

- [Create or import a wallet](../wallets/).
- [Deploy a workload](../guides/tenant-cli/).
- [Test a bridge](../guides/testnet-bridge/).
- [Set up a local provider](../guides/local-provider/) if you operate the provider machine.

Run `akashx doctor` once your wallet is configured. It checks chain connectivity,
balances, and certificate prerequisites; missing setup is reported explicitly.
