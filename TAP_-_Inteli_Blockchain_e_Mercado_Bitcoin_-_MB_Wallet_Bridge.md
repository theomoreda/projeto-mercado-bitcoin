*Inteli Blockchain – Diretoria de Projetos*

# 1. Identificação do Projeto

Projeto: MB Wallet Bridge — Piloto de Wallet Híbrida

Empresa: Mercado Bitcoin

## Breve Descrição/Mini Bio da Empresa

O Mercado Bitcoin é uma plataforma brasileira de ativos digitais que oferece negociação, custódia e serviços relacionados a criptoativos e tokens. Sua atuação conecta a experiência financeira tradicional à infraestrutura blockchain.

# 2. Definição do Desafio

## Esboço do Projeto

Desenvolver uma prova de conceito acadêmica que conecte uma conta custodial simulada do MB a uma embedded wallet controlada pelo usuário. A experiência permitirá ativar uma wallet em Sepolia, visualizar os dois saldos separadamente e movimentar Mock USDC entre os ambientes.

## Problema

A proposta explora a hipótese de que a passagem de uma conta custodial para o ambiente on-chain ainda exige que o cliente utilize ferramentas externas e compreenda conceitos técnicos. O desafio é demonstrar uma jornada integrada, simples e transparente, sem alterar a custódia atual do MB nem movimentar ativos reais.

## Objetivo

Construir e validar, em quatro semanas de desenvolvimento, uma jornada híbrida na qual uma conta de demonstração mantém seu saldo custodial e ativa uma wallet pessoal. A PoC deverá demonstrar transferências bidirecionais em Sepolia, com valores maiores que zero, limitados ao saldo disponível e com até duas casas decimais, além da reconciliação dos dois saldos.

## Benefícios Esperados para o Parceiro

Espera-se ao fim do projeto que seja possível:

- Uma PoC funcional da experiência entre conta custodial e embedded wallet, executada exclusivamente em testnet.
- Avaliação de uma jornada opcional de acesso on-chain, com código aberto e documentação técnica para continuidade.
- Aproximação com os membros do Inteli Blockchain e formação prática em wallets, reconciliação, segurança e integração Web2/Web3.

# 3. Escopo e Entregas

## Descrição Curta do Projeto

Aplicação web em que uma conta de demonstração entra por e-mail, visualiza um saldo custodial fictício, ativa uma embedded wallet e transfere Mock USDC entre a conta simulada e a wallet. A operação atual exibirá os estados processando, confirmada ou falhou e um link para o explorador. A wallet do Demo Day será abastecida previamente com Sepolia ETH obtido em faucet. A entrega inclui contrato do token de teste, ledger idempotente, documentação concisa de arquitetura e segurança e roteiro de demonstração. A consulta à API pública do MB, a publicação online, o histórico completo e o suporte integral a outros usuários serão metas complementares, iniciadas somente após o aceite do fluxo principal.

**Stack Tecnológica:** Next.js, React, TypeScript, Privy, viem, PostgreSQL, Solidity, OpenZeppelin, Foundry, Sepolia e RPC gerenciado.

## Regra de valores e conversão

O ledger off-chain opera em duas casas decimais e o token de teste em seis. A conversão entre os dois é fixada assim:

- A entrada do usuário é truncada — nunca arredondada — em duas casas decimais antes de qualquer validação.
- O valor truncado é convertido para a unidade inteira do token multiplicando por 10⁶; o ledger registra o mesmo valor em centavos, como inteiro.
- Valores recebidos on-chain com mais de duas casas decimais são creditados integralmente no ledger, que passa a registrar a parte fracionária excedente em campo separado, de modo que a reconciliação feche sem resíduo.
- Nenhuma operação do fluxo principal usa ponto flutuante.

## Invariantes do ledger

O saldo custodial é reservado e liberado segundo as regras abaixo, de forma que a soma dos dois saldos permaneça constante ao longo de toda a jornada:

- **Reserva:** no envio MB → wallet, o valor sai do saldo disponível e entra em reserva antes do envio da transação; o saldo disponível reflete a reserva imediatamente.
- **Confirmação:** a reserva é baixada definitivamente apenas quando a transação é confirmada on-chain.
- **Estorno:** em caso de falha, reversão ou expiração da janela de observação, a reserva retorna ao saldo disponível e a operação é marcada como falhou.
- **Crédito:** no sentido wallet → MB, o crédito no ledger ocorre apenas após a confirmação on-chain; não há crédito otimista.
- **Idempotência:** cada hash confirmado afeta o ledger no máximo uma vez, garantida por restrição de unicidade no banco sobre o hash da transação.

## Cronograma de Ciclo 4 Semanas:

- **Semana 1:** 03/11 a 09/11 — arquitetura mínima, UX, Privy, ledger, implantação do Mock USDC, tesouraria e preparação da conta de demonstração.
- **Semana 2:** 10/11 a 16/11 — login, ativação da wallet, saldos, transferência MB → wallet e início do fluxo de retorno.
- **Semana 3:** 17/11 a 23/11 — transferência wallet → MB, confirmação on-chain, idempotência, reconciliação e integração.
- **Semana 4:** 24/11 a 27/11 — testes do fluxo principal, documentação, ajustes finais e preparação da entrega.
- **Entrega e estabilização:** congelamento funcional em 27/11, às 23h59. Após essa data, somente correções bloqueadoras, documentação e preparação do Demo Day. O relatório será enviado ao MB antes do encerramento em 02/12.

