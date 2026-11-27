"use client";

import { useAuth } from "@/components/auth/AuthContext";
import { Dashboard } from "@/components/Dashboard";
import { LoginForm } from "@/components/LoginForm";

export default function Home() {
  const { ready, authenticated } = useAuth();
  if (!ready)
    return (
      <main className="page muted" role="status">
        Carregando…
      </main>
    );
  if (!authenticated) return <LoginForm />;
  return <Dashboard />;
}
