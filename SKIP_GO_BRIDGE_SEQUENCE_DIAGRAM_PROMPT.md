# Agent handoff: mainnet USDC to Akash AKT sequence diagram

## Task

Use the available Enterprise Architect (EA) MCP tools to create a native UML
sequence diagram in the connected EA repository for this project's mainnet
cross-chain swap. Create editable EA elements, lifelines, messages, notes, and
combined fragments; a Mermaid/PlantUML snippet or an imported image alone is
not the deliverable.

Diagram title: **akashx — Mainnet EVM USDC to Akash AKT via Skip Go**.

Model the intended mainnet behavior, informed by the current implementation.
This is a modeling task: do not execute a transfer, request secrets, or modify
the application code.

## Scenario and assumptions

Use Base as the concrete source EVM chain, matching the CLI examples. The
illustrative asset path is:

```text
Base mainnet: native USDC
  → Circle CCTP burn / attestation / mint
Noble: USDC
  → IBC transfer
Osmosis: USDC representation → swap → AKT representation
  → IBC transfer back to Akash
Akash mainnet: native AKT at the supplied akash1… address
```

This is a **representative architecture assumption, not a verified live quote**.
Skip chooses the actual bridges, chains, swaps, and transaction count. Before
labeling this as a currently executable route, check current official
documentation and, if available, read-only Skip chain/asset/route discovery.
The public Skip Go UI currently includes a Noble USDC.n deprecation notice, so
do not infer current route availability from the testnet runbook. If discovery
selects another path, document the difference and either model the verified
path or retain this path explicitly labeled illustrative. Never fabricate a
successful quote or claim a transfer was executed.

Use `--environment mainnet` explicitly; this project's default is testnet.
Use symbolic amounts (`amountIn`, `estimatedAKT`, `minimumAKT`) and placeholder
addresses. Do not invent exchange rates, fees, pool IDs, contract addresses,
IBC channels, CCTP versions/domains, or precise completion times. Resolve such
details from route metadata only if needed. An example input is 5 USDC with
1% slippage, not a promise that this amount is routable.

The destination is the **Akash blockchain**, not a provider, deployment,
escrow account, or Akash compute service. Receiving AKT completes this scope.

## Read these local sources first

- `src/commands/bridge/quote.ts`: read-only quote command and displayed fields.
- `src/commands/bridge/send.ts`: explicit `--yes` submission authorization,
  configuration, quote/progress callbacks, and lazy Cosmos wallet loading.
- `src/services/skip-service.ts`: route resolution, SDK integration, signer
  selection, execution callbacks, and status lookup. This is the main source
  of truth for application behavior.
- `src/lib/bridge-flags.ts`: environment and slippage defaults.
- `src/services/wallet-service.ts`: local Cosmos signing wallet behavior.
- `src/commands/bridge/status.ts`: independent status query.
- `SKIP_GO_TESTNET_BRIDGE.md`: context for asynchronous CCTP settlement only.
  Do not copy Sepolia, `grand-1`, testnet endpoints, or the Noble-only destination
  into this mainnet diagram.

## Lifelines and visual organization

Arrange left to right in application, orchestration, and settlement groups:

| Lifeline                         | Responsibility                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------- |
| User                             | Requests quote and authorizes submission                                        |
| akashx CLI / SkipService         | Resolves inputs, configures route, maps addresses, reports progress             |
| Local signer(s)                  | viem EVM signer; optional encrypted Cosmos wallet signer                        |
| Skip Go SDK                      | `executeRoute`, signer callbacks, transaction execution and tracking            |
| Skip Go API                      | Chain/asset discovery, route planning, transaction construction/status services |
| Base RPC / USDC + CCTP contracts | Source allowance and burn transaction execution                                 |
| Circle attestation service       | Attests the finalized CCTP message                                              |
| Smart relayer / IBC relayers     | Submit destination transactions and relay IBC packets/proofs                    |
| Noble chain / CCTP module        | Validate attestation, mint USDC, initiate onward IBC transfer                   |
| Osmosis chain / swap execution   | Receive USDC, execute swap, send AKT over IBC                                   |
| Akash chain / recipient account  | Receive native AKT and record final settlement                                  |

The combined relayer lifeline is a visual simplification: CCTP smart relaying
and IBC relaying have distinct roles. Add a note explaining this. If the
diagram becomes too wide, use an interaction reference to a second settlement
sequence rather than dropping the swap or final Akash delivery.

## Required sequence

### 1. Read-only quote

1. User → CLI: `bridge quote(mainnet, Base, USDC, amountIn, Akash, AKT, recipient)`.
2. CLI → API: discover chains/assets through the SDK. Show a `par` fragment
   for these independent requests if practical. The implementation requests
   EVM entries, uses `onlyTestnets: false`, and filters chains to mainnet.