## Critério de Aceite

O projeto será aceito quando a conta de demonstração conseguir entrar por e-mail, ativar sua wallet, visualizar os dois saldos, informar um valor maior que zero, limitado ao saldo e com até duas casas decimais, transferir Mock USDC nos dois sentidos e terminar com os saldos reconciliados. A operação atual deverá apresentar seu estado e link para o explorador, e cada hash confirmado poderá afetar o ledger no máximo uma vez. A API pública do MB não fará parte do critério de aceite.

## Restrições / O Projeto NÃO contempla:

- Mainnet, dinheiro ou ativos reais; APIs privadas e sistemas internos do MB; compra, venda, staking ou produtos de investimento.
- Múltiplas blockchains; envio para endereços externos; patrocínio de gas; exportação de chave privada; recuperação de wallet; aplicativo mobile.
- KYC, AML, implementação da Travel Rule, auditoria formal, testes de estresse, garantia de segurança para produção, integração com sistemas legados ou suporte após o ciclo.

# 4. Requisitos

## Requisitos Funcionais

| ID | Requisito |
| --- | --- |
| RF-01 | O usuário entra na aplicação informando e-mail e código, sem senha e sem seed phrase. |
| RF-02 | Após o login, o usuário ativa uma embedded wallet na Sepolia e visualiza o endereço na tela. |
| RF-03 | A tela exibe, separadamente e rotulados, o saldo custodial simulado e o saldo de Mock USDC on-chain. |
| RF-04 | O usuário transfere um valor do saldo custodial para a wallet. |
| RF-05 | O usuário transfere Mock USDC da wallet de volta para o saldo custodial. |
| RF-06 | O envio é bloqueado, com mensagem explicando o motivo, quando o valor é zero, negativo, maior que o saldo ou tem mais de duas casas decimais. |
| RF-07 | A operação em andamento exibe seu estado: processando, confirmada ou falhou. |
| RF-08 | Toda transação enviada exibe link para o explorador da Sepolia. |
| | |
| RF-10 | Quando a transferência falha, o valor reservado volta ao saldo disponível e a tela indica isso. |

## Requisitos Não Funcionais

| ID | Requisito |
| --- | --- |
| RNF-01 | A aplicação opera apenas na Sepolia e avisa caso a wallet esteja conectada a outra rede. |
| RNF-02 | Cada hash confirmado altera o ledger no máximo uma vez, garantido por restrição de unicidade no banco. |
| RNF-03 | Todos os valores são tratados como inteiros; nenhum ponto flutuante no caminho do saldo. |
| RNF-04 | A soma dos dois saldos permanece constante do início ao fim da jornada, verificável por consulta de reconciliação. |
| RNF-05 | Uma pessoa sem experiência prévia com wallets completa o fluxo sem instalar extensão nem consultar documentação. |
| RNF-06 | Cada transferência fica registrada com hash, valor, sentido e estado, consultável para depuração. |
| RNF-07 | O projeto sobe em outra máquina a partir do README, com arquivo de exemplo de variáveis e script de implantação do contrato. |
| RNF-08 | Repositório público sob licença MIT, com documentação de arquitetura e segurança. |

# 5. Responsabilidades do Parceiro

- **Disponibilidade Síncrona (Reuniões):** O parceiro participará de dois encontros presenciais obrigatórios e será convidado para três acompanhamentos remotos semanais, cuja ausência não bloqueará a execução:
- **Abertura:** 28/10, das 18h às 20h, presencialmente no Auditório do Inteli ou no escritório do Mercado Bitcoin, com local a confirmar.
- **Encerramento — Demo Day:** 02/12, das 18h30 às 20h, presencialmente no escritório do Mercado Bitcoin.
- **Acompanhamentos semanais:** reuniões remotas de até 60 minutos, somente com os trios. As janelas serão 09/11 ou 10/11, 16/11 ou 17/11 e 23/11 ou 24/11, sempre a partir das 13h.
- **Entrega do projeto:** congelamento funcional em 27/11, às 23h59. O relatório de entrega será enviado ao MB após o congelamento e antes do início do encerramento. No período intermediário serão permitidas somente correções bloqueadoras, documentação e preparação da apresentação.
- **Comunicação Assíncrona:** A execução não dependerá de respostas intermediárias do parceiro. Dúvidas serão registradas como premissas; eventuais interações assíncronas serão bem-vindas, mas opcionais.

# 6. Propriedade Intelectual e Divulgação

- **Código:** O projeto será desenvolvido em repositório público sob licença **Open Source (MIT)**, permitindo que os alunos usem como portfólio e a empresa utilize o código livremente.
- **Uso de Marca:** O nome, logotipo e a identidade visual do MB somente serão utilizados publicamente mediante autorização do parceiro para registro e divulgação da parceria nos canais oficiais do clube.
- **Observação:** O projeto possui caráter acadêmico e experimental. O Inteli Blockchain não oferece manutenção, suporte, correções de bugs ou garantia de segurança para produção após o encerramento do projeto.

---

<!-- Rodapé presente como imagem em todas as páginas do PDF original (ícones: Instagram, LinkedIn, X) -->

**inteli BLOCKCHAIN** — Promovendo o ensino de tecnologias descentralizadas.

@Inteli_blockchain · Inteli Blockchain · @intelichain
