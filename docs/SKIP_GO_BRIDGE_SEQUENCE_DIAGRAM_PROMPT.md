# Agent handoff: Sepolia USDC to Osmosis testnet USDC sequence diagram

## Task

Use the available Enterprise Architect (EA) MCP tools to create a native UML
sequence diagram in the connected EA repository for this project's testnet
bridge. Create editable EA elements, lifelines, messages, notes, and combined
fragments. A Mermaid/PlantUML snippet or imported image alone is not the deliverable.

Diagram title: **akashx — Sepolia USDC to Osmosis Testnet USDC via Skip Go**.

Model the route below and distinguish intended protocol execution from the
current CLI's implementation and unresolved compatibility. This is a modeling
task: do not execute transfers, request secrets, or change application code.

## Scenario and observed route

A read-only Skip route request on **2026-10-08** returned this path for 1 USDC:

```text
Ethereum Sepolia (11155111): USDC
  → CCTP V2 burn / Circle attestation / relayed mint
Injective testnet (EVM view: 1439; Cosmos view: injective-888): USDC
  → IBC transfer
Cosmos provider testnet (provider): IBC USDC
  → IBC forwarding
Osmosis testnet (osmo-test-5): IBC USDC at the supplied osmo1… address
```

The quote returned `does_swap: false`, `txs_required: 2`, and required addresses
for `11155111`, `injective-888`, `provider`, and `osmo-test-5`. Its first operation
was `cctp_transfer_v2` with `tx_index: 0`; the two IBC operations shared
`tx_index: 1`. The CCTP operation had `smart_relay: true`; both IBC operations
had `smart_relay: false`. These flags do not mean IBC needs no relayers.

This is **a successfully returned quote, not a successfully executed transfer**.
Refresh read-only discovery/quoting before modeling if available, and record
any route changes. Do not treat the snapshot as a permanent route guarantee.
The quote does not prove that the installed SDK and current wallet implementation
can execute the Injective portion.

The source token contract in that quote was:

```text
0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
```

The destination USDC denomination was:

```text
ibc/91641A4DFC4270AA1FAB8DD7E5EFD1014A1616AA93C539B3536C8ED2D0C03289
```

The intermediate Injective Cosmos denomination was
`erc20:0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d`.
Use these as snapshot metadata, rechecking before reuse. Use symbolic amounts
(`amountIn`, `estimatedUSDC`) in diagram messages because fees/output change.
Do not invent contracts, IBC channels, exact delays, or successful transaction hashes.

There is no token swap in this route. Final USDC is an IBC representation on
Osmosis, not newly issued native Osmosis USDC. Noble, Base, Akash, and AKT are
outside this diagram. The `provider` chain is a Cosmos testnet, not an Akash
compute provider.

## Local implementation references

- `src/commands/bridge/quote.ts`: read-only quote command and displayed fields.
- `src/commands/bridge/send.ts`: required `--yes`, configuration, fresh quote,
  progress callbacks, and lazy Cosmos wallet loading.
- `src/services/skip-service.ts`: discovery, route resolution, signer/address
  mapping, execution callbacks, and status lookup; primary application reference.
- `src/services/wallet-service.ts`: `loadForPrefix` and the current
  `DirectSecp256k1HdWallet` construction.
- `src/lib/bridge-flags.ts`: environment/slippage defaults.
- `src/commands/bridge/status.ts`: one status lookup per invocation.
- `SKIP_GO_TESTNET_BRIDGE.md`: existing Sepolia-to-Noble runbook, for CCTP context
  only. Do not copy its Noble destination into this diagram.

Read-only CLI quote example, using a placeholder recipient:

```sh
akashx bridge quote \
  --environment testnet \
  --amount 1 \
  --from-chain 11155111 \
  --from-token USDC \
  --to-chain osmo-test-5 \
  --to-token USDC \
  --to-address 'osmo1_YOUR_TESTNET_ADDRESS'
```