3. CLI: resolve chain/token references and convert the amount to atomic units.
4. CLI → API: `route(...)` with `allowSwaps: true`, `allowMultiTx: true`,
   `allowUnsafe: false`, `smartRelay: true`, and source/destination asset IDs.
   The implementation also enables EVM swaps and split routes on mainnet.
5. API → CLI: route operations, estimated output, fees, duration,
   `requiredChainAddresses`, and `txsRequired`.
6. CLI → User: quote, minimum received, price impact, fees, and warnings.
   Note that the displayed minimum is calculated from the estimated output
   and requested slippage; it is not evidence of settlement.

No signing or broadcast occurs in this phase. The current quote request does
not send the recipient address to `route`; addresses are mapped for execution.

### 2. Authorized execution and signer preparation

7. User → CLI: `bridge send(..., --environment mainnet, --yes)`.
   `--yes` authorizes approval and transfer submission. Do not invent an
   interactive confirmation after the quote: `send` gets and prints a fresh
   quote and then proceeds under that authorization.
8. CLI → Local signer: construct viem signer from locally configured EVM key;
   signer/RPC → CLI: source chain ID. Never show key material in messages.
9. CLI → API: resolve a fresh route; CLI checks the RPC chain matches the
   resolved source chain and reports the new quote.
10. CLI: map `requiredChainAddresses`:
    - Source EVM chain → configured EVM account.
    - Destination Akash chain → user-supplied `akash1…` address.
    - Other required Cosmos chains → derive/load an account for the chain's
      Bech32 prefix from the encrypted CLI wallet.
11. CLI → SDK: `executeRoute(route, userAddresses, signer callbacks, slippage)`.
    Show an `opt [intermediate Cosmos address/signature required]` for local
    wallet use. A required address does not itself prove that a separate
    user-signed transaction is necessary; follow the returned transaction plan.

The CLI signs locally. MetaMask and Keplr are not runtime signing dependencies
of this implementation. The destination can be an external recipient; merely
receiving AKT does not require its private key. The current service supplies
Cosmos signers for intermediate chains only and would fail if execution asked
it for a destination-chain signer. It also supports only the configured source
EVM signer. Note these constraints instead of drawing unsupported behavior.

### 3. Source EVM transaction

12. SDK ↔ API: obtain the route's executable transaction plan as needed
    (conceptual SDK-internal step; use exact API operation names only if verified).
13. SDK → Base: inspect USDC allowance for the route-specified spender.
14. `opt [allowance insufficient]`: SDK → signer: sign approval; submit it to
    Base; wait for confirmation. SDK → CLI: allowance progress callback.
    An approval is not a bridge completion and need not be counted in `txsRequired`.
15. SDK → signer: sign source route transaction; submit to Base.
16. Base: execute the route's CCTP burn and emit the cross-chain message.
17. SDK → CLI → User: source transaction hash via `onTransactionBroadcast`.
    Place this notification at broadcast, before final source confirmation.
18. Base confirms the transaction and reaches required finality. Add a note:
    **Source transaction success does not mean AKT has arrived on Akash.**

### 4. Asynchronous cross-chain settlement

19. Circle observes the source CCTP message/finality and produces its signed
    attestation. Relayer ↔ Circle: retrieve attestation, using a
    `loop [attestation pending]` if appropriate.
20. Smart relayer → Noble: submit CCTP message plus attestation. Noble validates
    it and mints USDC to the route-specified recipient. Circle does not mint AKT.
21. Route execution on Noble initiates an IBC transfer toward Osmosis. Model
    the actual trigger/signature as route-dependent; do not assume minting alone
    automatically starts an IBC transfer.
22. IBC relayer relays the packet/proof to Osmosis; Osmosis validates and
    receives the USDC representation. Show acknowledgement conceptually.
23. Osmosis executes the route's USDC → AKT swap, subject to its minimum-output
    constraints. The trade may use multiple pools; one message is sufficient
    at this abstraction level. AKT here is an IBC representation.
24. Osmosis initiates the onward AKT IBC transfer. IBC relayer delivers it to
    Akash; Akash validates it and credits native AKT to the recipient for the
    assumed return-to-origin path. Show acknowledgement back to the sending
    chain, mediated by relaying rather than a direct RPC call between chains.

Steps 19–24 describe the illustrative route, not hard-coded CLI logic. Mark
them accordingly. Use asynchronous messages for relaying; relayers submit
proofs/transactions while chains validate and execute state changes.

### 5. Tracking and completion

