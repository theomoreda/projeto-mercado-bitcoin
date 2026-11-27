"use client";

import { useEffect, useId, useState } from "react";
import { useAuth } from "./auth/AuthContext";
import { Logo, NetworkBadge } from "./Logo";

const RESEND_SECONDS = 45;

/** Telas 01–03 do wireframe: e-mail, código e código inválido (com reenviar e trocar e-mail). */
export function LoginForm() {
  const { sendCode, loginWithCode } = useAuth();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const errorId = useId();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function requestCode() {
    setBusy(true);
    setError(null);
    try {
      await sendCode(email.trim().toLowerCase());
      setStep("code");
      setCode("");
      setCooldown(RESEND_SECONDS);
      return true;
    } catch {
      setError("Não conseguimos enviar o código. Confira o e-mail e tente de novo.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    if (step === "email") {
      await requestCode();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await loginWithCode(code.trim());
    } catch {
      setError("Código inválido ou expirado. Confira o e-mail ou peça um novo código.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (await requestCode()) setNotice("Enviamos um novo código.");
  }

  function changeEmail() {
    setStep("email");
    setCode("");
    setError(null);
    setNotice(null);
  }

  return (
    <div className="login-layout">
      <section className="login-hero">
        <Logo onBrand />
        <div className="hexagon" style={{ width: 160, height: 180, top: 40, right: 0 }} />
        <div className="hexagon" style={{ width: 300, height: 340, bottom: -40, right: -60 }} />
        <div className="hero-copy">
          <h1>Sua conta MB e sua wallet, conectadas.</h1>
          <p>Movimente Mock USDC entre a custódia do MB e uma wallet só sua, em poucos cliques.</p>
        </div>
        <p className="slogan">Quem chega antes, vence.</p>
      </section>

      <main className="login-main">
        <NetworkBadge />
        <form className="card login-card" onSubmit={submit} noValidate>
          {step === "email" ? (
            <>
              <h2>Entrar na conta de demonstração</h2>
              <p className="muted">Use seu e-mail. Enviamos um código de acesso, sem senha.</p>
              <div className="field">
                <label htmlFor="email">E-mail</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  autoFocus
                  value={email}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </>
          ) : (
            <>
              <button type="button" className="back" onClick={changeEmail}>
                ← Trocar e-mail
              </button>
              <h2>Confira seu e-mail</h2>
              <p className="muted">
                Digite o código de 6 dígitos que enviamos para <strong>{email}</strong>.
              </p>
              <div className="field">
                <label htmlFor="code">Código</label>
                <input
                  id="code"
                  className="otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  autoFocus
                  value={code}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
              </div>
            </>
          )}

          {error && (
            <p id={errorId} className="field-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="muted" role="status">
              {notice}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-block"
            disabled={busy || (step === "email" ? !email.includes("@") : code.length !== 6)}
          >
            {busy ? "Aguarde…" : step === "email" ? "Receber código" : "Entrar"}
          </button>

          {step === "code" && (
            <p className="muted">
              {cooldown > 0 ? (
                `Reenviar código em 0:${String(cooldown).padStart(2, "0")}`
              ) : (
                <button type="button" className="btn-link" onClick={resend} disabled={busy}>
                  Reenviar código
                </button>
              )}
            </p>
          )}

          <p className="login-foot">
            Conta de demonstração com saldo fictício. Nenhum dinheiro real é movimentado.
          </p>
        </form>
      </main>
    </div>
  );
}
