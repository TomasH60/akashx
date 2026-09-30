# akashx

Minimal TypeScript CLI built with `@oclif/core`. Requires Node.js 22.18+ (22.x)
or Node.js 24.x and npm.

Install dependencies:

```sh
npm ci
```

Run locally from TypeScript, without building:

```sh
npm run dev -- --help
npm run dev -- hello
npm run dev -- hello Tomas
```

Build and run the compiled CLI:

```sh
npm run build
node bin/run.js --help
node bin/run.js hello
```

Run tests and quality checks:

```sh
npm test
npm run typecheck
npm run lint
npm run format
```

`bin/` contains the development and production entry points, `src/commands/`
contains oclif commands, `test/` contains CLI integration tests, and `dist/`
contains generated JavaScript.

Tests are grouped under `test/unit/` for service logic, `test/commands/` for
command behavior, and `test/integration/` for tests that run the CLI as a process.

Directories are reserved for `wallet`, `fund`, `tenant`, `provider`, and `config`.
Add a command such as `src/commands/wallet/list.ts` to expose `akashx wallet list`;
use `src/commands/wallet/index.ts` for `akashx wallet`. Each command exports a
default class extending oclif's `Command`. Empty directories do not expose commands.

## Akash sandbox provider status

The CLI uses the Akash TypeScript SDK and connects to the `sandbox-2` gRPC endpoint.
Check a provider with its Akash address:

```sh
npm run dev -- provider status akash1...
```

To run the command without an address argument, set `AKASHX_PROVIDER`:

```sh
AKASHX_PROVIDER=akash1... npm run dev -- provider status
```

The command queries the provider record on the sandbox chain, then contacts its
gateway for live status. It prints the network, provider address, and `online`
when the provider responds without errors. An invalid address, missing provider,
or failed provider request produces an error. No separate Akash CLI or wallet is
needed for this read-only command.