25. SDK ↔ API: track route progress during execution; callbacks → CLI → User:
    transaction broadcast/completion updates. Per-transaction completion is
    distinct from end-to-end route success.
26. In a separate `loop [while pending; user repeats status command]`, show
    User → CLI: `bridge status(sourceTxHash, sourceChainId)`;
    CLI → API: `transactionStatus({ chainId, txHash })`;
    API → CLI → User: transfer states and explorer links.
    The CLI command performs one lookup per invocation, not its own polling loop.
27. Show successful route completion only after final Akash delivery is
    confirmed. The current status command prints returned transfer states;
    do not invent a separate balance-verification call in the implementation.

Tracking can overlap settlement. Already-submitted relayed stages can continue
without the CLI process, but routes requiring additional local signatures may
need the process to continue. Do not promise background completion for every
multi-transaction route.

## Required alternative paths

Use compact `alt`, `opt`, or `break` fragments, with detailed notes if needed:

- Unsupported asset/chain, no safe route, or unavailable liquidity: report the
  route error before broadcast.
- RPC/source-chain mismatch or unavailable required signer: abort execution.
- Insufficient gas/balance or failed approval/source transaction: surface failure;
  do not depict destination mint or AKT receipt as successful.
- Attestation or relayer pending: keep tracking the existing source hash;
  repeating `bridge send` would create a new transfer.
- Swap minimum not met, IBC timeout, or downstream failure: report the affected
  transfer state and recovery/refund information only when supplied by the
  protocol/API. Funds may be on an intermediate chain. Do not show an atomic
  rollback of the CCTP burn or a guaranteed refund to the source EVM account.
- Status API failure: report a tracking error without equating it to lost funds
  or a confirmed on-chain failure.

## Enterprise Architect MCP workflow

1. Discover the actual EA MCP tools and inspect the connected model, selected
   package, and existing diagrams. Do not invent tool names, IDs, or capabilities.
2. Read any applicable model conventions. Reuse an appropriate package or
   create a dedicated `akashx / Cross-chain funding` package where supported.
   If a diagram with this title exists, inspect it before updating; preserve
   unrelated model content and avoid duplicate lifelines on reruns.
3. Create a UML Interaction and Sequence diagram using the repository's
   supported structure. Add native participants/lifelines, ordered messages,
   execution occurrences where supported, combined fragments, and notes.
4. Use synchronous calls for local/API request-response work, dashed return
   messages, and asynchronous messages for broadcast/events/relaying. Assign
   explicit sequence ordering. Do not represent a multi-chain flow as one
   synchronous transaction or a single atomic activation.
5. Add phase labels and an assumption note describing the illustrative route,
   mainnet scope, and distinction between application code and SDK/protocol
   internals. Avoid putting secrets or actual wallet data into the model.
6. Save, read the diagram/model back through MCP, and inspect a rendered preview
   or export if supported. Check ordering, endpoint connections, fragment
   coverage, readable labels, and that nothing overlaps or is clipped.
7. If an MCP operation is unavailable, report the precise limitation and the
   native model work completed. Do not claim an image-only substitute is an
   editable EA sequence diagram.

## Acceptance criteria and final report

- The native EA diagram exists and is editable in the connected repository.
- The reader can follow quote → authorization → signing/approval → source burn
  → attestation → mint → IBC → swap → IBC → native AKT receipt.
- The final asset is AKT on Akash; the flow does not stop at Noble USDC.
- The diagram distinguishes CLI, SDK/API, local signers, relayers, and chains.
- Mainnet assumptions and live-route verification status are explicit.
- Conditional approval/signers, pending settlement, and downstream failures
  are represented without implying atomic cross-chain rollback.
- Return the EA package path, diagram name and GUID/ID, created/updated element
  summary, any preview/export location, and unresolved assumptions/tool limits.

## Official reference starting points

Local source code governs claims about this project's implementation. These
references inform protocol context and should be rechecked during modeling:

- [Skip Go](https://www.skip.build/) — routing product and documentation entry point.
- [Skip Go application](https://go.skip.build/) — current asset availability notices;
  a UI listing is not proof that a specific route is executable.
- [Noble CCTP module](https://docs.noble.xyz/cctp/module_interface) — CCTP on Noble
  is a Cosmos SDK module; CCTP and IBC can be composed.
- [Osmosis integration documentation](https://docs.osmosis.zone/integrate/) —
  swaps and cross-chain integration paths.
- [Akash: AKT on Osmosis](https://akash.network/blog/how-to-access-and-provide-akt-token-liquidity-on-osmosis/)
  — historical context for AKT trading on Osmosis, not a current route guarantee.
