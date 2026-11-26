# Segurança

Projeto acadêmico em testnet. **Não é seguro para produção**, e não deve receber chaves ou fundos de mainnet. Este documento descreve o que a PoC garante, o que ela não garante e o que mudaria num sistema real.

## O que a PoC garante (e onde)

| Garantia | Como | Teste |
|---|---|---|
| Cada hash afeta o ledger no máximo uma vez (RNF-02) | `UNIQUE(transfers.tx_hash)` + transições `UPDATE … WHERE status = 'PROCESSANDO'` | `ledger.test.ts`, `inbound.test.ts`, `scan.test.ts` |
| Dois envios não gastam o mesmo saldo | `UPDATE accounts … WHERE available_cents >= x` + `CHECK (available_cents >= 0)` | `ledger.test.ts` (concorrência) |
| Duplo clique não duplica | `UNIQUE(client_request_id)` | `ledger.test.ts`, `outbound.test.ts` |
| Estorno acontece uma vez só | Transição condicionada ao status | `ledger.test.ts`, `outbound.test.ts` |
| Sem crédito otimista | O crédito exige recibo com ≥ `CONFIRMATIONS`; o valor vem do evento `Transfer` | `inbound.test.ts` |
| Sem ponto flutuante no saldo (RNF-03) | `bigint` de ponta a ponta; ESLint proíbe `parseFloat`/`Number`/`Math` nos módulos de saldo | `money.test.ts` |
| Fundos só vão para a carteira do próprio usuário | O endereço é consultado na Privy pelo servidor; o enviado pelo cliente é ignorado | `wallet.test.ts` |
| Ninguém registra o hash de outra pessoa | O hash só é aceito se o tx veio da carteira da conta para a tesouraria | `inbound.test.ts` |
| Transação presa não vira dinheiro duplicado | Estorno só depois que o nonce foi consumido por outro tx (cancelamento) | `stuck.test.ts` |
| Somas fecham | `npm run reconcile` | `reconcile.test.ts` |

## Perguntas do guia de estudo (as que se aplicam ao escopo)

**Quantas confirmações e por quê?** 2 blocos (~24 s) por padrão, configurável em `CONFIRMATIONS`. A finalização da Sepolia (`finalized`) leva ~13 min, o que não cabe numa demonstração. O risco de um número baixo é um reorg raso desfazer um tx já baixado ou creditado. Numa testnet sem valor, esse risco é aceito; em produção, o critério seria a finalização da rede.

**Como um depósito nunca é creditado duas vezes, mesmo com reinício?** O estado vive no banco, não na memória. O `tx_hash` é único, e o crédito é uma transição `PROCESSANDO → CONFIRMADA` feita uma vez só. A varredura pode reler os mesmos blocos quantas vezes for preciso (há teste para isso).

**E se o nó cair depois da assinatura e antes da confirmação?** O tx assinado (`raw_tx`) e o hash são gravados **antes** do broadcast, na mesma transação que reserva o saldo. Quando a rede volta, `advance()` retransmite. Se o tx sumir e o nonce for usado por outro, o saldo é estornado. Se ficar preso além da janela, é cancelado e depois estornado.

**Como a conciliação trata valores em trânsito?** Antes de calcular, a reconciliação fecha tudo o que já tem confirmações. O que resta minerado e ainda sem confirmações entra como "em trânsito" na fórmula (ver `ARCHITECTURE.md`). Uma diferença fora disso faz o script sair com código 1.

**Onde fica a chave privada e quem tem acesso?**
- **Tesouraria:** em `TREASURY_PRIVATE_KEY`, variável de ambiente do servidor. Nunca vai para o navegador (só variáveis `NEXT_PUBLIC_*` vão) e nunca é commitada (`.env*` está no `.gitignore`, menos o `.env.example`).
- **Carteira do usuário:** gerenciada pela Privy (carteira embutida, não custodial do lado da aplicação). A PoC nunca vê essa chave, e a exportação está fora do escopo.

Para provar isso a um auditor: o código não contém chaves, o histórico do git não tem `.env.local`, e a chave da tesouraria é usada só em `chain.ts`.

## O que esta PoC não faz (e um sistema real faria)

- **Custódia da tesouraria:** aqui é uma chave em variável de ambiente numa carteira hot única. Em produção: assinatura isolada (HSM, MPC ou multisig), separação hot/warm/cold e quórum para movimentar a cold.
- **Compliance:** sem KYC, KYT (screening de endereço), Travel Rule, limites, 2FA ou revisão manual (fora do escopo do TAP). As obrigações de prestadoras de serviços de ativos virtuais no Brasil devem ser verificadas na regulamentação vigente do Banco Central, citando a norma, sem supor valores.
- **Reorgs profundos:** com 2 confirmações, um reorg maior que isso não é tratado.
- **Disponibilidade:** sem fila nem worker. Uma transferência só avança quando alguém consulta o status ou a reconciliação roda.
- **Taxas:** a carteira demo precisa de Sepolia ETH para pagar a taxa do envio de volta (sem patrocínio de gas, conforme o TAP).

## Dependências

`npm audit` aponta alertas que foram avaliados e aceitos para esta PoC:

- **`zod` < 4.6.6 (alto):** cópias aninhadas no Reown/WalletConnect e no `@coinbase/cdp-sdk`, que vêm como dependências transitivas da Privy. O problema é esgotamento de memória ao validar coleções muito grandes. Essas bibliotecas atendem à conexão de carteiras externas, que não usamos (só login por e-mail e carteira embutida). Forçar o `zod` 4 nelas quebraria a API.
- **`esbuild` antigo (moderado), via `drizzle-kit`:** ferramenta só de desenvolvimento, para gerar migrações; não vai para o app.
- **`@solana/kit`** fixado em `overrides`: resolve um conflito entre dependências opcionais dos SDKs da Privy; a PoC não usa Solana.

## Reportar um problema

Abra uma issue no repositório. Lembre que o projeto não tem suporte nem manutenção depois do ciclo acadêmico.
