"use client";

import type { ModuleInterface } from "@creit.tech/stellar-wallets-kit/types";
import { config } from "./config";

/**
 * Wallet access for the static app.
 *
 * Everything goes through Stellar Wallets Kit so Freighter, xBull, Albedo,
 * Lobstr and Hana behave the same way. The public surface stays exactly what
 * the pages already use: `connectWallet()` returns an address and `signXdr()`
 * returns a signed envelope.
 */

export class WalletError extends Error {
  override name = "WalletError";
}

type Kit = typeof import("@creit.tech/stellar-wallets-kit/sdk").StellarWalletsKit;

interface WalletOption {
  id: string;
  name: string;
  hint: string;
  installUrl: string;
  module: ModuleInterface;
  available: boolean;
}

interface Connection {
  address: string;
  name: string;
  module: ModuleInterface;
}

let kit: Kit | null = null;
let kitPromise: Promise<{ kit: Kit; options: WalletOption[] }> | null = null;
let connection: Connection | null = null;
let connecting: Promise<string> | null = null;

/**
 * The wallets Plimsoll offers. Freighter is exposed by the kit under its new
 * Varial module; the ID is stable, so it is read from the module itself.
 */
async function loadKit(): Promise<{ kit: Kit; options: WalletOption[] }> {
  const [sdk, varial, xbull, albedo, lobstr, hana] = await Promise.all([
    import("@creit.tech/stellar-wallets-kit/sdk"),
    import("@creit.tech/stellar-wallets-kit/modules/varial"),
    import("@creit.tech/stellar-wallets-kit/modules/xbull"),
    import("@creit.tech/stellar-wallets-kit/modules/albedo"),
    import("@creit.tech/stellar-wallets-kit/modules/lobstr"),
    import("@creit.tech/stellar-wallets-kit/modules/hana"),
  ]);

  const definitions: Array<{
    name: string;
    hint: string;
    installUrl: string;
    module: ModuleInterface;
  }> = [
    {
      name: "Freighter",
      hint: "Browser extension",
      installUrl: "https://www.freighter.app/",
      module: new varial.VarialModule() as ModuleInterface,
    },
    {
      name: "xBull",
      hint: "Extension or web wallet",
      installUrl: "https://xbull.app/",
      module: new xbull.xBullModule() as ModuleInterface,
    },
    {
      name: "Albedo",
      hint: "Web wallet, no install",
      installUrl: "https://albedo.link/",
      module: new albedo.AlbedoModule() as ModuleInterface,
    },
    {
      name: "Lobstr",
      hint: "Browser extension",
      installUrl: "https://lobstr.co/",
      module: new lobstr.LobstrModule() as ModuleInterface,
    },
    {
      name: "Hana",
      hint: "Browser extension",
      installUrl: "https://hanawallet.io/",
      module: new hana.HanaModule() as ModuleInterface,
    },
  ];

  // Ledger hardware wallet: requires WebUSB or WebHID; silently skipped when
  // the browser or OS does not expose the transport.
  const ledgerResult = await import("@creit.tech/stellar-wallets-kit/modules/ledger").catch(
    () => null,
  );
  if (ledgerResult) {
    try {
      const { LedgerModule } = ledgerResult as {
        LedgerModule: new () => ModuleInterface;
      };
      definitions.push({
        name: "Ledger",
        hint: "Hardware wallet via USB/HID",
        installUrl: "https://www.ledger.com/",
        module: new LedgerModule(),
      });
    } catch {
      // Transport not available in this browser/OS — skip silently.
    }
  }

  const options = await Promise.all(
    definitions.map(async (definition) => ({
      ...definition,
      id: definition.module.productId,
      available: await definition.module.isAvailable().catch(() => false),
    })),
  );

  sdk.StellarWalletsKit.init({ modules: options.map((option) => option.module) });
  kit = sdk.StellarWalletsKit;
  return { kit, options };
}

