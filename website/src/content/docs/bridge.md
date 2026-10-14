---
title: Bridge overview
description: Quote, send, and track cross-chain routes through Skip Go.
---

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
akashx bridge quote \
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

akashx bridge send \
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
akashx bridge status 0x_SOURCE_TRANSACTION_HASH \
  --chain-id 8453
```

The quote displays Skip Go's operations, expected and minimum output, price impact, fees,
required address chains, transaction count, and estimated duration. `bridge send` displays
the same route before signing.

## Start with testnet

Use the [Sepolia → Osmosis runbook](../guides/testnet-bridge/) for the test route.
Keep the sending process running: a route can require a later Cosmos transaction.
`bridge status` observes a transfer; `bridge send` always starts a new one.

## Wallet display is not delivery status

A wallet extension may not label a testnet IBC asset correctly. Verify the complete
route status and the recipient's on-chain token balance, not just the source
transaction or the wallet's native-token screen.
