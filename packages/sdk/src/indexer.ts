/** Typed client for the plimsoll-indexer HTTP API. */

import { DEFAULT_MAX_AGE_SECONDS, type CoverageStatus } from "./format";
import { streamReports, type ReportStream, type StreamReportsOptions } from "./report-stream";

/** Re-exported coverage status for use with {@link IndexerClient.batchCoverageStatus}. */
export type IndexerCoverageStatus = CoverageStatus;

function indexerCoverageStatus(
  bps: number | null,
  ages: { report: number; supply: number },
  maxAgeSeconds: number = DEFAULT_MAX_AGE_SECONDS,
): IndexerCoverageStatus {
  if (bps == null) return "unknown";
  if (ages.report > maxAgeSeconds) return "stale";
  if (ages.supply > maxAgeSeconds) return "stale";
  return bps >= 10_000 ? "covered" : "under";
}

/**
 * Where a figure came from. "event" means it was decoded from a contract
 * event, and tx_hash names the transaction that produced it. "chain" means the
 * indexer read it back from contract state to repair a gap in event ingestion,
 * and tx_hash is empty because the originating transaction is not recoverable.
 * Absent on an indexer older than this field; treat that as "event".
 */
export type IndexerSource = "event" | "chain";

export interface IndexerSupply {
  amount: string;
  ledger: number;
  posted_at: string;
  breakdown_hash: string;
  poster: string;
  tx_hash: string;
  source?: IndexerSource;
}

export interface IndexerReport {
  tier: "transcribed" | "issuer_signed" | "auditor_signed";
  amount: string;
  as_of: string;
  posted_at: string;
  reporter: string;
  doc_hash: string;
  doc_uri: string;
  tx_hash: string;
  source?: IndexerSource;
}

/** A report from a reporter's history, which spans assets, so it names its asset. */
export interface IndexerReporterReport extends IndexerReport {
  sac: string;
}

/** Filters and paging for {@link IndexerClient.reporterReports}. */
export interface ReporterReportsQuery {
  /** Page size; the indexer caps it. */
  limit?: number;
  /** Only reports posted strictly before this ledger. Pass the previous page's `nextBefore`. */
  before?: number;
  /** Only reports on this asset contract. */
  asset?: string;
}

/** One page of a reporter's reports, newest first. */
export interface ReporterReportsPage {
  reports: IndexerReporterReport[];
  /** Pass as `before` for the next older page; null when there are no more. */
  nextBefore: number | null;
}

export interface IndexerCoverage {
  bps: number | null;
  ratio: string | null;
  tier: IndexerReport["tier"];
  supply: string;
  reserves: string;
  supply_ledger: number;
  supply_posted_at: string;
  report_as_of: string;
  report_age_seconds: number;
  supply_age_seconds: number;
  reporter: string;
  doc_uri: string;
}

export interface IndexerToml {
  home_domain: string;
  org_name?: string;
  org_url?: string;
  currency?: {
    code: string;
    issuer: string;
    name?: string;
    is_asset_anchored: boolean;
    anchor_asset?: string;
    attestation_of_reserve?: string;
    redemption_instructions?: string;
  };
}

export interface IndexerAsset {
  sac: string;
  code: string;
  issuer: string;
  listed_ledger: number;
  listed_at: string;
  toml: IndexerToml | null;
  toml_checked_at?: string;
  toml_error?: string;
  supply: IndexerSupply | null;
  reports: Partial<Record<IndexerReport["tier"], IndexerReport>>;
  coverage: IndexerCoverage | null;
}

export interface IndexerReporter {
  address: string;
  role: "auditor" | "transcriber" | "supply_poster";
  name: string;
  updated_at: string;
  /** XLM stake in stroops (optional; absent on older indexer versions). */
  stake?: string;
  /** Total reports submitted (optional). */
  reports?: number;
  /** Number of accepted disputes against this reporter (optional). */
  disputes?: number;
  /** Reputation score 0–100 (optional). */
  /**
   * The reporter's on-chain reputation score, when the indexer has read one
   * from the registry. Optional: an indexer that has not indexed it yet, or a
   * registry build without it, omits the field.
   */
  reputation?: number;
}

export interface IndexerNetwork {
  network_passphrase: string;
  rpc_url: string;
  horizon_url: string;
  coverage_ledger_id: string;
  reporter_registry_id: string;
}

