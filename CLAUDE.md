# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Source documents and workflow

- `SPEC.md` — approved V1 spec (architecture, data model, flows, boundaries). `tasks/plan.md` + `tasks/todo.md` — the task plan; work proceeds one task at a time with the agent-skills `/build` workflow (test first, one commit per task, tick the task in `tasks/todo.md`).
- `TAP_-_Inteli_Blockchain_e_Mercado_Bitcoin_-_MB_Wallet_Bridge.md` — **the binding project charter**. When it conflicts with anything else, the TAP wins.
- `Guia_de_estudo_-_deposito_e_saque_de_cripto_numa_exchange.md` (+ `guia_arquitetura_de_referencia.png`) — a generic study guide on exchange deposit/withdrawal architecture. It is background reading and covers more than this project does (KYC, Travel Rule, HD wallets, multiple chains, sending to external addresses, hot/cold custody). Those parts are **out of scope** under the TAP; don't build them because the guide mentions them.

## Commands

```bash
docker compose up -d --wait db      # Postgres 16 on 127.0.0.1:5433 (5432 is taken on the dev machine)
npm run dev
npm run lint
npm run typecheck                   # runs `next typegen` first (LayoutProps etc. are generated globals)
npm test                            # unit: src/**/*.test.ts(x)
npm test -- src/lib/money.test.ts   # single file; add -t "name" for a single test
npm run test:integration            # tests/integration/**, Postgres + Anvil, files run serially
npm run build
```

Use `127.0.0.1`, not `localhost`, for local services: `localhost` resolves to `::1` here and Docker binds IPv4 only.

**Next.js is 16.x** (see `AGENTS.md`): APIs differ from older versions. Read the relevant guide in `node_modules/next/dist/docs/` before writing routes, config or data fetching.

## What is being built

**MB Wallet Bridge**: an academic PoC (Inteli Blockchain × Mercado Bitcoin) of a hybrid wallet. A demo account logs in by email + code (no password, no seed phrase), sees a **simulated custodial MB balance** (off-chain ledger), activates a **Privy embedded wallet on Sepolia**, and moves **Mock USDC** both ways between the ledger and the wallet. Each transfer shows its state (processing / confirmed / failed) and a Sepolia explorer link. The demo wallet is pre-funded with faucet Sepolia ETH (no gas sponsorship).

Planned stack (from the TAP): Next.js, React, TypeScript, Privy, viem, PostgreSQL, Solidity + OpenZeppelin + Foundry (Mock USDC ERC-20, 6 decimals), Sepolia via a managed RPC.

Out of scope: mainnet or real assets, MB private APIs or internal systems, multiple chains, sending to external addresses, gas sponsorship, private-key export, wallet recovery, mobile, KYC/AML/Travel Rule, production-grade security. These are stretch goals only after the core flow is accepted: the public MB API, online deployment, full transfer history, and support for other users.

## Core rules (these define correctness)

**Amounts and conversion — no floating point anywhere on the balance path (RNF-03):**
- The ledger stores integer **cents** (2 decimals). The token uses 6 decimals: `tokenUnits = cents * 10^4` (that is, the truncated 2-decimal value × 10^6).
- User input is **truncated, never rounded**, to 2 decimals before validation.
- Reject (with an explanatory message, RF-06): zero, negative, more than the available balance, or more than 2 decimal places.
- On-chain amounts received with more than 2 decimals are credited in full: the excess fraction goes in a **separate ledger field** so reconciliation closes with no residue.

**Ledger invariants — the sum of custodial + on-chain balances stays constant (RNF-04), verifiable by a reconciliation query:**
- **MB → wallet:** move the amount from available to **reserved** *before* sending the tx; the available balance shows the reservation immediately. Settle the reservation only on on-chain confirmation.
- **Failure / revert / observation-window timeout:** release the reservation back to available and mark the operation `falhou` (RF-10: the UI must say the funds were returned).
- **Wallet → MB:** credit the ledger **only after on-chain confirmation**. No optimistic credit.
- **Idempotency:** each confirmed tx hash affects the ledger at most once, enforced by a **DB unique constraint on the tx hash** (RNF-02), not only by application logic.
- Record every transfer with hash, amount, direction and state for debugging (RNF-06).

**Network:** Sepolia only. Warn when the wallet is on another chain (RNF-01).

**Repo deliverables (RNF-07/08):** public repo, MIT license; a README that lets someone run the project on another machine; an example env-vars file; a contract deployment script; concise architecture and security docs; a demo script.

## Schedule

Functional freeze: **27/11/2026 at 23:59**. After that, only blocking fixes, documentation and Demo Day prep. Demo Day: 02/12/2026.
