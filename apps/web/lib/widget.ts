import { StrKey } from "@stellar/stellar-sdk";

export const MAX_WIDGET_ASSETS = 20;

export interface WidgetAssetParams {
  assets: string[];
  invalidCount: number;
  overflowCount: number;
}

export function parseWidgetAssets(values: readonly string[]): WidgetAssetParams {
  const unique = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  const assets = unique.filter((value) => StrKey.isValidContract(value));
  return {
    assets: assets.slice(0, MAX_WIDGET_ASSETS),
    invalidCount: unique.length - assets.length,
    overflowCount: Math.max(0, assets.length - MAX_WIDGET_ASSETS),
  };
}