Use `--environment testnet` explicitly. Do not enable `--allow-swap` for this
scenario. If the symbol becomes ambiguous, use the full destination denom above.
The example is for quoting; the modeling task does not authorize `bridge send`.

## Lifelines and organization

Arrange application, orchestration, and settlement participants left to right:

| Lifeline                            | Responsibility                                                            |
| ----------------------------------- | ------------------------------------------------------------------------- |
| User                                | Requests quote and authorizes hypothetical execution                      |
| akashx CLI / SkipService            | Resolves inputs, maps addresses/signers, reports progress                 |
| Local signer(s)                     | Sepolia viem signer and intermediate Cosmos signer(s)                     |
| Skip Go SDK                         | Execute route, request signatures, broadcast and track                    |
| Skip Go API                         | Discover assets/chains, plan route, construct transactions, report status |
| Sepolia RPC / USDC + CCTP contracts | Allowance, source burn, confirmation                                      |
| Circle attestation service          | Attest the source CCTP message after required finality                    |
| CCTP smart relayer                  | Fetch attestation and submit destination mint                             |
| Injective testnet                   | Receive CCTP USDC, execute onward Cosmos IBC transaction                  |
| IBC relayers                        | Relay packets, proofs, acknowledgements, and timeouts                     |
| Cosmos provider testnet             | Receive and forward IBC USDC toward Osmosis                               |
| Osmosis testnet / recipient         | Receive IBC USDC at osmo1…                                                |

Represent Injective's EVM and Cosmos interfaces on one chain lifeline with a
note, or as two clearly linked lifelines of the same chain. Do not draw an
additional bridge between these views without evidence from the transaction
plan. CCTP smart relaying and IBC relaying are separate responsibilities.

If the diagram becomes too wide, use a second settlement interaction referenced
by `ref`. Preserve both IBC hops, the intermediate user transaction, and final delivery.

## Required sequence

### 1. Read-only quote

1. User → CLI: `bridge quote(testnet, Sepolia USDC, Osmosis USDC, amountIn)`.
2. CLI → SDK → API: discover chains and assets, optionally in a `par` fragment.
   Include EVM entries, request `onlyTestnets: true`, and filter chains to testnets.
3. CLI: resolve assets/chains and convert the input amount to atomic units.
4. CLI → SDK → API: `route(...)`, with `allowSwaps: false`, `allowMultiTx: true`,
   `allowUnsafe: false`, `smartRelay: true`, and source/destination asset IDs.
   Do not show mainnet-only smart-swap options in this request.
5. API → SDK → CLI: operations, estimated USDC output, fees, duration,
   `requiredChainAddresses`, and `txsRequired`.
6. CLI → User: quote and warnings, including two route transactions for the
   observed path. The displayed slippage-based minimum is a CLI calculation;
   it does not imply a DEX swap or confirmed delivery.

No signing or broadcast occurs here. The current `route` request does not
include the destination address; it is mapped during execution.

### 2. Authorization and signer preparation

7. User → CLI: hypothetical `bridge send(..., --environment testnet, --yes)`.
   Model this interaction without executing it. `--yes` authorizes approval and
   route submission; the current CLI does not prompt again after printing its quote.
8. CLI → Local signer / Sepolia RPC: initialize EVM signer and read chain ID.
   Show no private key material. Expected source chain ID is `11155111`.
9. CLI → SDK → API: get a fresh route; validate RPC/source-chain match and print
   the new quote. A previous quote is not a reservation.
10. CLI: map the observed required addresses:
    - `11155111` → configured EVM account.
    - `injective-888` → intermediate Cosmos account with `inj` prefix.
    - `provider` → intermediate Cosmos account with `cosmos` prefix.
    - `osmo-test-5` → supplied `osmo1…` recipient.
11. CLI → local wallet: load intermediate signers through `loadForPrefix`.
    Note the compatibility limitation below. A required address alone does not
    mean its owner must submit a separate transaction.
