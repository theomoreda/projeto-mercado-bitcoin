# MB Wallet Bridge

Prova de conceito acadêmica (Inteli Blockchain × Mercado Bitcoin): uma conta custodial **simulada** do MB conectada a uma carteira pessoal (embedded wallet) na testnet **Sepolia**, com transferências de Mock USDC nos dois sentidos e reconciliação dos saldos.

> Somente testnet. Nenhum ativo real, nenhuma API privada do MB. Projeto experimental, sem garantia de segurança para produção.

Escopo e regras: [`SPEC.md`](SPEC.md) · Plano: [`tasks/plan.md`](tasks/plan.md)

## Pré-requisitos

- Node.js ≥ 22 e npm
- Docker com Docker Compose
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `anvil`) para o contrato e os testes de integração

## Rodar localmente

```bash
npm install
cp .env.example .env.local          # preencha conforme "Credenciais"
docker compose up -d db             # Postgres em 127.0.0.1:5433
npm run dev                         # http://localhost:3000
```

## Qualidade

```bash
npm run lint
npm run typecheck
npm test                            # testes unitários (src/**/*.test.ts)
npm test -- src/lib/money.test.ts   # um arquivo
npm test -- -t "trunca"             # um teste pelo nome
npm run test:integration            # Postgres + Anvil (tests/integration)
npm run build
```

## Credenciais

Tudo é de testnet e gratuito. Os valores vão em `.env.local` (nunca commitado).

1. **Privy** → crie um app em <https://dashboard.privy.io>.
   - Em *Login methods*, habilite **Email**.
   - Em *Embedded wallets*, habilite carteiras **Ethereum**.
   - Copie o **App ID** para `NEXT_PUBLIC_PRIVY_APP_ID` e o **App secret** para `PRIVY_APP_SECRET`.
   - Em *Allowed domains*, inclua `http://localhost:3000`.
2. **RPC Sepolia** → crie um app Sepolia num provedor (ex.: Alchemy) e copie a URL HTTPS para `RPC_URL`.
3. **Tesouraria** → gere uma chave **só para teste**: `cast wallet new`. Coloque a chave em `TREASURY_PRIVATE_KEY` e abasteça o endereço com Sepolia ETH num faucet (ex.: o faucet da Alchemy ou do Google Cloud).
4. **Demo** → coloque o e-mail da conta de demonstração em `DEMO_EMAILS`.

## Licença

[MIT](LICENSE)
