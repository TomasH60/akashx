# Test Sepolia USDC → Osmosis testnet USDC

This runbook uses the `akashx` CLI to quote and test this bridge:

```text
Ethereum Sepolia (11155111): USDC
  → CCTP V2
Injective testnet (1439 / injective-888): USDC
  → IBC
Cosmos provider testnet (provider): USDC
  → IBC forwarding
Osmosis testnet (osmo-test-5): USDC
```

Skip returned this route in a read-only quote on 2026-10-08: two route
transactions, no swap, and required addresses on `11155111`, `injective-888`,
`provider`, and `osmo-test-5`. Route availability can change.

**Current test status:** one end-to-end CLI transfer completed successfully on
2026-10-14. Skip reported `STATE_COMPLETED_SUCCESS` for the onward Injective
transaction, and the expected USDC IBC balance was confirmed on Osmosis testnet.
The [destination transaction](https://mintscan.io/osmosis-testnet/txs/6894854CCBC22AC1D3A9F1AFEDCB68F484D7946DB1E9048165394FC7278DEBC9)
provides the delivery record. This verifies that tested route, not future route
availability. Follow the signer and gas checks below before a new transfer.

## 1. Prepare the destination and dependencies

You need:

- Node.js 22.18+ (22.x) or 24.x.
- An Osmosis **testnet** recipient address (`osmo1…`) from a wallet configured
  for `osmo-test-5`. The address prefix alone does not identify the network.
- For sending later: a dedicated Ethereum Sepolia account with test USDC and
  Sepolia ETH for approval/transaction gas.
- For the onward Cosmos transaction: a compatible Injective testnet signer
  controlling the route's mint recipient and sufficient testnet gas.

Run from the repository root:

```sh
npm ci
npm run build
npm link
export OSMOSIS_ADDRESS='osmo1_YOUR_TESTNET_ADDRESS'
```

Replace the placeholder with your actual recipient. USDC on Osmosis will be
an IBC token representation. There is no AKT conversion in this test.

## 2. Request a quote — no wallet secrets needed

```sh
akashx bridge quote \
  --environment testnet \
  --amount 1 \
  --from-chain 11155111 \
  --from-token USDC \
  --to-chain osmo-test-5 \
  --to-token USDC \
  --to-address "$OSMOSIS_ADDRESS"
```

This does not sign or broadcast. For the observed route, look for:

```text
Environment: Skip Go testnet
Send: 1 USDC
Actions: cctp-transfer-v2 -> transfer -> transfer
Transactions required: 2
Required address chains: 11155111, injective-888, provider, osmo-test-5
```

Output amounts, fees, and duration estimates vary. Keep swaps disabled; this
route does not need `--allow-swap`. If `USDC` is ambiguous, use the destination
denom returned by current discovery. The observed denom was:

```text
ibc/91641A4DFC4270AA1FAB8DD7E5EFD1014A1616AA93C539B3536C8ED2D0C03289
```

Use that value as `--to-token` only if it still matches the current route.
If no route is returned, stop here; do not try to force a send.

## 3. Prepare the local wallets for execution

Skip this section if you only want to test quoting.

Get Sepolia test USDC from the [Circle faucet](https://faucet.circle.com/),
selecting Ethereum Sepolia, and fund the same address with Sepolia ETH.
Use a dedicated test account without mainnet assets.

The following prompts use zsh, the shell configured for this project. Enter
secrets locally; do not paste them into chat or commit them to a file.

```sh
read -s "AKASHX_EVM_PRIVATE_KEY?Dedicated Sepolia account private key: "
echo
export AKASHX_EVM_PRIVATE_KEY
export AKASHX_EVM_RPC_URL='https://ethereum-sepolia-rpc.publicnode.com'

read -s "AKASHX_WALLET_PASSWORD?CLI wallet password: "
echo
export AKASHX_WALLET_PASSWORD
```

Use your existing CLI wallet password if a wallet already exists. For a new
wallet, choose at least 12 characters and run:

```sh
akashx wallet create
```

Back up the recovery phrase printed by wallet creation. Do not run creation
again for an existing wallet. Creating this wallet does **not** by itself
resolve Injective signer compatibility.

If needed, configure an optional Skip API key:

```sh
read -s "AKASHX_SKIP_API_KEY?Skip API key: "
echo
export AKASHX_SKIP_API_KEY
```

## 4. Check execution support before submitting

For the quoted Injective route, verify all of the following before step 5:

- The installed Skip SDK can construct and execute the CCTP V2 plus Injective
  Cosmos transaction plan.
- The Injective account receiving the CCTP mint is controlled by the signer
  used for the onward IBC transaction. Verify key derivation, address mapping,
  public-key type, and signing support; changing an address prefix is insufficient
  evidence of compatibility.
- The account submitting the Injective transaction has the testnet gas required
  by that transaction plan. Fund the verified account, not an unverified
  prefix-converted address.
- Any extra signer required by the plan is available. The current service
  supplies only the source EVM signer plus intermediate Cosmos signers; it
  cannot supply an EVM signer on chain `1439` if the SDK requests one.

Relevant implementation: `src/services/skip-service.ts` and
`src/services/wallet-service.ts`. `wallet address` currently prints the Akash
address by default. To display the Injective signer used by the bridge, run:

```sh
akashx wallet address --prefix inj
```

Use the same `--wallet-file` or `AKASHX_WALLET_FILE` as the bridge command.
Fund this address with testnet INJ from the
[Injective testnet faucet](https://testnet.faucet.injective.network/).
The reported gas check required `0.00035 INJ`; fund more than the estimate
(for example `0.01` testnet INJ) to leave room for fee changes. Sepolia ETH
and bridged USDC do not pay the native Injective transaction fee.

If an attempt has already broadcast the source transaction, record its hash
and inspect that transfer before sending again. Funding the gas account does
not resume an exited CLI process, and `bridge send` starts a new transfer.

**There is no CLI preflight command that proves a new transfer will complete.**
The successful test above does not replace checking the current route, signer,
and gas balances. Offline signer tests alone do not establish route execution.

The previous prefix-only signer caused `pubKey does not match signer address`
on Injective. The corrected signer derives a different address. It does not
resume previous transfers or recover funds sent to the old address. If the
Sepolia transaction already completed, inspect its existing status before any
new send; `bridge send` always starts a new transfer. A successful CCTP status
can cover only the Sepolia-to-Injective leg, without onward IBC delivery.

## 5. Submit the bridge after the execution check passes

The following is the send command once step 4 has been resolved. `--yes`
authorizes ERC-20 approval and route transaction submission. The CLI obtains
and prints a fresh quote before executing it; it does not ask again.

```sh
akashx bridge send \
  --environment testnet \
  --amount 1 \
  --from-chain 11155111 \
  --from-token USDC \
  --to-chain osmo-test-5 \
  --to-token USDC \
  --to-address "$OSMOSIS_ADDRESS" \
  --slippage 1 \
  --yes
```

Keep this process running: the observed route needs a second transaction on
Injective after the CCTP mint. Record every `Broadcast <chainId>: <hash>` line,
including the source Sepolia hash and any intermediate Cosmos hash.
An ERC-20 approval may be needed in addition to the two route transactions.

Do not rerun `bridge send` to check progress; that starts a new transfer.

## 6. Track the existing transfer in another terminal

Replace the placeholder with the **bridge transaction** hash on Sepolia,
not the ERC-20 approval hash:

```sh
export BRIDGE_TX_HASH='0x_YOUR_SEPOLIA_BRIDGE_TRANSACTION_HASH'

akashx bridge status "$BRIDGE_TX_HASH" \
  --chain-id 11155111
```

Repeat this command to refresh status. It performs one lookup per invocation.
Open the explorer links it prints to inspect each chain's transaction.

Sepolia explorer URL:

```text
https://sepolia.etherscan.io/tx/0x_YOUR_SEPOLIA_BRIDGE_TRANSACTION_HASH
```

Source transaction success is only the first stage. Completion requires:

1. Sepolia burn confirmation and Circle attestation.
2. Relayed USDC mint on Injective.
3. Signed onward IBC transaction on Injective.
4. IBC delivery to provider and forwarding to Osmosis.
5. USDC credited to your recipient on `osmo-test-5`.

A pending state can mean any of these is still outstanding. A status query
only observes progress; it does not submit a missing second transaction or
resume an interrupted execution.

## 7. Verify the result and handle failures

In your wallet or a testnet explorer, select **Osmosis testnet `osmo-test-5`**
and check the recipient's balance for the quoted USDC IBC denomination.
Compare against the balance before sending and the actual received amount.
The test passes when route status confirms delivery and the recipient's USDC
balance reflects it. A successful Sepolia transaction alone is not a pass.

If it stalls or fails:

- Before source broadcast: fix the reported configuration/signing/gas issue.
- After source broadcast: preserve hashes and inspect the existing transfer;
  do not blindly resend, even if the CLI exits with an error.
- After Injective mint: check whether the onward transaction was broadcast.
  Signer/gas failures can leave the test funds on Injective.
- During IBC forwarding: inspect the transfer/acknowledgement/timeout information
  returned by Skip and the relevant explorers. Recovery depends on the failed hop;
  there is no guaranteed automatic refund to Sepolia.

## 8. Clear local secrets when finished

In each terminal where they were set:

```sh
unset AKASHX_EVM_PRIVATE_KEY
unset AKASHX_EVM_RPC_URL
unset AKASHX_SKIP_API_KEY
unset AKASHX_WALLET_PASSWORD
unset OSMOSIS_ADDRESS
unset BRIDGE_TX_HASH
```

## Route discovery references

- [Skip testnet chains](https://api.skip.build/v2/info/chains?only_testnets=true&include_evm=true)
- [Skip testnet assets](https://api.skip.build/v2/fungible/assets?only_testnets=true&include_evm_assets=true)
- [Skip route endpoint](https://api.skip.build/v2/fungible/route) — read-only POST
  used for the observed quote; a quote does not sign or move funds.
