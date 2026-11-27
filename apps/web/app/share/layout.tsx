import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Coverage snapshot · Plimsoll",
  description:
    "Live reserve-coverage snapshot for a Stellar-issued asset, powered by the Plimsoll coverage ledger.",
  openGraph: {
    type: "website",
    siteName: "Plimsoll",
    title: "Coverage snapshot · Plimsoll",
    description:
      "See this asset’s reserve-coverage ratio, tier and report age — all from the Plimsoll on-chain coverage ledger.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Plimsoll – on-chain reserve coverage for Stellar assets",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Coverage snapshot · Plimsoll",
    description:
      "See this asset’s reserve-coverage ratio, tier and report age — all from the Plimsoll on-chain coverage ledger.",
    images: ["/og.png"],
  },
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
