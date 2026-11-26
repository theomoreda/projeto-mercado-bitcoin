import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MB Wallet Bridge",
  description: "Sua Conta MB e sua carteira pessoal, lado a lado.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