12. CLI → SDK: `executeRoute(route, userAddresses, signer callbacks, slippage)`.
    SDK ↔ API: obtain executable transaction plan as needed; use exact internal
    API message names only after checking the installed SDK or official docs.

**Compatibility note required on the diagram:** The current wallet creates a
`DirectSecp256k1HdWallet` with a changed Bech32 prefix. Merely producing an
`inj1…` string does not establish compatible Injective key derivation, account
mapping, or signing. Verify how the CCTP mint recipient maps to the Injective
account that signs the subsequent IBC transaction, and whether the installed
SDK supports that signer and CCTP V2 route. Until checked, label execution
“intended flow; Injective signer compatibility unverified.” Do not model this
as already working or add a new automatic compatibility check to the CLI.

The service only exposes its configured source EVM signer and intermediate
Cosmos signers. If the transaction plan needs an EVM signer on `1439`, the current
service cannot supply it. It also cannot supply an Osmosis destination signer;
ordinary receipt does not need one. MetaMask and Keplr are not runtime signing
dependencies of this CLI.

### 3. Sepolia source transaction (route transaction index 0)

13. SDK → Sepolia: inspect USDC allowance for the route-specified spender.
14. `opt [allowance insufficient]`: SDK → signer: sign approval; broadcast to
    Sepolia and await confirmation. SDK → CLI: approval progress callback.
    Approval is additional to the quoted route transaction count as applicable.
15. SDK → signer: sign source route transaction; broadcast to Sepolia.
16. SDK → CLI → User: source hash via `onTransactionBroadcast`, at broadcast time.
17. Sepolia executes the CCTP V2 burn and emits its message; await required finality.
    Note: **A successful Sepolia transaction does not mean USDC reached Osmosis.**

### 4. CCTP settlement and onward Cosmos transaction

18. Circle observes the source message/finality and produces an attestation.
    CCTP relayer ↔ Circle: retrieve attestation, with `loop [attestation pending]`.
19. CCTP relayer → Injective EVM interface (`1439`): submit message and attestation.
    Injective validates and mints USDC to the route-specified recipient.
20. SDK tracks arrival and readiness for the next route transaction. The mint
    does not itself imply that a user-authorized IBC transaction has been sent.
21. SDK → intermediate signer: request the Injective Cosmos transaction signature
    for the onward transfer (`tx_index: 1`), subject to the compatibility note.
    Require the correct account and available testnet gas under the actual plan.
22. SDK → Injective Cosmos interface (`injective-888`): broadcast the signed
    transaction; SDK → CLI → User: intermediate transaction hash/progress.
23. Injective executes the transfer and emits an IBC packet toward `provider`.
24. IBC relayer → provider: relay packet/proof; provider validates and receives
    the USDC representation, then forwards it toward `osmo-test-5` using the
    route's forwarding instructions. The quote groups both hops into transaction
    index 1; do not invent a third user-signed transaction on provider.
25. IBC relayer → Osmosis: relay onward packet/proof; Osmosis validates and credits
    IBC USDC at `osmo1…`. Show acknowledgements relayed back along the path,
    respecting forwarding semantics rather than direct chain-to-chain RPC calls.

These are protocol/SDK-level interactions inferred from the observed operations,
not methods implemented directly in `SkipService`. Verify exact transaction
construction, forwarding mechanisms, and signer needs from the plan. Avoid
inventing a DEX swap, conversion to AKT, or a later transfer to Akash.

### 5. Tracking and completion

26. During execution, SDK ↔ API: track progress; SDK → CLI → User: broadcast and
    completion callbacks. Individual transaction completion is not final route success.
27. In `loop [while pending; user repeats status command]`, show User → CLI:
    `bridge status(sourceTxHash, --chain-id 11155111)`; CLI → API through SDK:
    `transactionStatus({ chainId, txHash })`; return transfer states and explorer links.
    Each CLI invocation performs one lookup, not an automatic polling loop.
28. Show end-to-end success only after Osmosis delivery is confirmed. The current
    status command prints returned states; it does not perform a separate balance check.

