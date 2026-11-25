import type { Metadata, Viewport } from "next";
import { SiteFrame } from "@/components/SiteFrame";
import { config } from "@/lib/config";
import { buildCsp } from "@/lib/csp";
import { MAINNET_HORIZON } from "@/lib/mainnet";
import { siteMetadata } from "@/lib/metadata";
import "./globals.css";

export const metadata: Metadata = siteMetadata();

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
        <SiteFrame>{children}</SiteFrame>
      </body>
    </html>
  );
}
