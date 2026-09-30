# akashx

Minimal TypeScript CLI built with `@oclif/core`. Requires Node.js 22.13+ (22.x)
or Node.js 24+ and npm.

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

Directories are reserved for `wallet`, `fund`, `tenant`, `provider`, and `config`.
Add a command such as `src/commands/wallet/list.ts` to expose `akashx wallet list`;
use `src/commands/wallet/index.ts` for `akashx wallet`. Each command exports a
default class extending oclif's `Command`. Empty directories do not expose commands.
No Akash or EVM business logic is included.
