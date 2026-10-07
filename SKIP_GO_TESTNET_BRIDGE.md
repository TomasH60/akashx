# Skip Go Testnet Bridge Test

This runbook tests an EVM-to-Cosmos bridge through the `akashx` CLI:

```text
Ethereum Sepolia USDC -> Circle CCTP -> Noble Testnet USDC.n
```

Skip Go does not currently list an Akash testnet, so Sepolia USDC cannot be
bridged to Akash testnet. This Noble route exercises the same EVM signing,
ERC-20 approval, Skip Go routing, CCTP transfer, relay, and status-tracking
parts of the integration without using real funds.

## Prerequisites

- Node.js 22.18+ (22.x) or 24.x
- A dedicated MetaMask test account
- Sepolia ETH in that account for gas
- Sepolia USDC in that account
- A Keplr wallet with Noble Testnet enabled
- The Noble Testnet `noble1...` address copied from Keplr

Use the [Circle testnet faucet](https://faucet.circle.com/?allow=true) for
Sepolia USDC. Noble Testnet can be added through the
[Keplr testnet dashboard](https://testnet.keplr.app/chains/noble-testnet).
Noble Testnet uses chain ID `grand-1`.

Noble is a Cosmos SDK chain and cannot be added through MetaMask's normal EVM
network settings. MetaMask is the Sepolia source wallet; Keplr supplies the
Noble destination address.

## Install the CLI dependencies

From the repository root:

```sh
cd /Users/tomas/fiit/akashx
npm install
```

## Create the encrypted CLI wallet

Skip this step if the wallet was already created. The password must contain at
least 12 characters.

```sh
read -s "AKASHX_WALLET_PASSWORD?Choose a wallet password: "
echo
export AKASHX_WALLET_PASSWORD

npm run dev -- wallet create
```

Back up the recovery phrase printed by the command. Do not commit the phrase or
wallet password to Git.

## Export the dedicated MetaMask test-account key

In the MetaMask browser extension:

1. Open the account selector.
2. Click the three dots beside the dedicated test account.
3. Select **Account details**.
4. Select **Private key**.
5. Enter the MetaMask password and reveal the key.

The private key controls this address on every EVM network. Use an account that
has no mainnet assets.

Enter the key without saving it in shell history:

```sh
read -s "AKASHX_EVM_PRIVATE_KEY?Paste the MetaMask test-account private key: "
echo
export AKASHX_EVM_PRIVATE_KEY
```

The CLI accepts the 64 hexadecimal characters with or without the `0x` prefix.
Validate the value without displaying it:

```sh
node -e 'const k=(process.env.AKASHX_EVM_PRIVATE_KEY??"").trim().replace(/^0x/,""); console.log({valid:k.length===64 && /^[0-9a-fA-F]+$/.test(k),length:k.length})'
```

The expected result is:

```text
{ valid: true, length: 64 }
```

## Configure the test

Replace the Noble address with the real Noble Testnet address from Keplr.

```sh
export NOBLE_ADDRESS='noble1_YOUR_KEPLR_TESTNET_ADDRESS'
export AKASHX_EVM_RPC_URL='https://ethereum-sepolia-rpc.publicnode.com'
```

An authenticated Skip Go API key is optional. Set one if available:

```sh
export AKASHX_SKIP_API_KEY='YOUR_SKIP_API_KEY'
```

Confirm that the MetaMask account associated with
`AKASHX_EVM_PRIVATE_KEY` holds both Sepolia USDC and enough Sepolia ETH for
approval and bridge gas.

## Request a read-only quote

This command does not sign or broadcast a transaction:

```sh
npm run dev -- bridge quote \
  --environment testnet \
  --amount 1 \
  --from-chain 11155111 \
  --from-token USDC \
  --to-chain noble-testnet \
  --to-token USDC.n \
  --to-address "$NOBLE_ADDRESS"
```

A valid route should resemble:

```text
Environment: Skip Go testnet
Send: 1 USDC
Receive: 0.99 USDC.n
Actions: cctp-transfer
Transactions required: 1
Required address chains: 11155111, grand-1
```

Amounts, fees, and timing estimates may change between quotes.

## Execute the bridge

The `--yes` flag authorizes the CLI to submit the approval and bridge
transactions:

```sh
npm run dev -- bridge send \
  --environment testnet \
  --amount 1 \
  --from-chain 11155111 \
  --from-token USDC \
  --to-chain noble-testnet \
  --to-token USDC.n \
  --to-address "$NOBLE_ADDRESS" \
  --slippage 1 \
  --yes
```

Typical progress output is:

```text
ERC-20 approval: pending
ERC-20 approval: completed
Broadcast 11155111: 0x...
```

Copy the broadcast transaction hash. Do not run `bridge send` again while the
first transfer is pending, because that starts another transfer.

## Track the bridge

Replace the placeholder with the printed Sepolia transaction hash:

```sh
export BRIDGE_TX_HASH='0x_YOUR_SEPOLIA_TRANSACTION_HASH'

npm run dev -- bridge status "$BRIDGE_TX_HASH" \
  --chain-id 11155111
```

Inspect the source transaction in a browser:

```text
https://sepolia.etherscan.io/tx/0x_YOUR_SEPOLIA_TRANSACTION_HASH
```

## Understand a pending transfer

An Etherscan status of **Success** means the source Sepolia transaction
succeeded. The complete bridge has additional asynchronous stages:

1. Sepolia confirms the USDC burn transaction.
2. Circle produces a signed CCTP attestation.
3. Skip's smart relayer submits the destination mint on Noble Testnet.
4. Skip observes the Noble transaction and marks the route complete.

The command can therefore show `STATE_PENDING` while Etherscan already shows
success. Check Circle's testnet attestation state without exposing any secret:

```sh
curl -sS \
  "https://iris-api-sandbox.circle.com/v2/messages/0?transactionHash=$BRIDGE_TX_HASH"
```

Useful Circle states include:

- `pending_confirmations`: waiting for sufficient Sepolia finality
- `complete`: the Circle attestation is ready

If Circle reports `complete` but Skip remains pending, the smart relayer is
waiting to submit or index the Noble receive transaction. Testnet relayers may
take several additional minutes. Once the source transaction is broadcast and
Skip can report its status, the original CLI process can be stopped with
`Ctrl+C`; tracking and smart relaying continue independently.

Do not retry the transfer unless the status explicitly fails. A pending transfer
has already committed the test USDC to its CCTP message.

## Clear secrets

After the test:

```sh
unset AKASHX_EVM_PRIVATE_KEY
unset AKASHX_EVM_RPC_URL
unset AKASHX_SKIP_API_KEY
unset AKASHX_WALLET_PASSWORD
unset NOBLE_ADDRESS
unset BRIDGE_TX_HASH
```
