export interface ThemeRoot {
  dataset: {
    theme?: string;
  };
}

export function toggleTheme(root: ThemeRoot, prefersDark: boolean): "dark" | "light" {
  const current = root.dataset.theme ?? (prefersDark ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  return next;
}
