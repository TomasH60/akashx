---
title: Command reference
description: Find the akashx command for each stage of the tenant and bridge workflows.
---

Use `akashx <command> --help` for the full argument and flag reference for your
installed version. Run `npm run build` after updating the CLI source.

## Configuration and diagnostics

| Command                     | Purpose                                                      |
| --------------------------- | ------------------------------------------------------------ |
| `config show`               | Show effective tenant configuration.                         |
| `config set <key> <value>`  | Save a configuration value.                                  |
| `doctor`                    | Check chain connectivity, wallet balances, and certificates. |
| `provider status [address]` | Inspect a registered provider.                               |

## Wallets and funding

| Command                         | Purpose                                                        |
| ------------------------------- | -------------------------------------------------------------- |
| `wallet create`                 | Create an encrypted wallet and print its recovery phrase once. |
| `wallet import`                 | Import the phrase in `AKASHX_WALLET_MNEMONIC`.                 |
| `wallet address --prefix akash` | Show a derived address; `inj` uses Injective derivation.       |
| `wallet balance [address]`      | Query balances on the configured Akash chain.                  |
| `fund mint-act <amount> --yes`  | Burn an explicit `uakt` amount to mint ACT.                    |
| `cert create --yes`             | Generate and publish a reusable client certificate.            |
| `cert status [address]`         | Inspect published certificates.                                |

## Bridging

| Command                                | Purpose                                      |
| -------------------------------------- | -------------------------------------------- |
| `bridge quote`                         | Get a route without signing or broadcasting. |
| `bridge send --yes`                    | Start a new transfer.                        |
| `bridge status <hash> --chain-id <id>` | Inspect an existing transfer.                |

Quote and send require source/destination chains and tokens, amount, and recipient.
Follow the [testnet runbook](../guides/testnet-bridge/) for a complete command.

## Deployments and leases

| Command                                                                 | Purpose                                                 |
| ----------------------------------------------------------------------- | ------------------------------------------------------- |
| `deployment init <file>`                                                | Generate a web SDL template without overwriting a file. |
| `deployment validate <file>`                                            | Validate SDL and calculate its manifest hash.           |
| `deployment create <file> --dseq <id> --deposit <coin> --yes`           | Create the on-chain deployment.                         |
| `deployment bids <dseq>`                                                | List open bids.                                         |
| `lease create <dseq> --provider <address> --yes`                        | Accept exactly one matching bid.                        |
| `lease list <dseq>`                                                     | List active leases.                                     |
| `deployment manifest send <file> <dseq> --yes`                          | Send the matching SDL to a lease provider.              |
| `deployment status <dseq> --workload`                                   | Inspect chain and workload status.                      |
| `deployment logs <dseq> --follow`                                       | Follow container logs.                                  |
| `deployment ssh <dseq> --service <name> --user <user> --identity <key>` | Connect with system SSH.                                |
| `deployment close <dseq> --yes`                                         | Close the deployment and its leases.                    |

When a selection is ambiguous, specify `--provider`, `--gseq`, `--oseq`, and, for
bid acceptance, `--bseq`. Use the values returned by the chain.

## Combined workflow

```sh
akashx deployment deploy web.yaml \
  --dseq "$DSEQ" \
  --deposit 500000uact \
  --provider "$PROVIDER" \
  --yes
```

Use the live deposit requirements, not an assumed amount. After an interruption,
inspect the deployment before running the same command with `--resume`.
Resume requires an existing active deployment with a matching SDL; it does not
create another one. See [recovery details](../guides/tenant-cli/#combined-deployment-and-resume).
