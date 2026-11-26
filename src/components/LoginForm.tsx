"use client";

import { useLoginWithEmail } from "@privy-io/react-auth";
import { useState } from "react";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { sendCode, loginWithCode, state } = useLoginWithEmail({
    onError: () => setError("Não deu certo. Confira os dados e tente de novo."),
  });
  const codeSent = state.status === "awaiting-code-input" || state.status === "submitting-code";
  const busy = state.status === "sending-code" || state.status === "submitting-code";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (codeSent) await loginWithCode({ code: code.trim() });
    else await sendCode({ email: email.trim() });
  }

  return (
    <form className="card login" onSubmit={submit}>
      <h1>Entrar</h1>
      <p className="muted">Sem senha: enviamos um código para o seu e-mail.</p>
      {!codeSent ? (
        <label>
          E-mail
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
      ) : (
        <label>
          Código enviado para {email}
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? "Aguarde…" : codeSent ? "Entrar" : "Receber código"}
      </button>
    </form>
  );
}
