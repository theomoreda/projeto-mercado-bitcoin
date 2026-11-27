# MB Wallet Bridge

Prova de conceito acadêmica (Inteli Blockchain × Mercado Bitcoin): uma conta custodial **simulada** do MB conectada a uma carteira pessoal (embedded wallet) na testnet **Sepolia**, com transferências de Mock USDC nos dois sentidos e reconciliação dos saldos. O usuário entra com e-mail, ativa a carteira com um clique e transfere como num app de banco; a blockchain fica nos bastidores.

> Somente testnet. Nenhum ativo real, nenhuma API privada do MB. Projeto experimental, sem garantia de segurança para produção.

- Escopo e regras: [`SPEC.md`](SPEC.md)
- Arquitetura e decisões: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Segurança: [`docs/SECURITY.md`](docs/SECURITY.md)
- Roteiro do Demo Day: [`docs/DEMO.md`](docs/DEMO.md)

## Pré-requisitos

- Node.js ≥ 22 e npm
- Docker com Docker Compose
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `cast`, `anvil`)

## Instalação

```bash
git clone --recurse-submodules <url-do-repositório>
cd projeto-mercado-bitcoin
# se clonou sem --recurse-submodules:
git submodule update --init --recursive

npm install
cp .env.example .env.local
docker compose up -d --wait db      # Postgres em 127.0.0.1:5433
npm run db:migrate
```

> Use `127.0.0.1` (não `localhost`) nas URLs locais: em algumas máquinas `localhost` resolve para IPv6 e o Docker escuta só em IPv4.

## Configuração (Sepolia)

Tudo é de testnet e gratuito. Os valores vão em `.env.local`, que nunca é commitado.

1. **Privy** → crie um app em <https://dashboard.privy.io>.
   - *Login methods*: habilite **Email**.
   - *Embedded wallets*: habilite carteiras **Ethereum**.
   - Copie o **App ID** para `NEXT_PUBLIC_PRIVY_APP_ID` e o **App secret** para `PRIVY_APP_SECRET`.
   - *Allowed domains*: inclua `http://localhost:3000`.
2. **RPC Sepolia** → crie um app Sepolia num provedor (ex.: Alchemy) e coloque a URL HTTPS em `RPC_URL`.
3. **Tesouraria** → gere uma chave **só de teste** com `cast wallet new`, coloque a chave em `TREASURY_PRIVATE_KEY` e abasteça o endereço com Sepolia ETH num faucet (ex.: Alchemy ou Google Cloud). Uns 0,05 ETH bastam.
4. **Contrato** → implante o Mock USDC (a tesouraria vira owner):
   ```bash
   set -a; . ./.env.local; set +a
   (cd contracts && forge script script/Deploy.s.sol --rpc-url "$RPC_URL" --private-key "$TREASURY_PRIVATE_KEY" --broadcast --gas-estimate-multiplier 750)
   ```
   Copie o endereço impresso (`NEXT_PUBLIC_TOKEN_ADDRESS=0x…`) para `.env.local`. O multiplicador é necessário porque a Sepolia cobra cerca de 7× mais gas na criação de contratos do que a simulação local do Foundry estima (≈ 7,4 M contra 1,1 M). Sem ele, o deploy reverte por falta de gas. O custo continua irrisório (≈ 0,0002 ETH de teste). O script recusa qualquer rede que não seja Sepolia ou Anvil.
5. **Demo** → coloque o e-mail da conta de demonstração em `DEMO_EMAILS` e emita o lastro da tesouraria:
   ```bash
   npm run seed        # tesouraria fica com DEMO_EMAILS × INITIAL_BALANCE em Mock USDC
   ```

Variáveis opcionais (padrões em `.env.example`): `INITIAL_BALANCE`, `CONFIRMATIONS`, `OBSERVATION_WINDOW_MIN`, `SCAN_CHUNK_BLOCKS` (reduza se o RPC recusar faixas grandes de `eth_getLogs`).

## Executar

```bash
npm run dev         # http://localhost:3000
```

Depois de entrar e ativar a carteira, abasteça-a com um pouco de Sepolia ETH para a taxa do envio de volta (o endereço aparece no card "Minha carteira"):

```bash
cast send <endereço-da-carteira> --value 0.005ether --rpc-url "$RPC_URL" --private-key "$TREASURY_PRIVATE_KEY"
```

Para conferir as invariantes de saldo a qualquer momento (sai com código 1 se houver diferença):

```bash
npm run reconcile
```

## Testes e qualidade

```bash
npm run lint
npm run typecheck
npm test                            # unitários (src/**/*.test.ts)
npm test -- src/lib/money.test.ts   # um arquivo; -t "nome" para um teste
npm run test:integration            # Postgres real + Anvil local (sobem sozinhos; exige docker compose up -d db)
(cd contracts && forge test -vv)    # contrato
npm run build
```

Os testes de integração usam um banco próprio (`mb_wallet_bridge_test`, criado e migrado automaticamente) e sobem um Anvil por arquivo de teste, com o Mock USDC implantado. Nenhum teste automatizado usa a Sepolia.

## Estrutura

```
contracts/       Mock USDC (Foundry): src/, test/, script/Deploy.s.sol
src/app/         Telas e rotas /api (Next.js App Router)
src/components/  Cards de saldo, formulário de transferência, status
src/lib/         Regras de negócio: money, ledger, chain, transfers, reconcile
src/db/          Schema Drizzle e migrações
scripts/         seed.ts e reconcile.ts (Node, sem build)
tests/integration/
docs/
```

## Licença

[MIT](LICENSE)
