# Spec: MB Wallet Bridge — V1

> Fonte de verdade do escopo: `TAP_-_Inteli_Blockchain_e_Mercado_Bitcoin_-_MB_Wallet_Bridge.md`. O guia de estudo (`Guia_de_estudo_...md`) é referência de arquitetura; o que ele descreve além do TAP (KYC, Travel Rule, HD wallet, multi-rede, saque para terceiros, hot/cold) está fora deste V1.
>
> Escopo único, sem capability map: é **uma** jornada (entrar → ativar → mover nos dois sentidos → reconciliar) cujos critérios de aceite não se verificam separadamente.

## Objective

Provar, em Sepolia e sem ativos reais, que um cliente de uma conta custodial (simulada) do MB consegue ganhar acesso on-chain **sem ferramentas externas nem conhecimento técnico**: entra com e-mail, ativa uma carteira pessoal com um clique e move Mock USDC entre a "Conta MB" e a "Minha carteira" com a mesma simplicidade de uma transferência entre contas num app de banco.

**Usuário:** a conta de demonstração do Demo Day (pessoa sem experiência com wallets).

**Princípio de abstração (guia todas as decisões de UX):**

| O usuário vê | Fica nos bastidores |
|---|---|
| "Conta MB" e "Minha carteira", com saldos em `1.000,00 USDC` | ledger custodial, contrato ERC-20, 6 vs 2 casas decimais |
| Entrar com e-mail + código | Privy, embedded wallet, chaves |
| Botão "Ativar minha carteira" | criação da wallet, rede Sepolia |
| "Transferir" → "Processando… / Concluída / Não concluída — valor devolvido" | assinatura, nonce, gas, confirmações, reorg |
| Link "Ver comprovante" (explorador) | hash, número do bloco (em "Detalhes técnicos", recolhido) |

Nada de pop-up de assinatura, seed phrase, extensão, troca de rede ou menção a gas no fluxo principal. A wallet do Demo Day vem abastecida com Sepolia ETH de faucet (sem patrocínio de gas, conforme TAP).

### User stories

1. Como cliente, entro com meu e-mail e um código, sem senha (RF-01).
2. Como cliente, ativo minha carteira com um clique e vejo seu endereço (RF-02).
3. Como cliente, vejo separadamente o saldo da Conta MB e o da Minha carteira (RF-03).
4. Como cliente, transfiro da Conta MB para a Minha carteira (RF-04) e de volta (RF-05).
5. Como cliente, sou impedido, com mensagem clara, de enviar valor zero, negativo, acima do saldo ou com mais de 2 casas (RF-06).
6. Como cliente, acompanho o estado da transferência e abro o comprovante (RF-07, RF-08).
7. Como cliente, se a transferência falha, vejo que o valor voltou para a Conta MB (RF-10).

## Tech Stack

| Camada | Escolha | Por quê (enxuto) |
|---|---|---|
| App + API | **Next.js (App Router) + React + TypeScript**, Route Handlers como backend | Um só processo/deploy; sem servidor separado |
| Auth + wallet | **Privy** (`@privy-io/react-auth` no cliente: `useLoginWithEmail`, `useCreateWallet`, `useSendTransaction` com `uiOptions.showWalletUIs: false`; `@privy-io/node` no servidor: `verifyAccessToken`) | Login por e-mail/OTP e embedded wallet sem seed phrase; UI de assinatura desligável |
| Blockchain | **viem**, Sepolia via RPC gerenciado (Alchemy ou equivalente) | Tipado, leve |
| Banco | **PostgreSQL 16** (Docker Compose) + **Drizzle ORM / drizzle-kit** para schema e migrações | SQL explícito, restrições no banco |
| Contrato | **Solidity + OpenZeppelin ERC20 + Foundry** (`MockUSDC`, 6 casas, `mint` só do owner) | Teste e deploy no mesmo toolchain; Anvil para testes locais |
| Testes | **Vitest** (unit + integração com Postgres e Anvil), **forge test** | Ver Testing Strategy |
| Runtime | Node.js 24 LTS, npm | Já instalados |

Versões exatas ficam fixadas no `package.json`/`foundry.toml` no scaffold (lockfile commitado).

## Arquitetura

Adaptação mínima da arquitetura de referência do guia: **o saldo custodial vive no ledger; só o módulo de cadeia toca a blockchain**.

```
Navegador (Next.js + Privy)
  │  token Privy em toda chamada
  ▼
Route Handlers (/api/*) ──► ledger (Postgres)      ◄── fonte de verdade do saldo custodial
  │                          ▲
  └─► chain (viem) ──────────┘  confirma / estorna / credita
        │  tesouraria assina MB→wallet (chave no servidor)
        ▼
     Sepolia (MockUSDC)  ◄── embedded wallet assina wallet→MB (no navegador, via Privy)
```

