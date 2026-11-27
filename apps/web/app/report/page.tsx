"use client";

import { useEffect, useState } from "react";
import {
  ContractCallError,
  LedgerError,
  Role,
  Tier,
  describeError,
  formatUnits,
  parseContractErrorCode,
  sha256Hex,
  shortAddress,
  tierLabel,
  validateDocUri,
} from "@plimsoll/sdk";
import { CopyButton } from "@/components/ui";
import Link from "next/link";
import { config, explorer } from "@/lib/config";
import { contracts, loadAssets, type AssetView } from "@/lib/data";
import { addPending, removePending, txHashOf } from "@/lib/pending-reports";
import { checkAmount } from "@/lib/report-preview";
import { WalletError, connectWallet, signXdr } from "@/lib/wallet";

type Status =
  | { kind: "idle" }
  | { kind: "busy"; msg: string }
  | { kind: "ok"; hash: string; tier: Tier; sac: string }
  | { kind: "err"; msg: string };

export default function ReportPage() {
  const [assets, setAssets] = useState<AssetView[]>([]);
  const [address, setAddress] = useState<string | null>(null);
  const [sac, setSac] = useState("");
  const [amount, setAmount] = useState("");
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [docUri, setDocUri] = useState("");
  const [docHash, setDocHash] = useState("");
  const [tier, setTier] = useState<Tier | null | undefined>(undefined);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [modalOpen, setModalOpen] = useState(false);
  const [estimatedFee, setEstimatedFee] = useState<number | null>(null);
  const [isEstimatingFee, setIsEstimatingFee] = useState(false);

  useEffect(() => {
    if (!modalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && status.kind !== "busy") {
        setModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modalOpen, status.kind]);

  useEffect(() => {
    loadAssets()
      .then((list) => {
        setAssets(list);
        if (list[0]) setSac(list[0].sac);
      })
      .catch(() => setAssets([]));
  }, []);

  // Which tier will this address's report get?
  useEffect(() => {
    if (!address || !sac) return;
    const asset = assets.find((a) => a.sac === sac);
    if (asset?.issuer === address) {
      setTier(Tier.IssuerSigned);
      return;
    }
    setTier(undefined);
    contracts
      .getReporter(address)
      .then((info) => {
        if (info?.role === Role.Auditor) setTier(Tier.AuditorSigned);
        else if (info?.role === Role.Transcriber) setTier(Tier.Transcribed);
        else setTier(null);
      })
      .catch(() => setTier(null));
  }, [address, sac, assets]);

  const connect = async () => {
    try {
      setAddress(await connectWallet());
      setStatus({ kind: "idle" });
    } catch (e) {
      setStatus({ kind: "err", msg: e instanceof Error ? e.message : String(e) });
    }
  };

  const hashFile = async (file: File | undefined) => {
    if (!file) return;
    setDocHash(await sha256Hex(await file.arrayBuffer()));
  };

  const hashUrl = async () => {
    try {
      const res = await fetch(docUri);
      if (!res.ok) throw new Error(`status ${res.status}`);
      setDocHash(await sha256Hex(await res.arrayBuffer()));
    } catch (e) {
      setStatus({
        kind: "err",
        msg: `Could not download the document to hash it (${e instanceof Error ? e.message : e}). Upload the file instead.`,
      });
    }
  };

  const selected = assets.find((a) => a.sac === sac);
  const amountCheck = checkAmount(amount, selected?.supply?.amount, selected?.code);
  const preview = amountCheck.kind === "valid" ? amountCheck.preview : null;
  const docUriCheck = docUri.trim() ? validateDocUri(docUri) : null;

  const openModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !tier || amountCheck.kind !== "valid" || preview?.warning) return;
    if (!docUriCheck?.valid) return;
    setModalOpen(true);
    setIsEstimatingFee(true);
    setEstimatedFee(null);
    try {
      const units = amountCheck.units;
      const asOfSecs = Math.floor(new Date(`${asOf}T00:00:00Z`).getTime() / 1000);
      const op = contracts.postReserveOperation({
        reporter: address,
        sac,
        amount: units,
        asOf: asOfSecs,
        docHash,
        docUri,
      });
      const fee = await contracts.estimateFee(op);
      setEstimatedFee(fee);
    } catch {
      setEstimatedFee(0);
    } finally {
      setIsEstimatingFee(false);
    }
  };

  const confirmSign = async () => {
    if (!address || !tier || amountCheck.kind !== "valid" || preview?.warning) return;
    setModalOpen(false);
    // Set once the wallet signs, so a failure after that point can take the
    // optimistic row back off the asset page.
    let pendingHash: string | null = null;
    try {
      const units = amountCheck.units;
      const asOfSecs = Math.floor(new Date(`${asOf}T00:00:00Z`).getTime() / 1000);
      setStatus({ kind: "busy", msg: "Simulating…" });
      const xdr = await contracts.preparePostReserve({
        reporter: address,
        sac,
        amount: units,
        asOf: asOfSecs,
        docHash,
        docUri: docUriCheck.uri,
      });
      setStatus({ kind: "busy", msg: "Waiting for your signature…" });
      const signed = await signXdr(xdr, address);
      pendingHash = txHashOf(signed, config.network.networkPassphrase);
      // Show the report on the asset page now, marked pending; the asset page
      // swaps it for the confirmed row when the indexer reports the event.
      addPending({
        txHash: pendingHash,
        sac,
        tier,
        amount: units.toString(),
        asOf: asOfSecs,
        reporter: address,
        docHash,
        docUri,
      });
      setStatus({ kind: "busy", msg: "Submitting…" });
      const hash = await contracts.submit(signed);
      setStatus({ kind: "ok", hash, tier, sac });
    } catch (err) {
      if (pendingHash) removePending([pendingHash]);
      const msg = err instanceof WalletError || err instanceof Error ? err.message : String(err);
      setStatus({ kind: "err", msg: friendly(err, msg) });
    }
  };

  const ready =
    address &&
    tier &&
    sac &&
    amountCheck.kind === "valid" &&
    !preview?.warning &&
    docUriCheck?.valid &&
    /^[0-9a-f]{64}$/.test(docHash) &&
    status.kind !== "busy";

