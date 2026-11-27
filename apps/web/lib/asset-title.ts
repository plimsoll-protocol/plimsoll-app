import { bpsToPercent, type CoverageStatus } from "@plimsoll/sdk";

type DocumentTitle = Pick<Document, "title">;

export function formatAssetTitle(
  symbol: string,
  bps: number | undefined,
  status: CoverageStatus,
): string | null {
  if (!symbol.trim() || bps === undefined || status === "unknown") return null;
  const percentage = bpsToPercent(bps);
  if (percentage === null) return null;
  return status === "covered" ? `${symbol} — Covered (${percentage})` : `${symbol} — Uncovered`;
}

export class AssetTitleManager {
  private readonly originalTitle: string;
  private appliedTitle: string | null = null;

  constructor(private readonly target: DocumentTitle) {
    this.originalTitle = target.title;
  }

  update(title: string | null): void {
    if (title === null) {
      this.restoreAppliedTitle();
      return;
    }
    if (this.target.title !== title) this.target.title = title;
    this.appliedTitle = title;
  }

  restore(): void {
    this.restoreAppliedTitle();
  }

  private restoreAppliedTitle(): void {
    if (this.appliedTitle !== null && this.target.title === this.appliedTitle) {
      this.target.title = this.originalTitle;
    }
    this.appliedTitle = null;
  }
}