### Contas e valores

- **Tesouraria:** um EOA de servidor que detém o Mock USDC que lastreia o saldo custodial. Sua chave fica só em variável de ambiente do servidor.
- **Conta de demonstração:** criada no primeiro login de um e-mail listado em `DEMO_EMAILS`, com `INITIAL_BALANCE` (padrão `1000.00`) disponível. E-mails fora da lista veem "acesso restrito à demonstração". A tesouraria precisa ter Mock USDC ≥ soma dos saldos iniciais (script de seed faz o mint).
- **Unidades (sem ponto flutuante — RNF-03):** ledger em **centavos** (`bigint`); token em **micro-unidades** (6 casas, `bigint`). `micro = centavos × 10⁴`. Entrada do usuário é string, **truncada** (nunca arredondada) para 2 casas e então validada. Aceita `,` ou `.` como separador decimal.
- **Excedente:** crédito on-chain com mais de 2 casas entra inteiro: `centavos += floor(micro / 10⁴)`, `excess_micro += micro mod 10⁴`; quando `excess_micro ≥ 10⁴`, vira 1 centavo. A reconciliação fecha sem resíduo.

### Modelo de dados (mínimo)

```
accounts
  id, privy_user_id UNIQUE, email, wallet_address UNIQUE NULL,
  available_cents BIGINT CHECK (>= 0), reserved_cents BIGINT CHECK (>= 0),
  excess_micro BIGINT CHECK (0..9999), initial_micro BIGINT,
  last_scanned_block BIGINT NULL, created_at

transfers
  id, account_id, direction ('MB_TO_WALLET' | 'WALLET_TO_MB'),
  amount_micro BIGINT, status ('PROCESSANDO' | 'CONFIRMADA' | 'FALHOU'),
  tx_hash UNIQUE NULL,            -- RNF-02: cada hash afeta o ledger no máximo uma vez
  client_request_id UNIQUE NULL,  -- duplo clique / reenvio do mesmo pedido não duplica
  nonce BIGINT NULL, raw_tx TEXT NULL,   -- só MB→wallet (tesouraria)
  failure_reason TEXT NULL, expires_at, created_at, updated_at
```

`transfers` é o registro consultável de cada movimentação com hash, valor, sentido e estado (RNF-06).

### Fluxo MB → wallet (RF-04)

1. `POST /api/transfers` `{ direction: 'MB_TO_WALLET', amount, clientRequestId }`.
2. Valida (RF-06). Numa transação de banco, com lock consultivo da tesouraria:
   - `UPDATE accounts SET available -= x, reserved += x WHERE id = $1 AND available >= x` (0 linhas → saldo insuficiente; impede dois envios gastarem o mesmo saldo);
   - assina a transação `transfer(wallet, micro)` com a chave da tesouraria (nonce = `pending` da tesouraria) e grava `PROCESSANDO` com `tx_hash`, `nonce`, `raw_tx`.
   - **Reserva antes do envio; hash gravado antes do broadcast.** Se o processo cair depois do commit, o hash já existe e o `raw_tx` pode ser retransmitido.
3. Commit → broadcast. Erro definitivo no broadcast → estorno + `FALHOU`.
4. Confirmação (preguiçosa, sem worker): `GET /api/transfers/:id` chama `advance(transfer)`:
   - recibo com sucesso e `≥ CONFIRMATIONS` blocos → `reserved -= x`, `CONFIRMADA`;
   - recibo revertido → estorno (`available += x, reserved -= x`), `FALHOU`;
   - nó não conhece o tx → retransmite `raw_tx`;
   - passou de `expires_at` (`OBSERVATION_WINDOW_MIN`, padrão 10) sem recibo → envia substituta de cancelamento (mesmo nonce, 0 ETH para si, taxa maior); estorna **só quando o nonce foi consumido por outro tx**, garantindo que o original nunca mais minere.
   - Toda mudança de estado é `UPDATE … WHERE status = 'PROCESSANDO'` (idempotente sob chamadas concorrentes).

### Fluxo wallet → MB (RF-05)

