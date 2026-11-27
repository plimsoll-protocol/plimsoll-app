export const COMMENT_MARKER: string;

export interface SizeLimitEntry {
  name: string;
  size: number;
  sizeLimit?: number;
  passed?: boolean;
}

export function formatBytes(bytes: number): string;
export function parseResults(text: string): SizeLimitEntry[] | null;
export function allPassed(results: SizeLimitEntry[] | null): boolean;
export function renderReport(results: SizeLimitEntry[] | null): string;
