/** The Plimsoll mark: a ring crossed by the load line. */
export function PlimsollMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="11" fill="none" stroke="var(--brand)" strokeWidth="3" />
      <rect x="1" y="14.5" width="30" height="3" rx="1.5" fill="var(--mark)" />
    </svg>
  );
}
