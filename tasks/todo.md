# Tarefas — MB Wallet Bridge V1

Plano e decisões: `tasks/plan.md` · Spec: `SPEC.md`
Toda tarefa só conta como feita com `npm run lint && npm run typecheck && npm test` verdes e commit próprio (Conventional Commits).

---

## Fase 1 — Semana 1: fundação

### [x] Tarefa 1: Scaffold do projeto e infraestrutura local
**Descrição:** Criar o app Next.js (App Router, TS strict) com ESLint + Prettier e Vitest, o Postgres no `docker-compose.yml`, o `.env.example` com todas as variáveis da spec, a licença MIT, o `.gitignore` (que bloqueia `.env*` menos o exemplo) e um README mínimo com a seção "Credenciais", para as contas Privy/RPC/tesouraria poderem ser criadas em paralelo.
**Aceite:**
- [ ] `npm run dev` abre uma página inicial vazia em pt-BR
- [ ] `docker compose up -d db` sobe o Postgres acessível pela `DATABASE_URL` do exemplo
- [ ] Scripts `lint`, `typecheck`, `test`, `test:integration`, `build` existem e passam
**Verificação:** `npm run lint && npm run typecheck && npm test && npm run build`; `docker compose up -d db && pg_isready -h localhost`
**Dependências:** nenhuma
**Arquivos:** `package.json`, `docker-compose.yml`, `.env.example`, `vitest.config.ts`, `README.md`, `LICENSE` (+ arquivos gerados pelo `create-next-app`)
**Tamanho:** M

### [x] Tarefa 2: Regras de valor (`money.ts`)
**Descrição:** Funções puras, feitas com TDD: `parseAmount` (aceita `,`/`.`, trunca para 2 casas e devolve o motivo da rejeição), `centsToMicro`, `splitMicro` (centavos + excedente), `formatBRL`-like (`1.000,00 USDC`). Adicionar a regra de lint que barra `parseFloat`/`Number(` nos módulos de saldo.
**Aceite:**
- [ ] `"10,999"` → 1099 centavos; `"0"`, `"-1"`, `"abc"`, `""` e valor > saldo são rejeitados com o motivo correto
- [ ] `splitMicro(1_234_567n)` → `{ cents: 123n, excessMicro: 4567n }`
- [ ] Lint falha se `parseFloat` aparecer em `src/lib/money.ts`
**Verificação:** `npm test -- src/lib/money.test.ts`
**Dependências:** 1
**Arquivos:** `src/lib/money.ts`, `src/lib/money.test.ts`, `eslint.config.mjs`
**Tamanho:** S

### [x] Tarefa 3: Contrato `MockUSDC` com testes e script de deploy
**Descrição:** Projeto Foundry em `contracts/` com um ERC-20 OpenZeppelin de 6 casas, `mint` restrito ao owner (a tesouraria) e o script `Deploy.s.sol`.
**Aceite:**
- [ ] `decimals() == 6`; `mint` por não-owner reverte; `transfer` padrão funciona
- [ ] `forge script` implanta no Anvil local e imprime o endereço
**Verificação:** `cd contracts && forge test -vv`; `anvil` + `forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast`
**Dependências:** 1
**Arquivos:** `contracts/foundry.toml`, `contracts/src/MockUSDC.sol`, `contracts/test/MockUSDC.t.sol`, `contracts/script/Deploy.s.sol`
**Tamanho:** S

### [x] Tarefa 4: Schema e ledger atômico
**Descrição:** Schema Drizzle de `accounts` e `transfers`, conforme a spec (CHECKs e UNIQUEs), com migração. `ledger.ts` com `reserve`, `settle`, `refund` e `credit` (regra do excedente), todas atômicas e condicionadas a `status = 'PROCESSANDO'`. Testes de integração contra o Postgres real.
**Aceite:**
- [ ] Dois `reserve` simultâneos com saldo para um só → exatamente um passa
- [ ] `credit` com o mesmo `tx_hash` duas vezes → saldo alterado uma vez; mesmo `client_request_id` → um registro
- [ ] `refund` chamado duas vezes devolve uma vez; a invariante da conta fecha após cada operação
**Verificação:** `npm run db:migrate && npm run test:integration -- tests/integration/ledger.test.ts`
**Dependências:** 1, 2
**Arquivos:** `src/db/schema.ts`, `drizzle.config.ts`, `src/db/migrations/*`, `src/lib/ledger.ts`, `tests/integration/ledger.test.ts`
**Tamanho:** M

