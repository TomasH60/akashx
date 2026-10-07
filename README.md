# akashx

A TypeScript CLI for Akash. It creates encrypted Akash wallets, checks provider status on
the `sandbox-2` network, and quotes or submits cross-chain routes through Skip Go.

Requires npm and Node.js 22.18+ (22.x) or 24.x. Provider status needs no wallet or separate
`akt` install; submitting a bridge requires an EVM signer for the selected source chain.

## Wallet

Wallet commands use the CosmJS signer included by the Akash SDK and derive standard
`akash1...` addresses at the Cosmos `m/44'/118'/0'/0/0` path. The recovery phrase is stored
in an AES-256-GCM encrypted file. The default path is `~/.config/akashx/wallet.json`; set
`AKASHX_WALLET_FILE` or pass `--wallet-file` to select another path.

Create a wallet with a password of at least 12 characters:

```sh
export AKASHX_WALLET_PASSWORD='use-a-long-unique-password'
npm run dev -- wallet create
```

The command prints the recovery phrase once. Back it up separately from the wallet file.
To import an existing phrase without putting it directly in the command arguments:

```sh
export AKASHX_WALLET_PASSWORD='use-a-long-unique-password'
export AKASHX_WALLET_MNEMONIC='word1 word2 ...'
npm run dev -- wallet import
unset AKASHX_WALLET_MNEMONIC
```

Unlock the file and show its address:

```sh
export AKASHX_WALLET_PASSWORD='use-a-long-unique-password'
npm run dev -- wallet address
```

Use that address as `--to-address` when bridging USDC or AKT to Akash. The wallet service
also exposes the unlocked `DirectSecp256k1HdWallet` signer for future Akash transaction
commands.

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

## Bridge

Bridge commands use Skip Go and accept `--environment testnet|mainnet`, defaulting to
`testnet`. The selection filters Skip Go's live chain and asset registries. Mainnet permits
routes containing swaps; testnet requires the explicit `--allow-swap` flag.

Chains can be given by ID or a Skip Go name such as `base` or `akash`. Tokens can be given
by symbol, address, or denomination. If a symbol refers to multiple tokens on one chain,
the command reports the available identifiers instead of choosing one silently.

Basic Skip Go routes work without an API key. Anonymous requests share a restrictive rate
limit; `AKASHX_SKIP_API_KEY` can be set later for authenticated access. Request a read-only
mainnet quote without signing or submitting anything:

```sh
npm run dev -- bridge quote \
  --environment mainnet \
  --amount 5 \
  --from-chain base \
  --from-token USDC \
  --to-chain akash \
  --to-token AKT \
  --to-address akash1_YOUR_ADDRESS
```

Skip Go currently lists Akash mainnet but no Akash testnet, so an end-to-end EVM-to-Akash
testnet route is unavailable. Test mainnet routes with `bridge quote`; only use `bridge send`
when intentionally submitting real transactions.

To execute a route, unlock the encrypted CLI wallet and configure a dedicated source EVM
wallet. The source address is derived from the private key, and the CLI refuses to proceed
if the RPC chain ID differs from `--from-chain`.

```sh
export AKASHX_WALLET_PASSWORD='your-wallet-password'
export AKASHX_EVM_RPC_URL=https://your-base-rpc.example
export AKASHX_EVM_PRIVATE_KEY=0x_DEDICATED_PRIVATE_KEY

npm run dev -- bridge send \
  --environment mainnet \
  --amount 5 \
  --from-chain base \
  --from-token USDC \
  --to-chain akash \
  --to-token AKT \
  --to-address akash1_YOUR_ADDRESS \
  --yes
```

Skip Go may route Base USDC through CCTP to Noble, IBC to Osmosis for the USDC-to-AKT swap,
and IBC to Akash. The wallet service derives the required `noble1...` and `osmo1...`
intermediate accounts from the same encrypted mnemonic. Skip Go handles approvals,
multi-transaction signing, broadcasting, relaying, and tracking.

Check a printed transaction hash using the chain where that transaction was broadcast:

```sh
npm run dev -- bridge status 0x_SOURCE_TRANSACTION_HASH \
  --chain-id 8453
```

The quote displays Skip Go's operations, expected and minimum output, price impact, fees,
required address chains, transaction count, and estimated duration. `bridge send` displays
the same route before signing.

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
