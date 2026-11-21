/**
 * Mainnet assets shown on the watch page. Each is listed by its issuer
 * account; the page checks the issuer's own stellar.toml live.
 * Chosen for having the issuer account that holds nearly all real holders
 * (Horizon, 5 Oct 2026); look-alike issuers with the same code are excluded.
 */
export interface WatchedAsset {
  code: string;
  issuer: string;
  label: string;
  kind: "Stablecoin" | "Tokenized fund" | "Custom";
}

export const MAINNET_HORIZON = "https://horizon.stellar.org";
export const MAINNET_EXPLORER = "https://stellar.expert/explorer/public";

export const WATCHED: WatchedAsset[] = [
  {
    code: "USDC",
    issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    label: "Circle",
    kind: "Stablecoin",
  },
  {
    code: "EURC",
    issuer: "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2",
    label: "Circle",
    kind: "Stablecoin",
  },
  {
    code: "PYUSD",
    issuer: "GDQE7IXJ4HUHV6RQHIUPRJSEZE4DRS5WY577O2FY6YQ5LVWZ7JZTU2V5",
    label: "Paxos",
    kind: "Stablecoin",
  },
  {
    code: "USDGLO",
    issuer: "GBBS25EGYQPGEZCGCFBKG4OAGFXU6DSOQBGTHELLJT3HZXZJ34HWS6XV",
    label: "Glo Dollar",
    kind: "Stablecoin",
  },
  {
    code: "BENJI",
    issuer: "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5",
    label: "Franklin Templeton",
    kind: "Tokenized fund",
  },
];
