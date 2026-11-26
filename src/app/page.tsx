"use client";

import { usePrivy } from "@privy-io/react-auth";
import { Dashboard } from "@/components/Dashboard";
import { LoginForm } from "@/components/LoginForm";

export default function Home() {
  const { ready, authenticated } = usePrivy();
  if (!ready) return <main className="shell muted">Carregando…</main>;
  if (!authenticated)
    return (
      <main className="shell">
        <LoginForm />
      </main>
    );
  return <Dashboard />;
}