1. Cliente valida o valor contra o saldo on-chain da wallet (RF-06) e envia `transfer(tesouraria, micro)` pela embedded wallet, **com a UI de assinatura da Privy desligada** (a confirmação é a própria tela de "Transferir").
2. Com o hash, `POST /api/transfers` `{ direction: 'WALLET_TO_MB', txHash, clientRequestId }` → registro `PROCESSANDO` (valor decodificado do tx).
3. `advance()` → recibo com sucesso e `≥ CONFIRMATIONS` → lê o evento `Transfer(from = wallet da conta, to = tesouraria)` do `MockUSDC` e credita **o valor do evento** (regra do excedente), `CONFIRMADA`. Revertido → `FALHOU` (nada a estornar). **Sem crédito otimista.**
4. **Recuperação:** `creditInbound(txHash)` é a única função de crédito e tem dois chamadores: o aviso do cliente (passo 2) e uma varredura de logs `Transfer(wallet → tesouraria)` desde `last_scanned_block`, executada ao carregar o painel. Cobre o cliente que fechou a aba entre enviar e avisar; a unicidade de `tx_hash` garante que revarrer os mesmos blocos não credita em dobro.

### Confirmação e rede

- `CONFIRMATIONS` (padrão `2`) é configuração, não constante. Justificativa para o relatório: Sepolia `finalized` leva ~13 min, inviável no Demo Day; 2 blocos (~24 s) basta numa testnet sem valor. O risco de reorg raso é aceito e documentado em `docs/SECURITY.md`.
- Só Sepolia (RNF-01): a embedded wallet é configurada com Sepolia como única rede; se o `chainId` divergir, o app tenta trocar automaticamente e, se não conseguir, mostra aviso e bloqueia o envio.

### Reconciliação (RNF-04)

`npm run reconcile` e `GET /api/reconciliation` (só a própria conta) mostram, em micro-unidades:

- **Por conta (invariante da jornada):** `(available + reserved) × 10⁴ + excess + saldo on-chain da wallet = initial_micro`. Durante um wallet→MB já confirmado on-chain mas ainda não creditado, a diferença aparece como "em trânsito" e zera no próximo `advance`/varredura.
- **Tesouraria:** `saldo on-chain da tesouraria = Σ custodial de todas as contas + entradas em trânsito`.

Diferença ≠ 0 fora de trânsito → saída com código de erro e mensagem.

### Telas

1. **Entrar:** campo de e-mail → campo de código (fluxo headless da Privy, com visual próprio).
2. **Início:** card "Conta MB" (saldo disponível; "reservado" só aparece se > 0) e card "Minha carteira" (saldo + endereço encurtado com botão copiar). Antes da ativação, o card da carteira mostra só o botão "Ativar minha carteira" e uma frase sobre o que é.
3. **Transferir:** escolha do sentido (Conta MB → Minha carteira / Minha carteira → Conta MB), valor, botão "Transferir", mensagens de validação inline.
4. **Status da operação atual:** Processando… → Concluída ✓ / Não concluída (com "o valor voltou para sua Conta MB" quando houver estorno), link "Ver comprovante" e "Detalhes técnicos" recolhido (hash, rede, confirmações).

Textos em pt-BR, valores no formato `1.000,00 USDC`. Erros técnicos viram mensagens humanas (ex.: falta de ETH para taxa → "Não foi possível concluir agora. Tente novamente mais tarde." + detalhe técnico recolhido).

## Commands

```bash
# Infra local
docker compose up -d db              # Postgres em localhost:5432
cp .env.example .env.local           # preencher Privy, RPC, chave da tesouraria, endereço do token

# App
npm install
npm run db:migrate                   # drizzle-kit migrate
npm run dev                          # http://localhost:3000
npm run build && npm start

# Qualidade
npm run lint
npm run typecheck                    # tsc --noEmit
npm test                             # vitest run (unit)
npm test -- src/lib/money.test.ts    # um arquivo
npm test -- -t "trunca"              # um teste pelo nome
npm run test:integration             # vitest com Postgres (docker) + Anvil

# Contrato (em contracts/)
forge build
forge test -vv
forge script script/Deploy.s.sol --rpc-url "$SEPOLIA_RPC_URL" --private-key "$TREASURY_PRIVATE_KEY" --broadcast

# Operação
npm run seed                         # mint de Mock USDC para a tesouraria conforme DEMO_EMAILS × INITIAL_BALANCE
npm run reconcile                    # checa as invariantes; exit != 0 se houver diferença
```

## Project Structure

