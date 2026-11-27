import Link from "next/link";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * A trail back up the site hierarchy. The last crumb is the current page and is
 * never a link. On narrow screens the middle levels collapse behind an ellipsis
 * so the trail still fits next to long asset codes.
 */
export function Breadcrumb({ items }: { items: readonly Crumb[] }) {
  const last = items.length - 1;
  const crumb = (item: Crumb, i: number) => {
    const current = i === last;
    return (
      <li key={`${item.label}-${i}`} data-middle={!current && i > 0 ? "true" : undefined}>
        {current ? (
          <span aria-current="page">{item.label}</span>
        ) : item.href ? (
          <Link href={item.href}>{item.label}</Link>
        ) : (
          <span>{item.label}</span>
        )}
      </li>
    );
  };

  const [root, ...rest] = items;
  return (
    <nav aria-label="breadcrumb" className="breadcrumbs">
      <ol>
        {root ? crumb(root, 0) : null}
        {items.length > 2 ? (
          <li className="crumb-gap" aria-hidden="true">
            …
          </li>
        ) : null}
        {rest.map((item, i) => crumb(item, i + 1))}
      </ol>
    </nav>
  );
}
