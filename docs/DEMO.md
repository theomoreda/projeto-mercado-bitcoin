# Roteiro do Demo Day

Duração: ~5 minutos. Tudo em Sepolia, com a conta de demonstração.

## Preparação (antes do dia)

- [ ] `.env.local` completo (Privy, RPC, tesouraria, token, `DEMO_EMAILS`). Veja o README.
- [ ] Mock USDC implantado e `npm run seed` executado: a tesouraria tem o lastro.
- [ ] Tesouraria com Sepolia ETH (≥ 0,02).
- [ ] Ensaio completo uma vez: entrar, ativar a carteira e abastecê-la com ETH (`cast send … --value 0.005ether`).
- [ ] `npm run reconcile` sai com "Tudo confere."
- [ ] Acesso ao e-mail da conta demo no celular, para receber o código.

## No dia

```bash
docker compose up -d --wait db
npm run dev
npm run reconcile     # deve terminar com "Tudo confere."
```

Abra <http://localhost:3000> em janela anônima.

## Roteiro

| # | Ação | O que mostrar | Requisito |
|---|---|---|---|
| 1 | Digitar o e-mail → "Receber código" → digitar o código | Sem senha, sem seed phrase, sem extensão | RF-01, RNF-05 |
| 2 | Painel | "Conta MB · 1.000,00 USDC" | RF-03 |
| 3 | "Ativar minha carteira" | Um clique; o endereço aparece encurtado, com botão copiar | RF-02 |
| 4 | Digitar `0` e depois `5000` | Botão bloqueado, com "Informe um valor maior que zero." / "Saldo insuficiente para este valor." | RF-06 |
| 5 | Digitar `10,999` | O campo fica `10,99`, com "Use até duas casas decimais." (truncado, nunca arredondado) | Regra de valores |
| 6 | Conta MB → Minha carteira, `100` → "Transferir" | Conta MB cai na hora (reserva); "Processando…" → "Transferência concluída"; carteira mostra 100,00 | RF-04, RF-07 |
| 7 | "Ver comprovante" | Etherscan da Sepolia com o tx da tesouraria | RF-08 |
| 8 | "Detalhes técnicos" | Hash, rede, confirmações (escondidos por padrão: abstração) | — |
| 9 | Minha carteira → Conta MB, `40` → "Transferir" | Nenhum pop-up de assinatura; status até "concluída"; Conta MB 940,00 e carteira 60,00 | RF-05 |
| 10 | Terminal: `npm run reconcile` | Conta: custodial + carteira = 1.000,00; tesouraria confere; "Tudo confere." | RNF-04 |

## Perguntas prováveis

- **"E se a transferência falhar?"** O valor reservado volta para a Conta MB e a tela diz isso (RF-10). Isso é coberto por testes automatizados no Anvil (`outbound.test.ts`, `stuck.test.ts`), porque forçar uma falha na Sepolia ao vivo não é confiável.
- **"E se clicar duas vezes?"** Cada envio tem um `clientRequestId` único no banco: só uma transferência é criada.
- **"E se fechar a aba no meio da volta?"** A varredura de entradas credita o envio quando o painel for aberto de novo.
- **"Quem guarda as chaves?"** Veja `SECURITY.md`: a tesouraria fica no servidor, e a carteira do usuário fica com a Privy.

## Se algo der errado

| Sintoma | Causa provável | Ação |
|---|---|---|
| "Configuração pendente" | `NEXT_PUBLIC_PRIVY_APP_ID` vazio | Preencher `.env.local` e reiniciar `npm run dev` |
| "Este e-mail não faz parte da demonstração" | E-mail fora de `DEMO_EMAILS` | Ajustar `DEMO_EMAILS` e reiniciar |
| "Não foi possível concluir agora" na volta | Carteira sem Sepolia ETH | `cast send <carteira> --value 0.005ether …` |
| "Não foi possível concluir agora" na ida | Tesouraria sem ETH ou sem Mock USDC | Abastecer ETH e rodar `npm run seed` |
| "Processando…" por mais de 1 min | Sepolia lenta | Esperar; o status avança sozinho (após 10 min o tx é cancelado e estornado) |
| Saldo da volta não aparece | Tx ainda sem confirmações | Recarregar o painel (a varredura credita) |
