import { expect, test } from "@playwright/test";
import {
  alerts,
  expectAccessible,
  json,
  me,
  scenario,
  shot,
  transfer,
  TX_IN,
  TX_OUT,
} from "./fixtures";

test.describe("Login (telas 01–03)", () => {
  test("e-mail, código inválido, reenviar e entrar", async ({ page }) => {
    await scenario(page, { authenticated: false });
    await page.route("**/api/me", (r) => json(r, me()));
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Entrar na conta de demonstração" }),
    ).toBeVisible();
    await expect(page.getByText("Rede de teste · Sepolia")).toBeVisible();
    await page.getByLabel("E-mail").fill("demo@mbbridge.dev");
    await shot(page, "01-login-email");
    await expectAccessible(page);

    await page.getByRole("button", { name: "Receber código" }).click();
    await expect(page.getByRole("heading", { name: "Confira seu e-mail" })).toBeVisible();
    await expect(page.getByText(/Reenviar código em 0:4\d/)).toBeVisible();
    await page.getByLabel("Código").fill("482190");
    await shot(page, "02-login-codigo");

    await page.getByRole("button", { name: "Entrar" }).click();
    const alert = alerts(page);
    await expect(alert).toHaveText(
      "Código inválido ou expirado. Confira o e-mail ou peça um novo código.",
    );
    await expect(page.getByLabel("Código")).toHaveAttribute("aria-invalid", "true");
    await shot(page, "03-erro-codigo-invalido");
    await expectAccessible(page);

    // Trocar e-mail volta ao primeiro passo sem perder o que foi digitado.
    await page.getByRole("button", { name: "← Trocar e-mail" }).click();
    await expect(page.getByLabel("E-mail")).toHaveValue("demo@mbbridge.dev");
    await page.getByRole("button", { name: "Receber código" }).click();

    await page.getByLabel("Código").fill("123456");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("heading", { name: "Olá, Demo" })).toBeVisible();
  });
});

test.describe("Início e wallet (telas 04–06)", () => {
  test("ativa a wallet e mostra o saldo", async ({ page }) => {
    let activated = false;
    await scenario(page, { authenticated: true, walletAddress: null });
    await page.route("**/api/me", (r) => json(r, me({ wallet: activated })));
    await page.route("**/api/wallet", async (r) => {
      await new Promise((res) => setTimeout(res, 800));
      activated = true;
      await json(r, { ok: true });
    });
    await page.goto("/");

    await expect(page.getByText("Não ativada")).toBeVisible();
    await expect(page.getByRole("button", { name: "Transferir" })).toBeDisabled();
    await shot(page, "04-inicio-sem-wallet");
    await expectAccessible(page);

    await page.getByRole("button", { name: "Ativar minha wallet" }).click();
    await expect(page.getByText("Criando sua wallet…")).toBeVisible();
    await shot(page, "05-ativando-wallet");

    await expect(page.getByText("Ativa", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Copiar endereço/ })).toContainText(
      "0x7a3F…9c2B",
    );
    await shot(page, "06-inicio-wallet-ativa");
    await expectAccessible(page);
  });

  test("erro ao carregar some quando a nova tentativa dá certo", async ({ page }) => {
    let fail = true;
    await scenario(page, { authenticated: true });
    await page.route("**/api/me", (r) =>
      fail ? json(r, { error: "servico_indisponivel" }, 503) : json(r, me()),
    );
    await page.goto("/");
    await expect(alerts(page)).toContainText("Não foi possível carregar seus dados.");
    fail = false;
    await page.getByRole("button", { name: "Tentar de novo" }).click();
    await expect(alerts(page)).toHaveCount(0);
    await expect(page.getByText("1.000,00")).toBeVisible();
  });
});

