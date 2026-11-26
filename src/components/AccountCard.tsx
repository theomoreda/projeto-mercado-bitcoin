import { formatCents } from "@/lib/money";

export function AccountCard({
  availableCents,
  reservedCents,
}: {
  availableCents: bigint;
  reservedCents: bigint;
}) {
  return (
    <section className="card">
      <h2>Conta MB</h2>
      <p className="balance">
        {formatCents(availableCents)} <span>USDC</span>
      </p>
      <p className="muted">Disponível</p>
      {reservedCents > 0n && (
        <p className="muted">{formatCents(reservedCents)} USDC em transferência</p>
      )}
    </section>
  );
}