```
contracts/                 Foundry: src/MockUSDC.sol, test/, script/Deploy.s.sol
src/app/                   Páginas (entrar, início) e src/app/api/* (Route Handlers)
src/components/            UI (cards de saldo, formulário de transferência, status)
src/lib/money.ts           parse/truncamento/validação/conversão centavos↔micro (puro)
src/lib/ledger.ts          operações atômicas: reservar, baixar, estornar, creditar
src/lib/chain.ts           viem: assinar/transmitir da tesouraria, recibos, logs
src/lib/transfers.ts       advance(), creditInbound(), varredura
src/lib/auth.ts            verificação do token Privy → conta
src/db/                    schema Drizzle + migrações
scripts/                   seed.ts, reconcile.ts
tests/integration/         testes com Postgres + Anvil
docs/                      ARCHITECTURE.md, SECURITY.md, DEMO.md (roteiro do Demo Day)
docker-compose.yml  .env.example  README.md  LICENSE (MIT)
```

Testes unitários ficam ao lado do código (`*.test.ts`).

## Code Style

TypeScript `strict`, ESLint padrão do Next.js + Prettier. Dinheiro é sempre `bigint` com unidade no nome; a fronteira com o usuário é string.

```ts
// src/lib/money.ts
export type Cents = bigint;
export type Micro = bigint;

export const MICRO_PER_CENT = 10_000n;

export type ParseResult =
  | { ok: true; cents: Cents }
  | { ok: false; reason: "vazio" | "invalido" | "zero_ou_negativo" | "casas_decimais" | "saldo_insuficiente" };

/** Trunca (nunca arredonda) a entrada para 2 casas e valida contra o saldo. */
export function parseAmount(input: string, availableCents: Cents): ParseResult {
  // ...
}

export const centsToMicro = (c: Cents): Micro => c * MICRO_PER_CENT;
```

- Nomes de domínio em inglês no código (`reserve`, `settle`, `refund`); textos de interface em pt-BR.
- Nada de `number`/`parseFloat` no caminho de saldo; um lint (`no-restricted-syntax`) barra `parseFloat`/`Number(` em `src/lib/{money,ledger,transfers}.ts`.
- Regras de saldo no banco (`CHECK`, `UNIQUE`, `UPDATE … WHERE`), não só na aplicação.
- Commits em Conventional Commits.

## Testing Strategy

| Nível | Ferramenta | O que prova |
|---|---|---|
| Unit | Vitest | `money.ts`: truncamento (`1,239` → `1,23`), rejeições de RF-06, conversões, regra do excedente |
| Integração — ledger | Vitest + Postgres real | **dois envios simultâneos com saldo para um só → só um passa**; mesmo `tx_hash` creditado duas vezes → uma vez; mesmo `clientRequestId` → um registro; estorno devolve exatamente uma vez; invariante da conta fecha após cada passo |
| Integração — cadeia | Vitest + Anvil + MockUSDC implantado | MB→wallet confirma e baixa a reserva; tx revertido estorna; wallet→MB credita só após `CONFIRMATIONS`; varredura repetida não duplica; crédito com 6 casas fecha a reconciliação |
| Contrato | forge test | 6 decimais, só owner faz `mint`, `transfer` padrão |
| Aceite | Roteiro manual `docs/DEMO.md` em Sepolia | Critério de aceite do TAP de ponta a ponta |

O Anvil é o substituto local da Sepolia nos testes automatizados. A Sepolia só é usada no roteiro manual e no Demo Day. Sem meta de cobertura numérica; a meta é cada invariante do ledger ter um teste que falharia se ela quebrasse.

## Boundaries

- **Always:** valores como `bigint` inteiros; reservar antes de enviar; creditar só após confirmação; mudança de estado via `UPDATE … WHERE status = 'PROCESSANDO'`; rodar `lint`, `typecheck` e testes antes de cada commit; manter jargão de blockchain fora da UI principal.
- **Ask first:** adicionar dependência fora da Tech Stack; mudar o schema depois da primeira migração aplicada; mudar `CONFIRMATIONS`/janela padrão; criar repositório remoto, fazer push ou publicar online; qualquer coisa que gaste ETH da tesouraria fora dos scripts.
- **Never:** mainnet, chaves ou fundos reais; commitar `.env*` (só `.env.example`); ponto flutuante no caminho de saldo; crédito otimista; enviar para endereço externo; exportar chave privada; usar APIs privadas do MB.

## Success Criteria

Aceite do TAP, verificável pelo roteiro `docs/DEMO.md` em Sepolia:

