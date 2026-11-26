# Implementation Plan: MB Wallet Bridge — V1

Source spec: `SPEC.md` (aprovada em 25/11/2026)
Lista de tarefas detalhada (critérios de aceite, verificação, arquivos): `tasks/todo.md`

## Overview

Um app Next.js que conecta uma Conta MB simulada (ledger em Postgres) a uma embedded wallet Privy em Sepolia e move Mock USDC nos dois sentidos, escondendo a blockchain atrás de uma experiência de app de banco. As 4 semanas do TAP viram 4 fases, executadas até o congelamento em **27/11/2026, 23h59**. Cada fase termina num checkpoint com revisão humana.

## Grafo de dependências

```
scaffold (1)
 ├── money.ts (2) ──────────────┐
 ├── MockUSDC (3) ──► chain.ts + Anvil (6) ──┐
 └── schema + ledger (4) ───────┤            │
                                ▼            ▼
                      login + conta demo (5) │
                                │            │
                                ▼            ▼
                         ativação da carteira (7)
                                │
                 ┌──────────────┴───────────────┐
                 ▼                              ▼
     MB→wallet backend (8)          envio wallet→MB no navegador (10)
                 │                              │
                 ▼                              ▼
     tela de transferência (9)      crédito wallet→MB (11) ──► varredura (12)
                 │
                 ▼
     transação presa (13)
                 └──────────────┬───────────────┘
                                ▼
                       reconciliação (14) ──► docs (15) ──► aceite Sepolia (16)
```

## Architecture Decisions

- **Um processo só (Next.js Route Handlers).** Sem servidor nem worker separados. A confirmação é "preguiçosa": `advance()` roda quando a tela consulta o status.
- **Regras de dinheiro no banco.** `CHECK` impede saldo negativo, `UNIQUE(tx_hash)` dá a idempotência de RNF-02, `UNIQUE(client_request_id)` barra pedido duplicado, e `UPDATE … WHERE available >= x` / `WHERE status = 'PROCESSANDO'` resolvem concorrência sem lock explícito na conta.
- **Hash antes do broadcast.** O tx da tesouraria é assinado dentro da transação de banco que reserva o saldo; hash, nonce e `raw_tx` são gravados antes de transmitir. Um lock consultivo do Postgres serializa os nonces da tesouraria.
- **Crédito de entrada com função única.** `creditInbound(txHash)` é chamada pelo aviso do cliente e pela varredura de logs; o valor creditado vem do evento `Transfer`, não do cliente.
- **Anvil como Sepolia de teste.** Os testes automatizados de cadeia sobem um Anvil e implantam o `MockUSDC`. A Sepolia fica só para o aceite manual, o que destrava as fases 1–3 sem credenciais.
- **Lógica pura separada de I/O.** `money.ts` não depende de nada; `ledger.ts` só do banco; `chain.ts` só do viem; `transfers.ts` orquestra os três. É isso que deixa cada camada testável sozinha.
- **Privy headless.** Usa `useLoginWithEmail` com tela própria, `createWallet()` manual no botão "Ativar" (a criação automática não dispara com login headless), `showWalletUIs: false` e `supportedChains: [sepolia]`. No servidor, `@privy-io/node` → `verifyAccessToken`.

## Task List

### Fase 1 — Semana 1: fundação (ledger antes da blockchain)
- [x] Tarefa 1: Scaffold do projeto e infraestrutura local
- [x] Tarefa 2: Regras de valor (`money.ts`)
- [x] Tarefa 3: Contrato `MockUSDC` com testes e script de deploy
- [x] Tarefa 4: Schema e ledger atômico
- [x] Tarefa 5: Login por e-mail e conta de demonstração

**Checkpoint 1:** lint, typecheck, unit e integração de ledger verdes; `forge test` verde; com credenciais Privy, o login abre o painel com `1.000,00 USDC` na Conta MB.

### Fase 2 — Semana 2: carteira e MB → wallet
- [x] Tarefa 6: Módulo de cadeia, harness Anvil e seed da tesouraria
- [x] Tarefa 7: Ativar carteira e ver saldo on-chain
- [x] Tarefa 8: Transferência MB → wallet (API + confirmação + estorno)
- [x] Tarefa 9: Tela de transferência e status da operação
- [ ] Tarefa 10: Envio wallet → MB no navegador (validação prática da Privy + guarda de rede)

**Checkpoint 2:** MB → wallet completo no Anvil (confirma e estorna); com credenciais, ativação e MB → wallet em Sepolia; o envio silencioso de ERC-20 pela Privy está comprovado ou há um plano B decidido.

### Fase 3 — Semana 3: wallet → MB, idempotência e reconciliação
- [ ] Tarefa 11: Crédito wallet → MB após confirmação
- [ ] Tarefa 12: Varredura de recuperação de entradas
- [ ] Tarefa 13: Transação presa: cancelamento e estorno seguro
- [ ] Tarefa 14: Reconciliação

**Checkpoint 3:** ida e volta no Anvil com `npm run reconcile` = 0; todos os testes de idempotência verdes; revisão humana antes da fase final.

### Fase 4 — Semana 4: testes do fluxo, docs e entrega (até 27/11, 23h59)
- [ ] Tarefa 15: Documentação (README, ARCHITECTURE, SECURITY, DEMO)
- [ ] Tarefa 16: Aceite em Sepolia e polimento de UX

**Checkpoint final:** todos os Success Criteria da spec marcados; projeto sobe do zero seguindo o README; congelamento.

## Paralelização

As tarefas 2, 3 e 4 são independentes entre si depois da 1. As tarefas 8–9 (ida) e 10–11 (volta) só compartilham `transfers.ts`; o contrato da API `POST /api/transfers` é definido na Tarefa 8. A execução padrão é sequencial, na ordem acima.

## Risks and Mitigations

| Risco | Impacto | Mitigação |
|---|---|---|
| Prazo de ~2,5 dias para 16 tarefas | Alto | Tarefas S/M, fatias verticais e corte pela lista Deferred. Se apertar, a Tarefa 13 cai para "estorno só quando o nonce já foi consumido", sem enviar cancelamento ativo, e fica documentada |
| Credenciais (Privy, RPC, tesouraria) ainda não existem | Alto | Anvil cobre as fases 1–3; o passo a passo de credenciais entra no README logo na Tarefa 1 para você criar em paralelo |
| `sendTransaction` da Privy com `data` de ERC-20 não confirmado na doc React | Médio | Validado cedo na Tarefa 10. Plano B: assinar pelo provider EIP-1193 da embedded wallet via viem `walletClient`, ainda sem UI |
| Limite de faixa do `eth_getLogs` no RPC gratuito | Médio | Varredura em janelas de blocos a partir de `last_scanned_block` (definido na ativação), nunca do bloco 0 |
| Faucet de Sepolia ETH lento ou com limite | Médio | Abastecer tesouraria e wallet demo assim que existirem; o gasto por demo é mínimo |
| Reorg raso com `CONFIRMATIONS = 2` | Baixo | Testnet sem valor; aceito e documentado em SECURITY.md |

## Open Questions

- Saldo inicial `1.000,00 USDC` e RF-09 inexistente: assumidos como na spec, já que não houve objeção.
- Repositório remoto público (RNF-08): criar onde (GitHub/GitLab) e quando? Fica em "Ask first"; até lá os commits ficam locais.
