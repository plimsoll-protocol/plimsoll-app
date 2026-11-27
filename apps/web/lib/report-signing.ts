"use client";

import { Role, Tier, sha256Hex } from "@plimsoll/sdk";
import { getContracts } from "./data";

/**
 * The report-signing path.
 *
 * This module is only ever reached through `import()` (see the report page),
 * so the Soroban contract client it imports — with the stellar-sdk transaction
 * builder and XDR codegen — is split out of the page's initial bundle. It loads
 * when a reporter looks up their tier or presses "Sign and post", not on first
 * render.
 */

export interface PostReserveArgs {
  reporter: string;
  sac: string;
  /** Smallest units. */
  amount: bigint;
  /** Unix seconds. */
  asOf: number;
  docHash: string;
  docUri: string;
}

/**
 * The tier this address would post at: the issuer signs at Issuer-signed, a
 * registered auditor at Auditor-signed, a registered transcriber at
 * Transcribed, and anyone else is refused. Null means "not allowed".
 */
export async function reporterTier(
  address: string,
  sac: string,
  issuer: string | undefined,
): Promise<Tier | null> {
  if (issuer === address) return Tier.IssuerSigned;
  const info = await (await getContracts()).getReporter(address);
  if (info?.role === Role.Auditor) return Tier.AuditorSigned;
  if (info?.role === Role.Transcriber) return Tier.Transcribed;
  return null;
}

/** SHA-256 of a document, hex encoded, for the report's doc_hash. */
export function hashDocument(bytes: ArrayBuffer): Promise<string> {
  return sha256Hex(bytes);
}

/** Simulate and prepare the unsigned reserve-report transaction. */
export async function prepareReserveReport(args: PostReserveArgs): Promise<string> {
  const contracts = await getContracts();
  return contracts.preparePostReserve(args);
}

/** Send a wallet-signed envelope and return its transaction hash. */
export async function submitReserveReport(signedXdr: string): Promise<string> {
  const contracts = await getContracts();
  return contracts.submit(signedXdr);
}