- [x] Conta de demonstração entra por e-mail + código, sem senha nem seed phrase. — ✅ Sepolia, 26/11
- [x] Ativa a wallet com um clique; o endereço aparece na tela. — ✅ Sepolia, 26/11
- [x] Os dois saldos aparecem separados e rotulados. — ✅ Sepolia, 26/11
- [x] Valor `0`, negativo ou acima do saldo é bloqueado com mensagem explicativa. Com 3+ casas, o valor é truncado (`10,999` → `10,99`, nunca arredondado) com o aviso "use até duas casas decimais", e nunca é enviado com mais de 2 casas (conciliação entre RF-06 e a regra de truncamento do TAP). — ✅ testes automatizados (`money.test.ts`, `transfer-ui.test.ts`, `outbound.test.ts`); não exercitado manualmente em Sepolia
- [x] Transferência MB → wallet e wallet → MB concluem com valores > 0 e ≤ saldo. — ✅ Sepolia, 26/11 (100,00 ida; 40,00 volta)
- [x] A operação atual mostra Processando → Concluída/Não concluída e o link do explorador da Sepolia. — ✅ Sepolia, 26/11
- [x] Uma falha forçada (ex.: tx revertido no Anvil) devolve a reserva e a tela informa isso. — ✅ testes automatizados no Anvil (`outbound.test.ts`, `stuck.test.ts`); a mensagem de estorno da tela é coberta por `transfer-ui.test.ts`
- [x] Ao final, `npm run reconcile` sai com código 0: soma dos saldos = saldo inicial. — ✅ Sepolia, 26/11: conta 940,00 + 60,00 = 1.000,00; tesouraria 940,00 = esperado
- [x] Reenviar o mesmo hash/recarregar a página/revarrer blocos não altera o ledger (teste de integração). — ✅ testes de integração
- [x] Nenhuma tela do fluxo principal exige instalar extensão, trocar rede ou aprovar pop-up de assinatura (RNF-05). — ✅ Sepolia, 26/11: volta assinada sem pop-up
- [x] O projeto sobe em outra máquina seguindo só o README + `.env.example` + script de deploy (RNF-07); licença MIT e docs de arquitetura e segurança presentes (RNF-08). — ✅ clone limpo seguindo o README (26/11); repositório público pendente

## Cronograma (semanas do TAP como fases; prazo real)

Hoje é 25/11/2026. As fases mantêm a ordem do TAP e são executadas comprimidas até o **congelamento em 27/11, 23h59**.

| Fase | Conteúdo (TAP) | Entrega verificável |
|---|---|---|
| 1 | Arquitetura mínima, UX, Privy, ledger, Mock USDC, tesouraria, conta demo | Testes de ledger verdes (concorrência, idempotência); MockUSDC com testes; login abre o painel |
| 2 | Login, ativação, saldos, MB → wallet, início do retorno | MB → wallet confirmado no Anvil e na Sepolia |
| 3 | Wallet → MB, confirmação, idempotência, reconciliação, integração | Ida e volta + `reconcile` = 0 |
| 4 | Testes do fluxo, documentação, ajustes | README, ARCHITECTURE, SECURITY, DEMO; aceite completo |
| Pós-27/11 | Só correções bloqueadoras, docs e preparação do Demo Day (02/12) | — |

Sem credenciais por enquanto: as fases 1–3 avançam com Anvil; os passos em Sepolia rodam quando Privy, RPC e a tesouraria existirem (o README traz o passo a passo).

## Out of Scope (Deferred)

- Consulta à API pública do MB: meta complementar do TAP, só após o aceite.
- Publicação online: complementar; V1 roda localmente no Demo Day.
- Histórico completo de transferências: complementar; V1 mostra a operação atual.
- Suporte integral a outros usuários: complementar; V1 aceita só `DEMO_EMAILS`.
- Patrocínio de gas / account abstraction: excluído pelo TAP; a wallet demo é pré-abastecida.
- Worker/indexador dedicado: confirmação preguiçosa + varredura bastam para uma conta.
- Ledger de partidas dobradas completo: `accounts` + `transfers` + `CHECK`/`UNIQUE` dão as garantias pedidas com menos peças.
- KYC/KYT, Travel Rule, 2FA, limites, multi-rede, saque para terceiros, custódia hot/cold/HSM: excluídos pelo TAP; citados no relatório como próximos passos com base no guia.

## Open Questions

1. **Credenciais:** é preciso criar o app na Privy (App ID + secret, com login por e-mail e embedded wallets habilitados), uma chave de RPC Sepolia e uma chave de tesouraria abastecida com Sepolia ETH. Sem elas, só Anvil.
2. **Saldo inicial da demo:** `1.000,00 USDC` serve?
3. **RF-09** está vazio no TAP. Assumo que não existe; me corrija se houver um requisito faltando.
4. ~~UI de assinatura da Privy~~ **Resolvida no plano:** a documentação confirma `uiOptions.showWalletUIs: false` por chamada, `supportedChains: [sepolia]` e `createWallet()` manual (obrigatório com login headless). Ainda falta prova prática do envio de ERC-20 via campo `data` no SDK React; isso está na Tarefa 10 do plano, como risco.