function ensureKit(): Promise<{ kit: Kit; options: WalletOption[] }> {
  if (!kitPromise) {
    kitPromise = loadKit().catch((error: unknown) => {
      kitPromise = null;
      throw error;
    });
  }
  return kitPromise;
}

export function connectedWalletAddress(): string | null {
  return connection?.address ?? null;
}

/** Ask the user which wallet to use, then connect it. */
export function connectWallet(chooseAnother = false): Promise<string> {
  if (!connecting) {
    connecting = connectOnce(chooseAnother).finally(() => {
      connecting = null;
    });
  }
  return connecting;
}

async function connectOnce(chooseAnother: boolean): Promise<string> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new WalletError("Wallets can only be connected in a browser.");
  }

  const { kit: wallets, options } = await ensureKit();

  if (connection && !chooseAnother) {
    const mismatch = await checkNetwork(connection.module, connection.name);
    if (mismatch) {
      await wallets.disconnect().catch(() => undefined);
      connection = null;
      throw mismatch;
    }
    return connection.address;
  }

  const choice = await pickWallet(options);
  if (!choice) throw new WalletError("No wallet was connected.");

  if (connection) {
    await wallets.disconnect();
    connection = null;
  }

  try {
    wallets.setWallet(choice.id);
    const { address } = await wallets.fetchAddress();
    const mismatch = await checkNetwork(choice.module, choice.name);
    if (mismatch) throw mismatch;
    connection = { address, name: choice.name, module: choice.module };
    return address;
  } catch (error) {
    await wallets.disconnect().catch(() => undefined);
    throw toWalletError(error, `${choice.name} could not connect.`);
  }
}

export async function signXdr(xdr: string, address: string): Promise<string> {
  if (!kit || !connection) throw new WalletError("Connect a wallet before signing.");

  try {
    const mismatch = await checkNetwork(connection.module, connection.name);
    if (mismatch) throw mismatch;

    const result = await kit.signTransaction(xdr, {
      networkPassphrase: config.network.networkPassphrase,
      address,
    });
    if (!result?.signedTxXdr) throw new WalletError("Signing was cancelled.");
    return result.signedTxXdr;
  } catch (error) {
    throw toWalletError(error, "Signing was cancelled.");
  }
}

/**
 * Wallets that expose their selected network are checked before connecting and
 * before signing, so a wallet left on mainnet explains itself instead of
 * producing an envelope the network rejects. xBull, Albedo, Lobstr and Hana do
 * not implement `getNetwork`; for those the wallet's own signing prompt is the
 * only network gate, and Plimsoll keeps the expected passphrase in every
 * signing request.
 */
async function checkNetwork(
  module: ModuleInterface,
  walletName: string,
): Promise<WalletError | null> {
  try {
    const network = await module.getNetwork();
    const message = networkMismatchMessage(network, walletName);
    return message ? new WalletError(message) : null;
  } catch {
    return null;
  }
}

/** Human-readable mismatch text, or null when the passphrases agree. */
export function networkMismatchMessage(
  actual: { network?: string; networkPassphrase?: string },
  walletName: string,
): string | null {
  if (!actual.networkPassphrase || actual.networkPassphrase === config.network.networkPassphrase) {
    return null;
  }

  const expected = config.networkName || "the configured network";
  const found = actual.network?.trim();
  if (found && found.toLowerCase() === expected.toLowerCase()) {
    return `${walletName} is on a network called ${found}, but with a different network passphrase. Switch ${walletName} to ${expected} and reconnect.`;
  }
  return `${walletName} is on ${found || "a different network"}, but Plimsoll signs on ${expected}. Switch ${walletName} to ${expected} and reconnect.`;
}

function toWalletError(error: unknown, fallback: string): WalletError {
  if (error instanceof WalletError) return error;
  return new WalletError(messageOf(error) ?? fallback);
}

