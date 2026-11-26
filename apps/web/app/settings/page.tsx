"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { IndexerError } from "@plimsoll/sdk";
import type { IndexerWebhook } from "@plimsoll/sdk";
import { indexer, loadAssets, type AssetView } from "@/lib/data";
import { RefreshControls } from "@/components/RefreshControls";
import { useRefreshIntervalSetting } from "@/lib/refresh-interval";

const INDEXER_WEBHOOK_DOCS =
  "https://plimsoll-protocol.gitbook.io/plimsoll-protocol-docs/indexer/webhooks";

interface FormState {
  url: string;
  thresholdPct: string;
  sac: string;
}

type SubmitState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "ok"; webhook: IndexerWebhook }
  | { kind: "err"; message: string };

function validateWebhookUrl(url: string): string | null {
  if (!url.trim()) return "Webhook URL is required.";
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:") return "Webhook URL must use https://.";
    return null;
  } catch {
    return "Webhook URL is not a valid URL.";
  }
}

function validateThreshold(pct: string): string | null {
  if (!pct.trim()) return "Threshold is required.";
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(pct.trim())) {
    return "Threshold must be a number from 0 to 1000, with at most two decimals.";
  }
  const n = Number(pct);
  if (n < 0 || n > 1000) return "Threshold must be between 0% and 1000%.";
  return null;
}

/** The outcome of a webhook test, announced to screen readers when it appears. */
function TestNotice({ state }: { state: WebhookTestState | undefined }) {
  const notice = noticeFor(state);
  if (!notice) return null;
  return (
    <p
      className={`notice ${notice.tone === "ok" ? "notice-ok" : "notice-bad"}`}
      role={notice.tone === "ok" ? "status" : "alert"}
      style={{ marginTop: 8, fontSize: "0.85rem" }}
    >
      {notice.text}
    </p>
  );
}