/** Outcome of the state reconciler's latest run over one asset. */
export interface IndexerReconcileAsset {
  sac: string;
  /** RFC 3339 time of the last run that covered this asset, or null before the first. */
  last_run_at: string | null;
  /** Whether that run completed ("ok") or returned an error ("failed"). */
  outcome: "ok" | "failed";
  /** Supply rows the run found newer than ingestion had and stored. */
  recovered_supply?: number;
  /** Report rows the run found newer than ingestion had and stored. */
  recovered_reports?: number;
  /** The job's error, when outcome is "failed". */
  error?: string | null;
}

/**
 * What the indexer's state reconciler has done recently. The reconciler reads
 * each listed asset's latest supply and report back from the coverage ledger
 * and stores anything newer than event ingestion has, which repairs gaps
 * longer than RPC's event retention.
 */
export interface IndexerReconcileStatus {
  /** False when the job is switched off or has not started. */
  running: boolean;
  /** RECONCILE_INTERVAL in seconds. */
  interval_seconds?: number;
  /** RFC 3339 time of the last completed run, successful or not, or null. */
  last_run_at: string | null;
  /** Outcome of that run, or null before the first one finishes. */
  last_run_outcome?: "ok" | "failed" | null;
  /** Per-asset detail for the latest run. */
  assets?: IndexerReconcileAsset[];
}

export class IndexerError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "IndexerError";
  }
}

/** Per-request options. */
export interface RequestOptions {
  /** Cancels the request; the call rejects with an IndexerAbortError. */
  signal?: AbortSignal;
  /** Rejects with an IndexerAbortError after this many milliseconds. */
  timeoutMs?: number;
}

export interface IndexerHealth {
  status: "ok" | "lagging" | string;
  ingested_to_ledger?: number;
  latest_ledger?: number;
  lag_ledgers?: number;
  lag_seconds?: number;
  last_event_at?: string;
  last_event_age_seconds?: number;
  cursor?: number;
  [key: string]: unknown;
}

export interface IndexerWebhook {
  id: string;
  url: string;
  threshold_bps: number;
  sac: string | null;
  created_at: string;
}

/** What the indexer reports after firing a test payload at a webhook. */
export interface IndexerWebhookTestResult {
  /** HTTP status the webhook receiver answered with. */
  status: number;
}

export interface RegisterWebhookParams {
  url: string;
  threshold_bps: number;
  sac?: string;
}

/** Thrown when a request is aborted by the caller or by a timeout. */
export class IndexerAbortError extends Error {
  constructor(
    readonly reason: "aborted" | "timeout",
    message: string,
  ) {
    super(message);
    this.name = "IndexerAbortError";
  }
}

export class IndexerClient {
  private readonly base: string;

  constructor(
    baseUrl: string,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
    private readonly defaultTimeoutMs?: number,
  ) {
    this.base = baseUrl.replace(/\/+$/, "");
  }

  async listAssets(minTier = 1, opts?: RequestOptions): Promise<IndexerAsset[]> {
    const body = await this.get<{ assets: IndexerAsset[] }>(`/v1/assets?min_tier=${minTier}`, opts);
    return body.assets;
  }

  getAsset(sac: string, minTier = 1, opts?: RequestOptions): Promise<IndexerAsset> {
    return this.get(`/v1/assets/${encodeURIComponent(sac)}?min_tier=${minTier}`, opts);
  }

  async supplyHistory(sac: string, limit = 100, opts?: RequestOptions): Promise<IndexerSupply[]> {
    const body = await this.get<{ supply: IndexerSupply[] }>(
      `/v1/assets/${encodeURIComponent(sac)}/supply?limit=${limit}`,
      opts,
    );
    return body.supply;
  }

  async reportHistory(sac: string, limit = 100, opts?: RequestOptions): Promise<IndexerReport[]> {
    const body = await this.get<{ reports: IndexerReport[] }>(
      `/v1/assets/${encodeURIComponent(sac)}/reports?limit=${limit}`,
      opts,
    );
    return body.reports;
  }