import dynamic from "next/dynamic";

// The signing path pulls in @stellar/stellar-sdk and the wallet kit. Load it
// only once the form mounts, so the page shell is in the first bundle and
// paints immediately.
const ReportForm = dynamic(() => import("./ReportForm"), {
  ssr: false,
  loading: () => <FormSkeleton />,
});

export default function ReportPage() {
  return (
    <>
      <div className="eyebrow">For issuers, auditors and transcribers</div>
      <h1>Post a reserve report</h1>
      <p className="sub" style={{ maxWidth: 680 }}>
        Your account decides the weight of the report. The asset&apos;s issuer account posts at the
        Issuer-signed tier. Registered auditors post at Auditor-signed, registered transcribers at
        Transcribed. Anyone else is refused by the contract.
      </p>

      <div className="card mt" style={{ maxWidth: 680 }}>
        {address ? (
          <div className="spread">
            <span>
              Connected as <code className="break">{address}</code>{" "}
              <CopyButton value={address} label="connected address" />
            </span>
            <span>
              {tier === undefined ? (
                "Checking role…"
              ) : tier === null ? (
                <span className="pill pill-under">Not allowed to report</span>
              ) : (
                <span className="pill pill-tier">Will post as {tierLabel(tier)}</span>
              )}
            </span>
          </div>
        ) : (
          <button type="button" onClick={connect}>
            Connect wallet
          </button>
        )}
      </div>

      <form className="stack mt" onSubmit={openModal}>
        <label>
          Asset
          <select value={sac} onChange={(e) => setSac(e.target.value)} required>
            {assets.map((a) => (
              <option key={a.sac} value={a.sac}>
                {a.code} — {a.issuer.slice(0, 6)}…{a.issuer.slice(-4)}
              </option>
            ))}
          </select>
        </label>
        <div className="sub" style={{ marginTop: -4 }}>
          Asset contract <span className="mono">{shortAddress(sac, 6)}</span>{" "}
          <CopyButton value={sac} label="asset contract id" disabled={!sac} />
        </div>
        <label>
          Reserves held
          <span className="hint">In units of the asset, up to 7 decimals. Example: 1,020,000</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1,020,000"
            required
            aria-invalid={amountCheck.kind === "invalid"}
            aria-describedby={amountCheck.kind === "invalid" ? "amount-error" : undefined}
          />
          {amountCheck.kind === "invalid" ? (
            <span className="field-error" id="amount-error" role="alert">
              {amountCheck.message}
            </span>
          ) : null}
        </label>
        <div
          aria-live="polite"
          style={{
            display: "grid",
            gap: 8,
            // Sit the preview just under the amount input, but keep the normal
            // field gap while there is nothing to show.
            marginTop: amountCheck.kind === "valid" ? -8 : undefined,
          }}
        >
          {amountCheck.kind === "valid" ? (
            amountCheck.preview ? (
              <>
                <p className="sub" id="amount-preview" style={{ margin: 0 }}>
                  This reads as <strong>{amountCheck.preview.percent}</strong> of the current supply
                  of{" "}
                  {selected?.supply
                    ? `${formatUnits(selected.supply.amount)} ${selected.code}`
                    : "the asset"}
                  .
                </p>
                {amountCheck.preview.warning ? (
                  <p className="notice notice-warn" style={{ margin: 0 }}>
                    {amountCheck.preview.warning}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="notice notice-info" style={{ margin: 0 }}>
                {noSupplyNote(selected)}
              </p>
            )
          ) : null}
        </div>
        <label>
          As of (UTC date)
          <span className="hint">
            The date the reserve figure describes. Cannot be in the future.
          </span>
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} required />
        </label>
        <label>
          Source document URL
          <span className="hint">
            A stable link to the attestation or statement (PDF, page, file).
          </span>
          <input
            type="url"
            value={docUri}
            onChange={(e) => setDocUri(e.target.value)}
            placeholder="https://…"
            required
            maxLength={256}
            aria-invalid={docUriCheck !== null && !docUriCheck.valid}
            aria-describedby={docUriCheck && !docUriCheck.valid ? "doc-uri-error" : undefined}
          />
          {docUriCheck && !docUriCheck.valid ? (
            <span className="field-error" id="doc-uri-error" role="alert">
              {docUriCheck.message}
            </span>
          ) : null}
        </label>
        <div>
          <label>
            Document SHA-256
            <span className="hint">
              Upload the file or fetch it from the URL; the hash is computed in your browser.
            </span>
            <input
              className="mono"
              value={docHash}
              onChange={(e) => setDocHash(e.target.value.trim().toLowerCase())}
              placeholder="64 hex characters"
              required
            />
          </label>
          <div className="sub" style={{ marginTop: 6 }}>
            {docHash ? (
              <>
                Current hash <span className="mono">{shortAddress(docHash, 8)}</span>{" "}
              </>
            ) : (
              <>No hash yet. </>
            )}
            <CopyButton value={docHash} label="document hash" disabled={!docHash} />
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <input
              type="file"
              aria-label="Upload document to hash"
              onChange={(e) => hashFile(e.target.files?.[0])}
              style={{ maxWidth: 320 }}
            />
            <button type="button" className="secondary" onClick={hashUrl} disabled={!docUri}>
              Hash from URL
            </button>
          </div>
        </div>
        <div>
          <button type="submit" disabled={!ready}>
            Review and sign
          </button>
        </div>
      </form>

      {modalOpen ? (
        <div
          role="presentation"
          onClick={() => status.kind !== "busy" && setModalOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgb(15 29 43 / 55%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-dialog-title"
            className="wallet-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{
              margin: 0,
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <div className="wallet-dialog-head">
              <h2 id="report-dialog-title">Review &amp; sign report</h2>
              <button
                type="button"
                className="wallet-dialog-close"
                onClick={() => setModalOpen(false)}
                disabled={status.kind === "busy"}
                aria-label="Close"
              >
                Close
              </button>
            </div>
            <div className="wallet-dialog-body">
              <p className="sub" style={{ marginTop: 0 }}>
                Review report details and estimated resource fee before signing with your wallet.
              </p>
              <div className="card" style={{ padding: 14, display: "grid", gap: 10 }}>
                <div>
                  <div className="stat-label">Asset</div>
                  <div className="stat-value" style={{ fontSize: "1.05rem" }}>
                    {selected?.code} ({shortAddress(sac, 6)})
                  </div>
                </div>
                <div>
                  <div className="stat-label">Reserves to report</div>
                  <div className="stat-value" style={{ fontSize: "1.05rem" }}>
                    {amount} {selected?.code}
                  </div>
                </div>
                <div>
                  <div className="stat-label">As of date (UTC)</div>
                  <div className="stat-value" style={{ fontSize: "1.05rem" }}>
                    {asOf}
                  </div>
                </div>
                <div>
                  <div className="stat-label">Document SHA-256</div>
                  <div className="mono break" style={{ fontSize: "0.85rem" }}>
                    {shortAddress(docHash, 8)}
                  </div>
                </div>
                <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                  <div className="stat-label">Estimated resource fee</div>
                  <div
                    className="stat-value"
                    id="report-signing-fee-estimate"
                    style={{ fontSize: "1.1rem", color: "var(--brand)" }}
                  >
                    {isEstimatingFee ? "Estimating…" : `${estimatedFee ?? 0} stroops`}
                  </div>
                  <div className="sub" style={{ fontSize: "0.8rem", marginTop: 2 }}>
                    Calculated via Soroban simulation. Network base fee (100 stroops) applies at
                    submission.
                  </div>
                </div>
              </div>
              <div className="row mt" style={{ gap: 10 }}>
                <button
                  type="button"
                  onClick={confirmSign}
                  disabled={status.kind === "busy" || isEstimatingFee}
                >
                  Confirm and sign
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setModalOpen(false)}
                  disabled={status.kind === "busy"}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div aria-live="polite" className="mt" style={{ maxWidth: 680 }}>
        {status.kind === "busy" ? <p className="notice notice-info">{status.msg}</p> : null}
        {status.kind === "err" ? <p className="notice notice-bad">{status.msg}</p> : null}
        {status.kind === "ok" ? (
          <p className="notice notice-ok">
            Posted as {tierLabel(status.tier)}.{" "}
            <a href={explorer.tx(status.hash)} target="_blank" rel="noreferrer">
              View transaction
            </a>
            . <CopyButton value={status.hash} label="transaction hash" /> The{" "}
            <Link href={`/asset/?sac=${status.sac}`}>asset page</Link> shows it as pending until the
            indexer picks up the event.
          </p>
        ) : null}
      </div>
      <ReportForm />
    </>
  );
}

function FormSkeleton() {
  return (
    <div
      className="mt"
      aria-busy="true"
      aria-label="Loading the report form"
      style={{ maxWidth: 680 }}
    >
      <div className="card" style={{ display: "grid", gap: 12 }}>
        <Bar height={24} width="40%" />
        <Bar height={14} width="70%" />
      </div>
      <div className="mt" style={{ display: "grid", gap: 16 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ display: "grid", gap: 6 }}>
            <Bar height={14} width="22%" />
            <Bar height={42} />
          </div>
        ))}
      </div>
    </div>
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
function Bar({ height, width = "100%" }: { height: number; width?: string }) {
  return <div className="skeleton" style={{ height, width }} aria-hidden="true" />;
}
