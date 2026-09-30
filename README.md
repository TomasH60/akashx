# akashx

A TypeScript CLI for Akash. Right now it checks provider status on the `sandbox-2` network.

Requires npm and Node.js 22.18+ (22.x) or 24.x. No wallet or separate `akt` install is needed.

## Try it

```sh
npm ci
npm run dev -- provider status akash1rk090a6mq9gvm0h6ljf8kz8mrxglwwxsk4srxh
```

That provider was online when checked on October 1, 2026; sandbox providers may go offline.
Use another provider address as the last argument, or set `AKASHX_PROVIDER` and omit the argument.

```sh
npm run dev -- --help
npm run dev -- hello
```

## Build and check

```sh
npm run build
node bin/run.js provider status akash1rk090a6mq9gvm0h6ljf8kz8mrxglwwxsk4srxh
npm test
npm run typecheck
npm run lint
npx prettier --check .
```

Commands live in `src/commands/`; service code lives in `src/services/`. Tests are grouped
under `test/unit/`, `test/commands/`, and `test/integration/`.
