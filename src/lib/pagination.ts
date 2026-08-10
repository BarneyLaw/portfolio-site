// ── Pagination ───────────────────────────────────────────────────────────
// Splits an ordered list into shareable pages. Deliberately not Astro's
// paginate(): that helper wants to own the route, and /blog/[slug] already
// claims the single-segment space under /blog, so paged URLs live at
// /blog/page/N instead. Keeping the maths here means the page components stay
// presentational and the same helper can serve projects or reviews later.
//
// Every page is a real static route. There is no client-side paging.

export interface Page<T> {
  /** Items on this page, in the order they were given. */
  items: T[];
  /** 1-based page number. */
  number: number;
  /** How many pages exist in total. Always at least 1. */
  total: number;
  /** This page's own path. */
  path: string;
  /** Absent on the first page rather than rendered as a dead control. */
  prev?: string;
  /** Absent on the last page. */
  next?: string;
}

export interface PaginateOptions {
  /** Items per page. Must be at least 1. */
  pageSize: number;
  /** Maps a 1-based page number to its route. */
  pathFor: (pageNumber: number) => string;
}

/**
 * An empty input still yields one (empty) page, so a list route always exists
 * and never 404s just because nothing is published yet.
 */
export function paginate<T>(items: readonly T[], options: PaginateOptions): Page<T>[] {
  const { pageSize, pathFor } = options;
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new RangeError(`pageSize must be a positive integer, got ${pageSize}`);
  }

  const total = Math.max(1, Math.ceil(items.length / pageSize));

  return Array.from({ length: total }, (_, index) => {
    const number = index + 1;
    return {
      items: items.slice(index * pageSize, (index + 1) * pageSize),
      number,
      total,
      path: pathFor(number),
      prev: number > 1 ? pathFor(number - 1) : undefined,
      next: number < total ? pathFor(number + 1) : undefined,
    };
  });
}

/** Blog list settings, shared by /blog and /blog/page/[page]. */
export const BLOG_PAGE_SIZE = 6;

/** Page 1 is /blog itself; later pages get their own path. Keeping page 1 at
    the bare /blog means the canonical list URL never changes. */
export const blogPagePath = (pageNumber: number): string =>
  pageNumber <= 1 ? "/blog" : `/blog/page/${pageNumber}`;