  /**
   * One historical reserve report, by its sequence number, for linking straight
   * from the indexer's audit trail to the report it records.
   *
   * Resolves `null` when the asset has no report with that `seq`. An unknown
   * *asset* is different: the indexer answers 404 "asset not found" and this
   * throws an {@link IndexerError}, as `getAsset` does. Any other failure
   * throws too, so a network error is never mistaken for a missing report.
   *
   * Because a 404 for the report and a 404 for an indexer that does not serve
   * `GET /v1/assets/{sac}/reports/{seq}` look the same on the wire, `null`
   * from an older indexer means "not available there", not "no such report".
   *
   * @param asset Stellar Asset Contract address.
   * @param seq Zero-or-greater integer sequence number of the report.
   * @throws {RangeError} If `seq` is not a non-negative safe integer.
   * @example
   * ```ts
   * const report = await indexer.getReportBySeq(sac, 42);
   * if (report === null) console.log("no such report");
   * ```
   */
  async getReportBySeq(
    asset: string,
    seq: number,
    opts?: RequestOptions,
  ): Promise<IndexerReport | null> {
    if (!Number.isSafeInteger(seq) || seq < 0) {
      throw new RangeError(`seq must be a non-negative integer, got ${String(seq)}`);
    }
    try {
      return await this.get<IndexerReport>(
        `/v1/assets/${encodeURIComponent(asset)}/reports/${seq}`,
        opts,
      );
    } catch (err) {
      if (err instanceof IndexerError && err.status === 404 && !/asset/i.test(err.message)) {
        return null;
      }
      throw err;
    }
  }

  async reporters(opts?: RequestOptions): Promise<IndexerReporter[]> {
    const body = await this.get<{ reporters: IndexerReporter[] }>(`/v1/reporters`, opts);
    return body.reporters;
  }

  /**
   * Live reserve reports for one asset, as an async iterable.
   *
   * ```ts
   * for await (const report of indexer.streamReports(sac)) {
   *   console.log(report.tier, report.amount);
   * }
   * ```
   *
   * Leaving the loop (`break`, `return()`, an `AbortSignal`) closes the
   * underlying `EventSource`. Needs an indexer that serves the SSE events
   * stream at `/v1/assets/{sac}/events`.
   */
  streamReports(asset: string, options?: StreamReportsOptions): ReportStream {
    return streamReports(this.base, asset, options);
  }

  /**
   * GET /v1/reporters/{address}/reports: every report the reporter posted,
   * across all assets, newest first. Walk older pages by passing `nextBefore`
   * back as `before`.
   */
  async reporterReports(
    address: string,
    query: ReporterReportsQuery = {},
    opts?: RequestOptions,
  ): Promise<ReporterReportsPage> {
    const params = new URLSearchParams();
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    if (query.before !== undefined) params.set("before", String(query.before));
    if (query.asset) params.set("asset", query.asset);
    const qs = params.toString();
    const body = await this.get<{ reports: IndexerReporterReport[]; next_before?: number | null }>(
      `/v1/reporters/${encodeURIComponent(address)}/reports${qs ? `?${qs}` : ""}`,
      opts,
    );
    return { reports: body.reports, nextBefore: body.next_before ?? null };
  }

  network(opts?: RequestOptions): Promise<IndexerNetwork> {
    return this.get(`/v1/network`, opts);
  }

  /** GET /healthz. */
  health(opts?: RequestOptions): Promise<IndexerHealth> {
    return this.get<IndexerHealth>("/healthz", opts);
  }

  /**
   * GET /v1/reconcile, optionally narrowed to one asset.
   *
   * The endpoint is newer than the rest of the API, so a deployment that does
   * not serve it answers 404. That is reported as `null` — nothing is known
   * about the reconciler — rather than thrown, because an older indexer is not
   * a failure of the page asking.
   */
  async reconcileStatus(
    sac?: string,
    opts?: RequestOptions,
  ): Promise<IndexerReconcileStatus | null> {
    const query = sac ? `?asset=${encodeURIComponent(sac)}` : "";
    try {
      return await this.get<IndexerReconcileStatus>(`/v1/reconcile${query}`, opts);
    } catch (err) {
      if (err instanceof IndexerError && err.status === 404) return null;
      throw err;
    }
  }

  async registerWebhook(
    params: RegisterWebhookParams,
    opts?: RequestOptions,
  ): Promise<IndexerWebhook> {
    return this.post<IndexerWebhook>("/v1/webhooks", params, opts);
  }

  async listWebhooks(opts?: RequestOptions): Promise<IndexerWebhook[]> {
    const body = await this.get<{ webhooks: IndexerWebhook[] }>("/v1/webhooks", opts);
    return body.webhooks;
  }

  async deleteWebhook(id: string, opts?: RequestOptions): Promise<void> {
    return this.request(opts, async (init) => {
      const res = await this.fetchImpl(`${this.base}/v1/webhooks/${encodeURIComponent(id)}`, {
        ...init,
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        let message = `${res.status}`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          // keep status as the message
        }
        throw new IndexerError(res.status, message);
      }
    });
  }

