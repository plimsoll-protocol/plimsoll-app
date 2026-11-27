import { TESTNET, type NetworkConfig } from "@plimsoll/sdk";
import { Networks } from "@stellar/stellar-sdk";

/**
 * Runtime configuration, baked in at build time from NEXT_PUBLIC_* variables.
 * Every value defaults to the v0.1 testnet deployment, so a plain `npm run
 * dev` works with no .env file.
 */
export interface AppConfig {
  network: NetworkConfig;
  networkName: string;
  /** Plimsoll indexer base URL. Empty means read everything from the chain. */
  indexerUrl: string;
  /** SAC addresses shown when reading straight from the chain. */
  chainAssets: string[];
  /** Stellar Expert base for the active network, or NEXT_PUBLIC_EXPLORER_URL when set. */
  explorerUrl: string;
  basePath: string;
}

const STELLAR_EXPERT = "https://stellar.expert/explorer";

/**
 * The Stellar Expert base URL for a network, picked by passphrase so a mainnet
 * build links to mainnet without a separate setting. Null for a network
 * Stellar Expert does not index (a local standalone network).
 */
export function stellarExpertUrl(networkPassphrase: string): string | null {
  switch (networkPassphrase) {
    case Networks.PUBLIC:
      return `${STELLAR_EXPERT}/public`;
    case Networks.TESTNET:
      return `${STELLAR_EXPERT}/testnet`;
    case Networks.FUTURENET:
      return `${STELLAR_EXPERT}/futurenet`;
    default:
      return null;
  }
}

/** `rel` for links that open in a new tab: no window.opener, no referrer. */
export const EXTERNAL_REL = "noopener noreferrer";

const env = (v: string | undefined, fallback: string) => (v && v.trim() ? v.trim() : fallback);

const networkPassphrase = env(
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE,
  TESTNET.networkPassphrase,
);

export const config: AppConfig = {
  network: {
    rpcUrl: env(process.env.NEXT_PUBLIC_STELLAR_RPC_URL, TESTNET.rpcUrl),
    horizonUrl: env(process.env.NEXT_PUBLIC_HORIZON_URL, TESTNET.horizonUrl ?? ""),
    networkPassphrase,
    coverageLedgerId: env(process.env.NEXT_PUBLIC_COVERAGE_LEDGER_ID, TESTNET.coverageLedgerId),
    reporterRegistryId: env(
      process.env.NEXT_PUBLIC_REPORTER_REGISTRY_ID,
      TESTNET.reporterRegistryId,
    ),
  },
  networkName: env(process.env.NEXT_PUBLIC_NETWORK_NAME, "testnet"),
  indexerUrl: ((url) => (url === "none" ? "" : url))(
    env(process.env.NEXT_PUBLIC_INDEXER_URL, "https://plimsoll-indexer.onrender.com"),
  ),
  chainAssets: env(
    process.env.NEXT_PUBLIC_CHAIN_ASSETS,
    Object.values(TESTNET.assets)
      .map((a) => a.sac)
      .join(","),
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  explorerUrl: env(
    process.env.NEXT_PUBLIC_EXPLORER_URL,
    stellarExpertUrl(networkPassphrase) ?? `${STELLAR_EXPERT}/testnet`,
  ).replace(/\/+$/, ""),
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
};

export const explorer = {
  tx: (hash: string) => `${config.explorerUrl}/tx/${hash}`,
  contract: (id: string) => `${config.explorerUrl}/contract/${id}`,
  account: (id: string) => `${config.explorerUrl}/account/${id}`,
};
