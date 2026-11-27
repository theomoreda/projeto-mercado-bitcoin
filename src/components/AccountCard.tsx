import { formatCents } from "@/lib/money";

export function AccountCard({
  availableCents,
  reservedCents,
}: {
  availableCents: bigint;
  reservedCents: bigint;
}) {
  return (
    <section className="card" aria-labelledby="conta-mb">
      <div className="card-head">
        <h2 id="conta-mb" className="card-label">
          Saldo na conta MB
        </h2>
        <span className="tag">Custodial</span>
      </div>
      <p className="balance">
        {formatCents(availableCents)}
        <span>Mock USDC</span>
      </p>
      <p className="muted">Saldo fictício, guardado pelo MB.</p>
      {reservedCents > 0n && (
        <p className="muted">{formatCents(reservedCents)} Mock USDC em transferência.</p>
      )}
    </section>
  );
}