Tracking overlaps settlement. CCTP relaying may continue after the CLI exits,
but this two-transaction route also needs the subsequent local signature and
broadcast. Do not promise the whole route completes with the CLI stopped after
the Sepolia burn, or imply that `bridge status` resumes execution.

## Alternative paths

Use concise `alt`, `opt`, or `break` fragments:

- Missing asset/chain or no route: report before broadcast.
- Wrong source RPC chain, unavailable wallet, unsupported signer, or incompatible
  SDK transaction: show the applicable execution failure, distinguishing known
  current checks from unresolved compatibility risks.
- Insufficient source ETH/USDC, approval failure, or source transaction failure:
  no successful downstream delivery on that branch.
- Attestation or relayer pending: continue observing the existing transaction;
  repeating `bridge send` initiates a new transfer.
- Injective signature/gas/transaction failure after mint: funds can remain on
  Injective; do not report Osmosis delivery or automatic rollback to Sepolia.
- IBC timeout or forwarding failure: report actual transfer states and any
  protocol/API-provided recovery information. Do not guarantee a source-EVM refund.
- Status API error: tracking failure is not proof of on-chain transfer failure.

## Enterprise Architect MCP workflow

1. Discover actual EA MCP capabilities and inspect the connected model, selected
   package, and diagrams. Do not invent tool names, IDs, or supported operations.
2. Read model conventions. Reuse an appropriate package or create
   `akashx / Cross-chain funding` where supported. Inspect any matching diagram
   before updating; preserve unrelated content and avoid duplicates on reruns.
3. Create a UML Interaction and Sequence diagram with native lifelines, ordered
   messages, execution occurrences where supported, fragments, and notes.
4. Use synchronous local/API calls, dashed returns, and asynchronous messages
   for broadcast/events/relaying. Do not portray the route as one atomic transaction.
5. Add phase labels, testnet chain IDs, quote observation date, and the distinction
   between returned route, intended execution, and unverified CLI compatibility.
6. Save and read the model back through MCP. Inspect a rendered preview/export
   if available for sequence order, connections, fragments, overlaps, and clipping.
7. If tools cannot create part of the native model, report the precise limitation
   and completed work. Do not claim an image substitute meets the deliverable.

## Acceptance criteria and final report

- An editable native EA sequence diagram exists in the connected repository.
- The flow is quote → authorization → allowance/signing → Sepolia burn →
  attestation → Injective mint → intermediate signature/transaction → IBC to
  provider → forwarding to Osmosis → USDC receipt.
- Both route transactions and conditional ERC-20 approval are distinguishable.
- Injective EVM/Cosmos views, provider forwarding, and Osmosis receipt are clear.
- There is no swap and no Noble or Akash settlement stage.
- The returned quote is not represented as an executed or fully validated CLI route.
- Compatibility limits, pending settlement, and partial failures are visible.
- Return EA package path, diagram name and GUID/ID, created/updated element summary,
  preview/export location if available, and unresolved assumptions/tool limitations.

## References and verification

Local source code governs application behavior. The observed route came from a
read-only POST to the [Skip route endpoint](https://api.skip.build/v2/fungible/route)
with source chain `11155111`, destination `osmo-test-5`, the asset identifiers
above, `amount_in: "1000000"`, `allow_multi_tx: true`, `allow_swaps: false`,
`allow_unsafe: false`, `smart_relay: true`, and `cumulative_affiliate_fee_bps: "0"`.

- [Skip testnet chains](https://api.skip.build/v2/info/chains?only_testnets=true&include_evm=true)
  — chain IDs and chain types.
- [Skip testnet assets](https://api.skip.build/v2/fungible/assets?only_testnets=true&include_evm_assets=true)
  — denominations; an asset listing alone does not establish a route.
- [Skip](https://www.skip.build/) — official documentation entry point.

Use current official Circle, Injective, and Skip documentation when resolving
protocol/signing details. Record what was verified and what remains an assumption.