test.describe("Conta MB → wallet (telas 07–09, 11–14)", () => {
  test("erros de valor, revisão, processando e confirmada", async ({ page }) => {
    let status: "PROCESSANDO" | "CONFIRMADA" = "PROCESSANDO";
    let posted: unknown = null;
    await scenario(page, { authenticated: true, walletAddress: `0x7a3F${"0".repeat(32)}9c2B` });
    await page.route("**/api/me", (r) =>
      json(
        r,
        status === "CONFIRMADA"
          ? me({ cents: 75_000, wallet: true, walletCents: 25_000 })
          : me({ wallet: true }),
      ),
    );
    await page.route("**/api/transfers", async (r) => {
      posted = r.request().postDataJSON();
      await json(r, transfer());
    });
    await page.route("**/api/transfers/*", (r) =>
      json(r, transfer({ status, confirmations: "2" })),
    );
    await page.goto("/");

    await page.getByRole("button", { name: "Transferir" }).first().click();
    await expect(page.getByRole("heading", { name: "Transferir Mock USDC" })).toBeVisible();
    const amount = page.getByLabel("Valor");
    const cont = page.getByRole("button", { name: "Continuar" });
    await expect(cont).toBeDisabled();
    await shot(page, "07-transferir-conta-para-wallet");
    await expectAccessible(page);

    await amount.fill("1500,00");
    await expect(alerts(page)).toHaveText(
      "Saldo insuficiente. Você tem 1.000,00 Mock USDC na conta MB.",
    );
    await expect(amount).toHaveAttribute("aria-invalid", "true");
    await expect(cont).toBeDisabled();
    await shot(page, "08-erro-saldo-insuficiente");

    await amount.fill("10,555");
    await expect(alerts(page)).toHaveText("Use no máximo 2 casas decimais. Exemplo: 10,55");
    await expect(cont).toBeDisabled();
    await shot(page, "09-erro-casas-decimais");
    await expectAccessible(page);

    await amount.fill("250,00");
    await cont.click();
    await expect(page.getByRole("heading", { name: "Revise a transferência" })).toBeVisible();
    await expect(page.getByText("Conta 750,00 · Wallet 250,00")).toBeVisible();
    await shot(page, "11-revisar-conta-para-wallet");
    await expectAccessible(page);

    // Voltar mantém o valor; confirmar de novo reusa o mesmo pedido.
    await page.getByRole("button", { name: "Voltar" }).click();
    await expect(amount).toHaveValue("250,00");
    await cont.click();
    await page.getByRole("button", { name: "Confirmar transferência" }).click();

    await expect(
      page.getByRole("heading", { name: "Sua transferência está a caminho" }),
    ).toBeVisible();
    expect(posted).toMatchObject({ direction: "MB_TO_WALLET", amount: "250,00" });
    await expect(page.getByRole("link", { name: /Acompanhar no explorador/ })).toHaveAttribute(
      "href",
      `https://sepolia.etherscan.io/tx/${TX_OUT}`,
    );
    await shot(page, "12-processando");
    await expectAccessible(page);

    status = "CONFIRMADA";
    await expect(page.getByRole("heading", { name: "Transferência confirmada!" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("250,00 Mock USDC chegaram na sua wallet.")).toBeVisible();
    await expect(page.getByText("750,00 Mock USDC")).toBeVisible();
    await shot(page, "13-confirmada");
    await expectAccessible(page);
  });

  test("falha on-chain avisa que o valor voltou (tela 14)", async ({ page }) => {
    await scenario(page, { authenticated: true, walletAddress: `0x7a3F${"0".repeat(32)}9c2B` });
    await page.route("**/api/me", (r) => json(r, me({ wallet: true })));
    await page.route("**/api/transfers", (r) => json(r, transfer()));
    await page.route("**/api/transfers/*", (r) =>
      json(r, transfer({ status: "FALHOU", failureReason: "transacao_expirada" })),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Transferir" }).first().click();
    await page.getByLabel("Valor").fill("250");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Confirmar transferência" }).click();

    await expect(
      page.getByRole("heading", { name: "A transferência não foi concluída" }),
    ).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("O valor voltou para sua Conta MB.")).toBeVisible();
    await expect(page.getByText("Tempo de confirmação esgotado")).toBeVisible();
    await shot(page, "14-falhou");
    await expectAccessible(page);
  });
});

test.describe("Wallet → conta MB (telas 10, 11b, 12c, 13b)", () => {
  test("assina uma vez, processa e confirma", async ({ page }) => {
    let status: "PROCESSANDO" | "CONFIRMADA" = "PROCESSANDO";
    let posted: Record<string, unknown> | null = null;
    await scenario(page, {
      authenticated: true,
      walletAddress: `0x7a3F${"0".repeat(32)}9c2B`,
      txHash: TX_IN,
    });
    await page.route("**/api/me", (r) =>
      json(
        r,
        status === "CONFIRMADA"
          ? me({ cents: 85_000, wallet: true, walletCents: 15_000 })
          : me({ cents: 75_000, wallet: true, walletCents: 25_000 }),
      ),
    );
    await page.route("**/api/transfers", async (r) => {
      posted = r.request().postDataJSON();
      await json(
        r,
        transfer({ direction: "WALLET_TO_MB", amountMicro: "100000000", txHash: TX_IN }),
      );
    });
    await page.route("**/api/transfers/*", (r) =>
      json(
        r,
        transfer({ direction: "WALLET_TO_MB", amountMicro: "100000000", txHash: TX_IN, status }),
      ),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Transferir" }).first().click();

    // Seletor de direção: setas do teclado trocam a opção.
    await page.getByRole("radio", { name: "Conta MB → Minha carteira" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { name: "Minha carteira → Conta MB" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.getByLabel("Valor").fill("100,00");
    await expect(page.getByText("Paga em Sepolia ETH pela sua wallet")).toBeVisible();
    await shot(page, "10-transferir-wallet-para-conta");
    await expectAccessible(page);

    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText("Conta 850,00 · Wallet 150,00")).toBeVisible();
    await shot(page, "11b-revisar-wallet-para-conta");

    await page.getByRole("button", { name: "Confirmar transferência" }).click();
    await expect(page.getByText("Enviado pela sua wallet")).toBeVisible();
    expect(posted).toMatchObject({ direction: "WALLET_TO_MB", txHash: TX_IN });
    await shot(page, "12c-processando-wallet-para-conta");

    status = "CONFIRMADA";
    await expect(page.getByText("100,00 Mock USDC voltaram para a sua conta MB.")).toBeVisible({
      timeout: 15_000,
    });
    await shot(page, "13b-confirmada-wallet-para-conta");
    expect(await page.evaluate(() => window.__MB_E2E_SIGNED__)).toBe(1);
  });

  test("bug 5: API falha depois da assinatura e a wallet não assina de novo", async ({ page }) => {
    let posts = 0;
    const hashes = new Set<string>();
    await scenario(page, {
      authenticated: true,
      walletAddress: `0x7a3F${"0".repeat(32)}9c2B`,
      txHash: TX_IN,
    });
    await page.route("**/api/me", (r) => json(r, me({ wallet: true, walletCents: 25_000 })));
    await page.route("**/api/transfers", async (r) => {
      posts += 1;
      hashes.add((r.request().postDataJSON() as { txHash: string }).txHash);
      if (posts <= 2) return json(r, { error: "erro_interno" }, 500);
      await json(
        r,
        transfer({ direction: "WALLET_TO_MB", amountMicro: "100000000", txHash: TX_IN }),
      );
    });
    await page.route("**/api/transfers/*", (r) =>
      json(r, transfer({ direction: "WALLET_TO_MB", amountMicro: "100000000", txHash: TX_IN })),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Transferir" }).first().click();
    await page.getByRole("radio", { name: "Minha carteira → Conta MB" }).click();
    await page.getByLabel("Valor").fill("100");
    await page.getByRole("button", { name: "Continuar" }).click();
    // Duplo clique no confirmar.
    await page.getByRole("button", { name: "Confirmar transferência" }).dblclick();

    // A tela de status abre pelo hash, mesmo com a API fora.
    await expect(
      page.getByRole("heading", { name: "Sua transferência está a caminho" }),
    ).toBeVisible();
    await expect(alerts(page)).toContainText("você não precisa assinar outra vez");
    await shot(page, "12d-registrando-apos-falha-da-api");

    // Depois das novas tentativas só do registro, a transferência aparece registrada.
    await expect(alerts(page)).toHaveCount(0, { timeout: 20_000 });
    await expect(
      page.locator(".timeline li.done", { hasText: "Pedido registrado no MB" }),
    ).toBeVisible();
    expect(posts).toBe(3);
    expect([...hashes]).toEqual([TX_IN]);
    expect(await page.evaluate(() => window.__MB_E2E_SIGNED__)).toBe(1);
  });

  test("sem Sepolia ETH a mensagem é legível", async ({ page }) => {
    await scenario(page, {
      authenticated: true,
      walletAddress: `0x7a3F${"0".repeat(32)}9c2B`,
      sendTx: "insufficient_funds",
    });
    await page.route("**/api/me", (r) => json(r, me({ wallet: true, walletCents: 25_000 })));
    let posted = false;
    await page.route("**/api/transfers", (r) => {
      posted = true;
      return json(r, transfer());
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Transferir" }).first().click();
    await page.getByRole("radio", { name: "Minha carteira → Conta MB" }).click();
    await page.getByLabel("Valor").fill("100");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Confirmar transferência" }).click();
    await expect(alerts(page)).toContainText("sem Sepolia ETH para pagar a taxa de rede");
    await expect(alerts(page)).not.toContainText("Algo deu errado");
    expect(posted).toBe(false);
    await shot(page, "15-erro-sem-eth");
  });

  test("rede errada bloqueia o envio da wallet", async ({ page }) => {
    await scenario(page, {
      authenticated: true,
      walletAddress: `0x7a3F${"0".repeat(32)}9c2B`,
      chainId: "eip155:1",
    });
    await page.route("**/api/me", (r) => json(r, me({ wallet: true, walletCents: 25_000 })));
    await page.goto("/");
    await page.getByRole("button", { name: "Transferir" }).first().click();
    await page.getByRole("radio", { name: "Minha carteira → Conta MB" }).click();
    await page.getByLabel("Valor").fill("100");
    await expect(page.getByText(/rede diferente da Sepolia/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Continuar" })).toBeDisabled();
    await shot(page, "16-rede-errada");
  });
});
