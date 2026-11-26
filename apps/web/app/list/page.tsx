"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StrKey } from "@stellar/stellar-sdk";
import {
  ContractCallError,
  LedgerError,
  describeError,
  fetchIssuerAssetCodes,
  parseContractErrorCode,
  sacAddress,
} from "@plimsoll/sdk";
import { config, explorer } from "@/lib/config";
import { contracts, loadAssets } from "@/lib/data";
import { unissuedWarning } from "@/lib/watch";
import { connectWallet, signXdr } from "@/lib/wallet";

type Step =
  | { kind: "idle" }
  | { kind: "busy"; msg: string }
  | { kind: "listed"; sac: string; already: boolean; hash?: string }
  | { kind: "needs-sac"; sac: string }
  | { kind: "err"; msg: string };

export default function ListPage() {
  const [code, setCode] = useState("");
  const [issuer, setIssuer] = useState("");
  const [step, setStep] = useState<Step>({ kind: "idle" });

  const issuerValid = StrKey.isValidEd25519PublicKey(issuer);
  // null: not looked up, or Horizon failed (free text, no warning).
  const [issuerCodes, setIssuerCodes] = useState<string[] | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [listedCodes, setListedCodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    setIssuerCodes(null);
    if (!issuerValid || !config.network.horizonUrl) return;
    let cancelled = false;
    setLookingUp(true);
    Promise.all([
      fetchIssuerAssetCodes(config.network.horizonUrl, issuer),
      loadAssets().catch(() => []),
    ])
      .then(([codes, listed]) => {
        if (cancelled) return;
        setIssuerCodes(codes);
        setListedCodes(new Set(listed.filter((a) => a.issuer === issuer).map((a) => a.code)));
      })
      .catch(() => {
        // Horizon is down or rate limiting: keep the plain free-text behaviour.
        if (!cancelled) setIssuerCodes(null);
      })
      .finally(() => {
        if (!cancelled) setLookingUp(false);
      });
    return () => {
      cancelled = true;
    };
  }, [issuer, issuerValid]);

  const warning = unissuedWarning(code, issuerCodes);

  const valid = /^[a-zA-Z0-9]{1,12}$/.test(code) && issuerValid;
  const sac = valid ? sacAddress(code, issuer, config.network.networkPassphrase) : "";

  const signAndSend = async (prepare: (source: string) => Promise<string>, label: string) => {
    const source = await connectWallet();
    setStep({ kind: "busy", msg: `Preparing ${label}…` });
    const xdr = await prepare(source);
    setStep({ kind: "busy", msg: "Waiting for your signature…" });
    const signed = await signXdr(xdr, source);
    setStep({ kind: "busy", msg: "Submitting…" });
    return contracts.submit(signed);
  };

  const list = async () => {
    try {
      setStep({ kind: "busy", msg: "Checking the coverage ledger…" });
      const existing = await contracts.getAsset(sac);
      if (existing) {
        setStep({ kind: "listed", sac, already: true });
        return;
      }
      const hash = await signAndSend((src) => contracts.prepareListAsset(src, sac), "listing");
      setStep({ kind: "listed", sac, already: false, hash });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // No SAC deployed yet for this asset: the call fails before reaching our contract.
      if (/MissingValue|non-existent|contract.*not found|Error\(Storage/i.test(msg)) {
        setStep({ kind: "needs-sac", sac });
      } else {
        setStep({
          kind: "err",
          msg: friendly(e, msg),
        });
      }
    }
  };

  const deploySac = async () => {
    try {
      await signAndSend(
        (src) => contracts.prepareDeploySac(src, code, issuer),
        "asset contract deployment",
      );
      await list();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStep({ kind: "err", msg: friendly(e, msg) });
    }
  };

  return (
    <>
      <div className="eyebrow">Permissionless</div>
      <h1>List an asset</h1>
      <p className="sub" style={{ maxWidth: 680 }}>
        Any classic Stellar asset can be listed by anyone. The contract reads the code and issuer
        from the asset&apos;s built-in Stellar Asset Contract, so a look-alike token cannot be
        listed under a real issuer&apos;s name. Once listed, the indexer starts posting supply.
      </p>

      <form
        className="stack mt"
        onSubmit={(e) => {
          e.preventDefault();
          void list();
        }}
      >
        <label>
          Asset code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.trim())}
            placeholder="USDC"
            maxLength={12}
            required
          />
        </label>
        <label>
          Issuer account
          <input
            className="mono"
            value={issuer}
            onChange={(e) => setIssuer(e.target.value.trim())}
            placeholder="G…"
            required
          />
        </label>
        {issuerValid && lookingUp ? (
          <p className="sub">Looking up this issuer&apos;s assets…</p>
        ) : null}
        {issuerCodes && issuerCodes.length > 0 ? (
          <div role="group" aria-label="Assets this issuer has issued">
            <p className="sub" style={{ margin: "0 0 6px" }}>
              Assets issued by this account. Pick one to fill in the code.
            </p>
            <div className="row">
              {issuerCodes.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="secondary"
                  aria-pressed={c === code}
                  onClick={() => setCode(c)}
                >
                  {c}
                  {listedCodes.has(c) ? " (already listed)" : ""}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {warning ? (
          <p className="notice notice-bad" role="alert">
            {warning}
          </p>
        ) : null}
        {valid ? (
          <p className="sub">
            Asset contract on {config.networkName}: <code className="break">{sac}</code>
          </p>
        ) : null}
        <div>
          <button type="submit" disabled={!valid || step.kind === "busy"}>
            List asset
          </button>
        </div>
      </form>

      <div aria-live="polite" className="mt" style={{ maxWidth: 680 }}>
        {step.kind === "busy" ? <p className="notice notice-info">{step.msg}</p> : null}
        {step.kind === "err" ? <p className="notice notice-bad">{step.msg}</p> : null}
        {step.kind === "listed" ? (
          <p className="notice notice-ok">
            {step.already ? "Already listed. " : "Listed. "}
            <Link href={`/asset/?sac=${step.sac}`}>Open the asset page</Link>
            {step.hash ? (
              <>
                {" · "}
                <a href={explorer.tx(step.hash)} target="_blank" rel="noreferrer">
                  transaction
                </a>
              </>
            ) : null}
          </p>
        ) : null}
        {step.kind === "needs-sac" ? (
          <div className="notice notice-info">
            <p>
              This asset has no Stellar Asset Contract on {config.networkName} yet. Deploying it is
              a one-time, permissionless step that does not change the asset.
            </p>
            {warning ? <p>{warning}</p> : null}
            <button type="button" onClick={deploySac}>
              Deploy asset contract, then list
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}

export const ERRORS: Record<number, string> = {
  [LedgerError.NotAStellarAsset]: "That address is not a Stellar Asset Contract.",
  [LedgerError.AlreadyListed]: "This asset is already listed.",
  [LedgerError.AssetNotListed]: "This asset is not listed on the coverage ledger.",
  [LedgerError.NotSupplyPoster]: "This account is not a registered supply poster.",
  [LedgerError.NotReporter]:
    "This account is not the issuer and is not a registered auditor or transcriber.",
  [LedgerError.InvalidAmount]: "Reserves cannot be negative.",
  [LedgerError.FutureLedger]: "The supply ledger is in the future.",
  [LedgerError.StaleLedger]: "The supply ledger is not newer than the stored one.",
  [LedgerError.FutureTimestamp]: "The as-of date is in the future.",
  [LedgerError.StaleReport]:
    "There is already a report at this tier with the same or a later as-of date.",
  [LedgerError.InvalidUri]: "The document URL is empty or longer than 256 characters.",
  [LedgerError.ImplausibleAmount]:
    "The amount is outside 0.01% to 10,000% of the current supply and is likely a unit mistake (entering whole units instead of smallest units, or vice versa).",
  [LedgerError.TooManyReporters]:
    "This asset already has the maximum of 4 active reporters at this tier.",
};

export function friendly(e: unknown, fallback: string): string {
  const code =
    e instanceof ContractCallError
      ? e.code
      : parseContractErrorCode(fallback);
  return (code !== undefined && ERRORS[code]) || (code !== undefined && describeError(code, "ledger")) || fallback;
}