export default function SettingsPage() {
  const [assets, setAssets] = useState<AssetView[]>([]);
  const [form, setForm] = useState<FormState>({ url: "", thresholdPct: "100", sac: "" });
  const [urlError, setUrlError] = useState<string | null>(null);
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });
  const [webhooks, setWebhooks] = useState<IndexerWebhook[] | null>(null);
  const [intervalValue, setIntervalValue] = useRefreshIntervalSetting();

  const indexerAvailable = indexer !== null;

  useEffect(() => {
    loadAssets()
      .then(setAssets)
      .catch(() => setAssets([]));
    if (indexer) {
      indexer
        .listWebhooks()
        .then(setWebhooks)
        .catch(() => setWebhooks([]));
    }
  }, []);

  function set(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    if (field === "url") setUrlError(null);
    if (field === "thresholdPct") setThresholdError(null);
    if (submitState.kind === "ok" || submitState.kind === "err") {
      setSubmitState({ kind: "idle" });
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const uErr = validateWebhookUrl(form.url);
    const tErr = validateThreshold(form.thresholdPct);
    setUrlError(uErr);
    setThresholdError(tErr);
    if (uErr || tErr || !indexer) return;

    const threshold_bps = Math.round(Number(form.thresholdPct) * 100);
    setSubmitState({ kind: "busy" });
    try {
      const webhook = await indexer.registerWebhook({
        url: form.url.trim(),
        threshold_bps,
        sac: form.sac || undefined,
      });
      setSubmitState({ kind: "ok", webhook });
      setWebhooks((prev) => (prev ? [webhook, ...prev] : [webhook]));
    } catch (err) {
      const message =
        err instanceof IndexerError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not register webhook.";
      setSubmitState({ kind: "err", message });
    }
  }

  async function handleTest(id: string) {
    if (!indexer || tests[id]?.kind === "busy") return;
    setTests((prev) => ({ ...prev, [id]: { kind: "busy" } }));
    const next = await runWebhookTest(indexer, id);
    setTests((prev) => ({ ...prev, [id]: next }));
  }

  async function handleDelete(id: string) {
    if (!indexer) return;
    try {
      await indexer.deleteWebhook(id);
      setWebhooks((prev) => (prev ? prev.filter((w) => w.id !== id) : prev));
      setTests((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => key !== id)));
    } catch {
      // keep the list as-is; the webhook may still be active
    }
  }

  return (
    <>
      <h1>Coverage alert webhooks</h1>
      <p>
        Register a URL to receive a POST request when an asset&apos;s coverage ratio falls below a
        threshold. The{" "}
        <a href={INDEXER_WEBHOOK_DOCS} target="_blank" rel="noreferrer">
          indexer webhook API docs
        </a>{" "}
        describe the payload format.
      </p>

      {!indexerAvailable ? (
        <p className="notice notice-warn">
          Webhook registration requires the Plimsoll indexer, which is not configured for this
          deployment. Set <code>NEXT_PUBLIC_INDEXER_URL</code> to enable this page.
        </p>
      ) : (
        <form className="stack" onSubmit={(e) => void handleSubmit(e)} noValidate>
          <label htmlFor="webhook-url">
            Webhook URL
            <span className="hint">Must start with https://</span>
            <input
              id="webhook-url"
              type="url"
              inputMode="url"
              autoComplete="url"
              value={form.url}
              onChange={(e) => set("url", e.target.value)}
              aria-describedby={urlError ? "webhook-url-error" : undefined}
              aria-invalid={urlError !== null}
              placeholder="https://example.com/plimsoll-hook"
            />
            {urlError ? (
              <span id="webhook-url-error" className="field-error" role="alert">
                {urlError}
              </span>
            ) : null}
          </label>

          <label htmlFor="webhook-threshold">
            Coverage threshold (%)
            <span className="hint">
              Alert fires when coverage drops below this value. Enter a percentage, e.g. 100 for
              100%.
            </span>
            <input
              id="webhook-threshold"
              type="text"
              inputMode="decimal"
              value={form.thresholdPct}
              onChange={(e) => set("thresholdPct", e.target.value)}
              aria-describedby={thresholdError ? "webhook-threshold-error" : undefined}
              aria-invalid={thresholdError !== null}
              style={{ width: 160 }}
            />
            {thresholdError ? (
              <span id="webhook-threshold-error" className="field-error" role="alert">
                {thresholdError}
              </span>
            ) : null}
          </label>

          <label htmlFor="webhook-asset">
            Asset (optional)
            <span className="hint">Leave blank to receive alerts for all listed assets.</span>
            <select
              id="webhook-asset"
              value={form.sac}
              onChange={(e) => set("sac", e.target.value)}
            >
              <option value="">All assets</option>
              {assets.map((a) => (
                <option key={a.sac} value={a.sac}>
                  {a.code} — {a.sac.slice(0, 8)}…
                </option>
              ))}
            </select>
          </label>

          {submitState.kind === "ok" ? (
            <p className="notice notice-ok" role="status">
              Webhook registered. ID: <code>{submitState.webhook.id}</code>
            </p>
          ) : submitState.kind === "err" ? (
            <p className="notice notice-bad" role="alert">
              {submitState.message}
            </p>
          ) : null}

          <div>
            <button type="submit" disabled={submitState.kind === "busy"}>
              {submitState.kind === "busy" ? "Registering…" : "Register webhook"}
            </button>
          </div>
        </form>
      )}

      {webhooks && webhooks.length > 0 ? (
        <>
          <h2>Registered webhooks</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">URL</th>
                  <th scope="col">Threshold</th>
                  <th scope="col">Asset</th>
                  <th scope="col">Registered</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map((w) => (
                  <tr key={w.id}>
                    <td style={{ wordBreak: "break-all" }}>
                      <a href={w.url} target="_blank" rel="noreferrer">
                        {w.url}
                      </a>
                    </td>
                    <td className="num">{(w.threshold_bps / 100).toFixed(2)}%</td>
                    <td>{w.sac ? `${w.sac.slice(0, 8)}…` : "All"}</td>
                    <td className="num">{new Date(w.created_at).toISOString().slice(0, 10)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="secondary"
                          style={{ padding: "2px 10px", fontSize: "0.85rem" }}
                          onClick={() => void handleTest(w.id)}
                          disabled={tests[w.id]?.kind === "busy"}
                          aria-busy={tests[w.id]?.kind === "busy"}
                          aria-label={`Send test payload to ${w.url}`}
                        >
                          {buttonLabel(tests[w.id])}
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          style={{ padding: "2px 10px", fontSize: "0.85rem" }}
                          onClick={() => void handleDelete(w.id)}
                          aria-label={`Delete webhook ${w.url}`}
                        >
                          Delete
                        </button>
                      </div>
                      <TestNotice state={tests[w.id]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : webhooks !== null && indexerAvailable ? (
        <p className="sub" style={{ marginTop: 24 }}>
          No webhooks registered yet.
        </p>
      ) : null}

      <h2>Live data refresh</h2>
      <p className="sub" style={{ maxWidth: 640 }}>
        How often the asset, reporter and home pages re-fetch live data automatically. The setting
        is stored in your browser, so it survives reloads, and applies immediately without one.
      </p>
      <div className="mt" style={{ maxWidth: 640 }}>
        <RefreshControls
          interval={intervalValue}
          onChange={setIntervalValue}
          onRefresh={() => {}}
        />
      </div>
      <p className="sub" style={{ marginTop: 12 }}>
        Off disables automatic refresh entirely; the Refresh button on each page still fetches on
        demand.
      </p>

      <p className="sub" style={{ marginTop: 24 }}>
        <Link href="/">Back to assets</Link>
      </p>
    </>
  );
}
