import type { IndexerClient, PlimsollContracts } from "@plimsoll/sdk";
import type { AppConfig } from "./config";

export interface SdkCallResult {
  client: "contracts" | "indexer";
  method: string;
  args: unknown[];
  response?: unknown;
  error?: unknown;
}

export interface PlimsollDebugObject {
  sdk: {
    contracts: PlimsollContracts;
    indexer: IndexerClient | null;
  };
  config: AppConfig;
  lastResponse: SdkCallResult | null;
}

declare global {
  interface Window {
    __plimsoll__?: PlimsollDebugObject;
  }
}

function recordCall(result: SdkCallResult): void {
  if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
    const debug = window.__plimsoll__;
    if (debug) debug.lastResponse = result;
  }
}

export function trackSdkCalls<T extends object>(
  client: T,
  clientName: SdkCallResult["client"],
): T {
  if (process.env.NODE_ENV !== "development") return client;

  return new Proxy(client, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;

      return new Proxy(value, {
        apply(method, _thisArg, args: unknown[]) {
          const call = { client: clientName, method: String(property), args };
          const response: unknown = Reflect.apply(method, target, args);

          if (
            response !== null &&
            (typeof response === "object" || typeof response === "function") &&
            "then" in response &&
            typeof response.then === "function"
          ) {
            return Promise.resolve(response).then(
              (resolved: unknown) => {
                recordCall({ ...call, response: resolved });
                return resolved;
              },
              (error: unknown) => {
                recordCall({ ...call, error });
                throw error;
              },
            );
          }

          recordCall({ ...call, response });
          return response;
        },
      });
    },
  });
}

export function exposePlimsollDebug(
  sdk: PlimsollDebugObject["sdk"],
  config: AppConfig,
): void {
  if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
    window.__plimsoll__ = { sdk, config, lastResponse: null };
  }
}