  /**
   * Fires a synthetic test payload (`event_type: "test"`) at a registered
   * webhook, so a receiver can be checked without waiting for a real event.
   * Resolves with the status the receiver answered; a receiver that answers
   * 500 is still a resolved call, so check `status`. Rejects with an
   * {@link IndexerError}: 404 for an unknown webhook or an indexer without this
   * endpoint, 429 when the webhook was tested in the last minute.
   */
  async testWebhook(id: string, opts?: RequestOptions): Promise<IndexerWebhookTestResult> {
    return this.post<IndexerWebhookTestResult>("/v1/webhooks/test", { id }, opts);
  }

  /**
   * Classify coverage status for many assets in one call.
   *
   * The indexer has no batch endpoint, so this fans out to `getAsset` in
   * parallel and returns the status for each SAC address. When an asset is
   * not found or the request fails, its entry is `"unknown"`.
   *
   * @param assets - SAC addresses to check
   * @param maxAgeSeconds - passed to `coverageStatus`; defaults to
   *   `DEFAULT_MAX_AGE_SECONDS`
   * @param opts - per-request options applied to every sub-request
   *
   * @example
   * ```ts
   * const statuses = await indexer.batchCoverageStatus(
   *   [pusdSac, usdcSac],
   *   { maxAgeSeconds: 7 * 24 * 3600 },
   * );
   * console.log(statuses.get(pusdSac)); // "covered" | "under" | "stale" | "unknown"
   * ```
   */
  async batchCoverageStatus(
    assets: string[],
    opts?: RequestOptions & { maxAgeSeconds?: number },
  ): Promise<Map<string, IndexerCoverageStatus>> {
    const { maxAgeSeconds, ...reqOpts } = opts ?? {};
    const results = await Promise.allSettled(assets.map((sac) => this.getAsset(sac, 1, reqOpts)));
    const out = new Map<string, IndexerCoverageStatus>();
    for (let i = 0; i < assets.length; i++) {
      const sac = assets[i]!;
      const result = results[i]!;
      if (result.status === "rejected") {
        out.set(sac, "unknown");
        continue;
      }
      const c = result.value.coverage;
      if (!c) {
        out.set(sac, "unknown");
        continue;
      }
      const status = indexerCoverageStatus(
        c.bps,
        { report: c.report_age_seconds, supply: c.supply_age_seconds },
        maxAgeSeconds,
      );
      out.set(sac, status);
    }
    return out;
  }

  /** Raw breakdown bytes, exactly as hashed on-chain. */
  async breakdown(hash: string, opts?: RequestOptions): Promise<Uint8Array> {
    return this.request(opts, async (init) => {
      const res = await this.fetchImpl(
        `${this.base}/v1/breakdowns/${encodeURIComponent(hash)}`,
        init,
      );
      if (!res.ok) throw new IndexerError(res.status, `breakdown ${hash}: ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    });
  }

  private post<T>(path: string, body: unknown, opts?: RequestOptions): Promise<T> {
    return this.request(opts, async (init) => {
      const res = await this.fetchImpl(`${this.base}${path}`, {
        ...init,
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let message = `${res.status}`;
        try {
          const errBody = (await res.json()) as { error?: string };
          if (errBody.error) message = errBody.error;
        } catch {
          // keep status as the message
        }
        throw new IndexerError(res.status, message);
      }
      return (await res.json()) as T;
    });
  }

  private get<T>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request(opts, async (init) => {
      const res = await this.fetchImpl(`${this.base}${path}`, {
        ...init,
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        let message = `${res.status}`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          // keep status as the message
        }
        throw new IndexerError(res.status, message);
      }
      return (await res.json()) as T;
    });
  }

  /** Runs one request under the caller signal and timeout; no timeout unless set. */
  private async request<T>(
    opts: RequestOptions | undefined,
    run: (init: RequestInit) => Promise<T>,
  ): Promise<T> {
    const timeoutMs = opts?.timeoutMs ?? this.defaultTimeoutMs;
    const external = opts?.signal;
    if (timeoutMs === undefined && !external) return run({});
    const ctl = new AbortController();
    let reason = "aborted" as "aborted" | "timeout";
    const onAbort = () => ctl.abort();
    if (external?.aborted) ctl.abort();
    external?.addEventListener("abort", onAbort);
    const timer =
      timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            reason = "timeout";
            ctl.abort();
          }, timeoutMs);
    try {
      if (ctl.signal.aborted) throw new IndexerAbortError("aborted", "request aborted");
      return await run({ signal: ctl.signal });
    } catch (err) {
      if (ctl.signal.aborted) {
        throw new IndexerAbortError(
          reason,
          reason === "timeout" ? `request timed out after ${timeoutMs}ms` : "request aborted",
        );
      }
      throw err;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      external?.removeEventListener("abort", onAbort);
    }
  }
}