### [x] Tarefa 5: Login por e-mail e conta de demonstração
**Descrição:** `PrivyProvider` (`defaultChain`/`supportedChains` = Sepolia, sem criação automática de wallet); tela "Entrar" headless (e-mail → código) com `useLoginWithEmail`; `auth.ts` validando o Bearer token com `@privy-io/node`; `GET /api/me`, que cria a conta no primeiro acesso de um e-mail de `DEMO_EMAILS` com `INITIAL_BALANCE` e devolve os saldos; painel com o card "Conta MB".
**Aceite:**
- [ ] Sem token ou com token inválido → 401; e-mail fora de `DEMO_EMAILS` → "acesso restrito à demonstração"
- [ ] Primeiro acesso cria a conta uma vez só (dois `GET /api/me` concorrentes não duplicam)
- [ ] Painel mostra "Conta MB · 1.000,00 USDC" (verificação manual quando houver credenciais Privy)
**Verificação:** `npm run test:integration -- tests/integration/me.test.ts` (verificador Privy injetado/mocado); manual em `npm run dev`
**Dependências:** 4
**Arquivos:** `src/app/providers.tsx`, `src/components/LoginForm.tsx` (login na própria `/`, sem rota separada), `src/lib/auth.ts`, `src/app/api/me/route.ts`, `src/app/page.tsx`
**Tamanho:** M

### Checkpoint 1 — fundação
- [ ] Lint, typecheck, unit, integração e `forge test` verdes
- [ ] Revisão humana antes da Fase 2

---

## Fase 2 — Semana 2: carteira e MB → wallet

### [x] Tarefa 6: Módulo de cadeia, harness Anvil e seed da tesouraria
**Descrição:** `chain.ts` (viem) com: assinar `transfer` da tesouraria (devolve `hash`, `nonce`, `rawTx`), transmitir `rawTx`, ler recibo com nº de confirmações, ler saldo do token, consultar o nonce já consumido e ler logs `Transfer`. Harness de teste que sobe o Anvil, implanta o `MockUSDC` e expõe os clientes. `scripts/seed.ts` faz o mint para a tesouraria.
**Aceite:**
- [ ] O hash calculado antes do broadcast é igual ao hash do recibo
- [ ] Retransmitir o mesmo `rawTx` não gera um segundo tx
- [ ] `npm run seed` deixa a tesouraria com `DEMO_EMAILS × INITIAL_BALANCE`
**Verificação:** `npm run test:integration -- tests/integration/chain.test.ts`
**Dependências:** 3
**Arquivos:** `src/lib/chain.ts`, `tests/integration/anvil.ts`, `tests/integration/chain.test.ts`, `scripts/seed.ts`
**Tamanho:** M

### [x] Tarefa 7: Ativar carteira e ver saldo on-chain
**Descrição:** Card "Minha carteira" com o botão "Ativar minha carteira" (`createWallet()`); `POST /api/wallet` grava o endereço na conta (uma vez) e `last_scanned_block` = bloco atual; `GET /api/me` passa a devolver o saldo on-chain; o card mostra o saldo e o endereço encurtado com botão copiar.
**Aceite:**
- [ ] Ativar duas vezes não troca o endereço; um endereço já usado por outra conta é rejeitado
- [ ] Depois da ativação, os dois saldos aparecem separados e rotulados (RF-02, RF-03)
**Verificação:** `npm run test:integration -- tests/integration/wallet.test.ts`; manual com credenciais
**Dependências:** 5, 6
**Arquivos:** `src/app/api/wallet/route.ts`, `src/app/api/me/route.ts`, `src/components/WalletCard.tsx`, `src/components/AccountCard.tsx`, `tests/integration/wallet.test.ts`
**Tamanho:** M

### [x] Tarefa 8: Transferência MB → wallet (API + confirmação + estorno)
**Descrição:** `POST /api/transfers` para `MB_TO_WALLET`: valida, reserva e assina numa única transação de banco (com lock consultivo da tesouraria), grava o hash e só então transmite. `advance()` em `transfers.ts` cobre confirmar após `CONFIRMATIONS`, estornar quando revertido e retransmitir se o nó não conhece o tx. `GET /api/transfers/:id` chama `advance()`.
**Aceite:**
- [ ] Transferência no Anvil termina `CONFIRMADA`, com a reserva baixada e a wallet creditada
- [ ] Um tx revertido (forçado no teste) termina `FALHOU`, com o valor de volta ao disponível exatamente uma vez
- [ ] O mesmo `clientRequestId` enviado duas vezes → uma transferência só
**Verificação:** `npm run test:integration -- tests/integration/outbound.test.ts`
**Dependências:** 4, 6, 7
**Arquivos:** `src/lib/transfers.ts`, `src/app/api/transfers/route.ts`, `src/app/api/transfers/[id]/route.ts`, `tests/integration/outbound.test.ts`
**Tamanho:** M

