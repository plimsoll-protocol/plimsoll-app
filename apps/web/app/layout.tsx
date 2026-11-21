import type { Metadata, Viewport } from "next";
import { Footer, Header } from "@/components/SiteChrome";
import { config } from "@/lib/config";
import { buildCsp } from "@/lib/csp";
import { MAINNET_HORIZON } from "@/lib/mainnet";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Plimsoll — is it backed?", template: "%s · Plimsoll" },
  description:
    "Reserve coverage for Stellar-issued assets: circulating supply from the ledger, signed reserve reports on-chain, and an is_covered() check any contract can call.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f3ee" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1620" },
  ],
};

// Production only: next dev needs inline and eval scripts for hot reload.
const csp =
  process.env.NODE_ENV === "production"
    ? buildCsp({
        endpoints: [
          config.network.rpcUrl,
          config.network.horizonUrl ?? "",
          config.indexerUrl,
          MAINNET_HORIZON,
        ],
      })
    : null;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>{csp ? <meta httpEquiv="Content-Security-Policy" content={csp} /> : null}</head>
      <body>
        <Header />
        <main>
          <div className="wrap">{children}</div>
        </main>
        <Footer />
      </body>
    </html>
  );
}
