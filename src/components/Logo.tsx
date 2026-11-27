/** Logo MB (hexágono, a forma base da marca) + nome do produto. */
export function Logo({ onBrand = false }: { onBrand?: boolean }) {
  const fill = onBrand ? "#fff" : "var(--logo)";
  const text = onBrand ? "var(--logo)" : "#fff";
  return (
    <span className="brand">
      <svg width="28" height="32" viewBox="0 0 32 36" aria-hidden="true" focusable="false">
        <path d="M16 0 31.6 9v18L16 36 .4 27V9z" fill={fill} />
        <text
          x="16"
          y="22.5"
          textAnchor="middle"
          fontSize="13"
          fontWeight="700"
          fill={text}
          fontFamily="inherit"
        >
          mb
        </text>
      </svg>
      <span>
        <span className="sr-only">MB </span>Wallet Bridge
      </span>
    </span>
  );
}

/** Selo de rede, sempre visível (RNF-01): deixa claro que nada aqui é dinheiro real. */
export function NetworkBadge() {
  return <span className="network-badge">Rede de teste · Sepolia</span>;
}