function messageOf(error: unknown): string | undefined {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return undefined;
}

/**
 * A native modal <dialog>, so the browser supplies the focus trap, Escape
 * handling and focus restoration. Every wallet is a real button; unavailable
 * wallets are disabled and link to their install page instead.
 */
function pickWallet(options: WalletOption[]): Promise<WalletOption | null> {
  return new Promise((resolve) => {
    const returnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = document.createElement("dialog");
    dialog.className = "wallet-dialog";
    dialog.setAttribute("aria-labelledby", "wallet-dialog-title");
    dialog.setAttribute("aria-describedby", "wallet-dialog-note");

    const head = document.createElement("div");
    head.className = "wallet-dialog-head";

    const title = document.createElement("h2");
    title.id = "wallet-dialog-title";
    title.textContent = "Connect a wallet";

    const close = document.createElement("button");
    close.type = "button";
    close.className = "wallet-dialog-close";
    close.textContent = "Close";

    head.append(title, close);

    const body = document.createElement("div");
    body.className = "wallet-dialog-body";

    const note = document.createElement("p");
    note.id = "wallet-dialog-note";
    note.className = "sub";
    note.textContent = `Plimsoll signs on ${config.networkName}. Choose a wallet; you will approve the connection in it.`;

    const list = document.createElement("ul");
    list.className = "wallet-list";

    let firstEnabled: HTMLButtonElement | null = null;

    for (const option of options) {
      const row = document.createElement("li");
      row.className = "wallet-row";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "wallet-option";
      button.disabled = !option.available;
      if (option.available && !firstEnabled) firstEnabled = button;
      button.addEventListener("click", () => finish(option));

      const badge = document.createElement("span");
      badge.className = "wallet-badge";
      badge.setAttribute("aria-hidden", "true");
      badge.textContent = option.name.slice(0, 2);

      const copy = document.createElement("span");
      copy.className = "wallet-copy";
      const name = document.createElement("span");
      name.className = "wallet-name";
      name.textContent = option.name;
      const hint = document.createElement("span");
      hint.className = "wallet-hint";
      hint.textContent = option.hint;
      copy.append(name, hint);

      const state = document.createElement("span");
      state.className = "wallet-state";
      state.textContent = option.available ? "Detected" : "Not installed";

      button.append(badge, copy, state);
      row.append(button);

      if (!option.available) {
        const install = document.createElement("a");
        install.className = "wallet-install";
        install.href = option.installUrl;
        install.target = "_blank";
        install.rel = "noreferrer";
        install.textContent = `Install ${option.name}`;
        row.append(install);
      }

      list.append(row);
    }

    body.append(note, list);

    const foot = document.createElement("p");
    foot.className = "sub wallet-dialog-foot";
    foot.textContent =
      "Freighter, xBull, Albedo, Lobstr, Hana and Ledger hardware wallets are supported. Plimsoll never sees your keys; you approve every signature in the wallet.";
    body.append(foot);

    dialog.append(head, body);

    let settled = false;

    function cleanup() {
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("click", onBackdrop);
      dialog.removeEventListener("close", onClose);
      document.documentElement.classList.remove("wallet-dialog-open");
      dialog.remove();
      returnFocus?.focus();
    }

    function finish(choice: WalletOption | null) {
      if (settled) return;
      settled = true;
      dialog.close();
      cleanup();
      resolve(choice);
    }

    function onCancel(event: Event) {
      event.preventDefault();
      finish(null);
    }

    function onBackdrop(event: MouseEvent) {
      if (event.target === dialog) finish(null);
    }

    function onClose() {
      finish(null);
    }

    close.addEventListener("click", () => finish(null));
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("click", onBackdrop);
    dialog.addEventListener("close", onClose);

    document.body.append(dialog);
    document.documentElement.classList.add("wallet-dialog-open");
    dialog.showModal();
    (firstEnabled ?? close).focus();
  });
}