### [x] Tarefa 9: Tela de transferência e status da operação
**Descrição:** Formulário com o sentido (Conta MB → Minha carteira / Minha carteira → Conta MB), o valor e a validação inline usando `money.ts` (RF-06). Componente de status que consulta `GET /api/transfers/:id` até um estado final e mostra "Processando… / Concluída / Não concluída — o valor voltou para sua Conta MB", o link "Ver comprovante" e "Detalhes técnicos" recolhido. Por enquanto, só a ida.
**Aceite:**
- [ ] Os valores inválidos de RF-06 desabilitam "Transferir" e mostram o motivo em linguagem simples
- [ ] Os estados e o link do explorador aparecem (RF-07, RF-08, RF-10); nenhum jargão no texto principal
**Verificação:** `npm test -- src/lib/transfer-ui.test.ts` (lógica da tela extraída para funções puras, sem dependências de teste de DOM); manual em Sepolia quando houver credenciais (a carteira embutida da Privy não opera no Anvil)
**Dependências:** 8
**Arquivos:** `src/components/TransferForm.tsx`, `src/components/TransferStatus.tsx`, `src/app/page.tsx`, `src/components/TransferForm.test.tsx`
**Tamanho:** M

### [x] Tarefa 10: Envio wallet → MB no navegador (validação prática da Privy + guarda de rede)
**Descrição:** No sentido de volta, o cliente valida o valor contra o saldo on-chain, codifica `transfer(tesouraria, micro)` com viem e envia via `useSendTransaction` com `showWalletUIs: false`. Guarda de rede: se o `chainId` da wallet não for Sepolia, tenta trocar; se não conseguir, bloqueia com aviso (RNF-01). **Esta tarefa é o teste do risco da Privy.**
**Aceite:**
- [ ] Com credenciais, o envio em Sepolia sai sem nenhum pop-up e devolve um hash — **pendente de verificação manual (Tarefa 16)**; a tipagem instalada da Privy (`UnsignedTransactionRequest.data?: string`, `chainId?: number`) confirma que o caminho é suportado, então o plano B não foi implementado
- [ ] Se o caminho por `data` não funcionar, o plano B (provider EIP-1193 + viem `walletClient`) fica implementado e anotado no plano
- [ ] Rede diferente de Sepolia → aviso e envio bloqueado
**Verificação:** manual em Sepolia (precisa de credenciais); `npm test -- src/lib/erc20.test.ts` para a codificação do calldata
**Dependências:** 7, 9
**Arquivos:** `src/components/TransferForm.tsx`, `src/lib/erc20.ts`, `src/lib/erc20.test.ts`, `src/components/NetworkGuard.tsx`
**Tamanho:** S

### Checkpoint 2 — carteira e ida
- [ ] MB → wallet completo no Anvil (confirma e estorna); com credenciais, também em Sepolia
- [ ] Risco da Privy resolvido (comprovado ou plano B no lugar)
- [ ] Revisão humana antes da Fase 3

---

## Fase 3 — Semana 3: volta, idempotência e reconciliação

### [x] Tarefa 11: Crédito wallet → MB após confirmação
**Descrição:** `POST /api/transfers` para `WALLET_TO_MB` recebe `{ txHash, clientRequestId }` e cria o registro `PROCESSANDO`. `creditInbound(txHash)` espera `CONFIRMATIONS`, exige um `Transfer` do `MockUSDC` com `from` = wallet da conta e `to` = tesouraria, e credita o valor do evento com a regra do excedente. Revertido → `FALHOU`, sem mexer no ledger. A tela do passo 10 envia o hash e reaproveita o componente de status.
**Aceite:**
- [ ] Nada é creditado antes de `CONFIRMATIONS`; depois, o crédito acontece uma vez só, mesmo com o mesmo hash enviado de novo
- [ ] Um tx sem `Transfer` válido para a tesouraria (ou de outra wallet) não credita
- [ ] Um `Transfer` de `1,234567` credita 123 centavos e 4567 de excedente, e a invariante da conta fecha
**Verificação:** `npm run test:integration -- tests/integration/inbound.test.ts`
**Dependências:** 8, 10
**Arquivos:** `src/lib/transfers.ts`, `src/app/api/transfers/route.ts`, `src/components/TransferForm.tsx`, `tests/integration/inbound.test.ts`
**Tamanho:** M

### [x] Tarefa 12: Varredura de recuperação de entradas
**Descrição:** `scanInbound(account)` lê os logs `Transfer(wallet → tesouraria)` de `last_scanned_block` até `latest − CONFIRMATIONS`, em janelas de blocos, chama `creditInbound` para cada hash e avança `last_scanned_block`. Roda no `GET /api/me`.
**Aceite:**
- [ ] Um tx enviado sem aviso do cliente aparece creditado ao recarregar o painel
- [ ] Varrer os mesmos blocos duas vezes (inclusive voltando `last_scanned_block`) não altera o ledger
**Verificação:** `npm run test:integration -- tests/integration/scan.test.ts`
**Dependências:** 11
**Arquivos:** `src/lib/transfers.ts`, `src/app/api/me/route.ts`, `tests/integration/scan.test.ts`
**Tamanho:** S

### [x] Tarefa 13: Transação presa: cancelamento e estorno seguro
**Descrição:** Em `advance()`, um MB → wallet sem recibo depois de `expires_at` dispara uma substituta de cancelamento (mesmo nonce, 0 ETH para a própria tesouraria, taxa maior). O estorno só acontece quando o nonce foi consumido por outro tx; se o original minerar no meio do caminho, a transferência segue como confirmada.
**Aceite:**
- [ ] No Anvil com automine desligado, um tx preso + janela expirada → cancelamento minerado → `FALHOU` com estorno único
- [ ] Se o original minerar antes do cancelamento → `CONFIRMADA`, sem estorno
**Verificação:** `npm run test:integration -- tests/integration/stuck.test.ts`
**Dependências:** 8
**Arquivos:** `src/lib/transfers.ts`, `src/lib/chain.ts`, `tests/integration/stuck.test.ts`
**Tamanho:** S

### [x] Tarefa 14: Reconciliação
**Descrição:** `scripts/reconcile.ts` e `GET /api/reconciliation` calculam a invariante por conta e a da tesouraria (com entradas em trânsito), conforme a spec. O script sai com código ≠ 0 se houver diferença fora de trânsito.
**Aceite:**
- [ ] Depois de ida e volta no Anvil, `npm run reconcile` sai com 0
- [ ] Uma diferença forçada (UPDATE manual no saldo) faz o script sair com ≠ 0 e uma mensagem clara
**Verificação:** `npm run test:integration -- tests/integration/reconcile.test.ts`
**Dependências:** 11, 12
**Arquivos:** `src/lib/reconcile.ts`, `scripts/reconcile.ts`, `src/app/api/reconciliation/route.ts`, `tests/integration/reconcile.test.ts`
**Tamanho:** S

### Checkpoint 3 — jornada completa
- [ ] Ida e volta no Anvil + `reconcile` = 0; todos os testes de idempotência verdes
- [ ] Revisão humana antes da Fase 4

---

## Fase 4 — Semana 4: testes do fluxo, docs e entrega (até 27/11, 23h59)

### [x] Tarefa 15: Documentação
**Descrição:** README completo (pré-requisitos, credenciais Privy/RPC/faucet/tesouraria passo a passo, deploy do contrato, seed, execução, testes). `docs/ARCHITECTURE.md` (diagrama, fluxos, estados, decisões). `docs/SECURITY.md` (chave da tesouraria, confirmações e reorg, idempotência, o que não é seguro para produção, próximos passos do guia: KYC/KYT, Travel Rule, HSM/MPC). `docs/DEMO.md` (roteiro do Demo Day passo a passo).
**Aceite:**
- [ ] Uma pessoa sobe o projeto do zero numa pasta limpa seguindo só o README (RNF-07)
- [ ] SECURITY.md responde às perguntas do guia que se aplicam ao escopo (confirmações, idempotência, onde fica a chave)
**Verificação:** `git clone` em diretório temporário → seguir o README até `npm run dev` e `npm run test:integration`
**Dependências:** 14
**Arquivos:** `README.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/DEMO.md`
**Tamanho:** M

### [ ] Tarefa 16: Aceite em Sepolia e polimento de UX
**Descrição:** Implantar o `MockUSDC` em Sepolia, rodar o seed, abastecer a wallet demo com ETH de faucet e executar `docs/DEMO.md` de ponta a ponta. Corrigir textos, estados de carregamento e mensagens de erro que vazem jargão.
**Aceite:**
- [ ] Todos os itens de Success Criteria da `SPEC.md` marcados
- [ ] `npm run reconcile` = 0 depois do roteiro em Sepolia
**Verificação:** roteiro `docs/DEMO.md` em Sepolia + `npm run reconcile`
**Dependências:** 15 (e credenciais)
**Arquivos:** ajustes pontuais em `src/components/*`, `docs/DEMO.md`
**Tamanho:** S

### Checkpoint final — congelamento 27/11, 23h59
- [ ] Success Criteria da spec completos
- [ ] Tudo commitado; depois disso, só correções bloqueadoras, docs e preparação do Demo Day (02/12)
