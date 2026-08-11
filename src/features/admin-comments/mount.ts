// ── Comment moderation UI ────────────────────────────────────────────────
// Loaded by src/pages/admin/[page].astro. Reachable only in an ADMIN_UI build,
// which is served exclusively from the Cloudflare Access-protected hostname.
//
// Nothing in here authenticates anything — see the header of src/lib/admin.ts.
// A request either carries the Access cookie the browser already holds, or it
// gets a 401 that this file reports honestly. There is no login form to render
// because there is no login endpoint to call.
//
// Comment bodies and author names are attacker-supplied and are shown here in
// full, including ones already hidden for being abusive. They are only ever
// written with textContent.

import { ApiError } from "../../lib/api";
import { listModerationComments, setCommentHidden } from "../../lib/admin";
import type { CommentStatus, ModerationComment } from "../../lib/api-contract";

const BTN =
  "text-[12px] font-mono px-2 py-1 rounded border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
const BTN_QUIET = "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground";
const FILTER_ON = "bg-primary text-white border-primary";
const FILTER_OFF = BTN_QUIET;

const timestamp = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

/** What a reader should be told when a moderation call fails. */
function messageFor(error: unknown): string {
  if (!(error instanceof ApiError)) return "Something went wrong.";
  switch (error.kind) {
    case "timeout":
      return "That took too long. Try again.";
    case "network":
      return "Could not reach the API.";
    case "malformed":
      return "The API sent something unexpected.";
    case "http":
      if (error.status === 401) {
        // Access sits in front of this hostname, so a 401 means the session
        // expired rather than that the user is unknown. Reloading re-enters
        // Cloudflare's identity flow — there is nothing to log into here.
        return "Your Cloudflare Access session has expired. Reload the page to sign in again.";
      }
      if (error.status === 409) {
        return "Restoring this comment would exceed the post's visible-comment cap.";
      }
      if (error.status === 404) return "That comment no longer exists.";
      if (error.status >= 500) return "The API is having trouble. Try again shortly.";
      return error.detail ?? "That request was rejected.";
  }
}

export function mountAdminComments(root: HTMLElement): () => void {
  const statusEl = root.querySelector<HTMLElement>("[data-admin-status]");
  const listEl = root.querySelector<HTMLElement>("[data-admin-list]");
  const filtersEl = root.querySelector<HTMLElement>("[data-admin-filters]");
  const actionsEl = root.querySelector<HTMLElement>("[data-admin-actions]");
  if (!statusEl || !listEl || !filtersEl || !actionsEl) return () => {};

  const controller = new AbortController();
  let filter: CommentStatus | undefined;
  let cursor: number | null = null;
  let loading = false;

  const setStatus = (text: string) => {
    statusEl.textContent = text;
  };

  const row = (comment: ModerationComment): HTMLElement => {
    const item = el("li", {
      class: "bg-card border border-border rounded p-3",
      "data-comment-id": String(comment.id),
    });

    const head = el("div", { class: "flex items-baseline gap-2 flex-wrap mb-1.5" });

    const author = el("span", { class: "font-bold font-mono text-[14px] text-foreground" });
    author.textContent = comment.author_name; // untrusted

    const slug = el("a", {
      href: `/blog/${comment.post_slug}`,
      class: "text-[12px] font-mono text-primary hover:underline",
    });
    slug.textContent = comment.post_slug; // untrusted, so never interpolated into markup

    const when = el("time", {
      datetime: comment.created_at,
      class: "text-[12px] font-mono text-muted-foreground",
    });
    when.textContent = timestamp.format(new Date(comment.created_at));

    const state = el(
      "span",
      {
        class:
          comment.status === "hidden"
            ? "text-[11px] font-mono px-1.5 py-0.5 rounded bg-destructive text-white"
            : "text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground",
      },
      // Status is spelled out, not carried by colour alone.
      comment.status,
    );

    head.append(author, slug, when, state);

    const body = el("p", {
      class:
        "text-[14px] font-mono text-foreground/80 leading-relaxed whitespace-pre-wrap break-words",
    });
    body.textContent = comment.body; // untrusted — the whole reason for textContent

    const toggle = el("button", { type: "button", class: `${BTN} ${BTN_QUIET} mt-2` });
    const rowStatus = el("span", {
      class: "block text-[12px] font-mono text-destructive mt-1",
      role: "status",
      "aria-live": "polite",
    });

    let current = comment;
    const paintToggle = () => {
      toggle.textContent = current.status === "hidden" ? "unhide" : "hide";
      toggle.setAttribute(
        "aria-label",
        `${current.status === "hidden" ? "Unhide" : "Hide"} comment ${current.id} by ${current.author_name}`,
      );
      state.textContent = current.status;
      state.className =
        current.status === "hidden"
          ? "text-[11px] font-mono px-1.5 py-0.5 rounded bg-destructive text-white"
          : "text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground";
    };
    paintToggle();

    toggle.addEventListener("click", async () => {
      toggle.disabled = true;
      rowStatus.textContent = "";
      try {
        // The server returns the comment it actually recorded, so the row
        // reflects real state rather than an optimistic guess. Hiding is a
        // moderation decision — showing it as done when it is not would be
        // worse than a moment's delay.
        current = await setCommentHidden(current.id, current.status !== "hidden", controller.signal);
        paintToggle();
        // Drop the row when it no longer matches the active filter.
        if (filter && current.status !== filter) item.remove();
      } catch (error) {
        if (controller.signal.aborted) return;
        rowStatus.textContent = messageFor(error);
      } finally {
        toggle.disabled = false;
      }
    });

    item.append(head, body, toggle, rowStatus);
    return item;
  };

  const loadMore = el("button", { type: "button", class: `${BTN} ${BTN_QUIET}` }, "Load older");

  const loadPage = async (reset = false): Promise<void> => {
    if (loading) return;
    loading = true;
    loadMore.disabled = true;
    if (reset) {
      listEl.replaceChildren();
      cursor = null;
      loadMore.remove();
    }
    setStatus("Loading…");

    try {
      const page = await listModerationComments({
        status: filter,
        beforeId: cursor ?? undefined,
        signal: controller.signal,
      });
      for (const comment of page.comments) listEl.append(row(comment));
      cursor = page.next_before_id;

      setStatus(listEl.childElementCount === 0 ? "No comments match this filter." : "");
      if (cursor === null) loadMore.remove();
      else actionsEl.append(loadMore);
    } catch (error) {
      if (controller.signal.aborted) return;
      setStatus(messageFor(error));
    } finally {
      loading = false;
      loadMore.disabled = false;
    }
  };

  loadMore.addEventListener("click", () => void loadPage());

  // ── Filters ────────────────────────────────────────────────────────────
  const filters: { label: string; value: CommentStatus | undefined }[] = [
    { label: "all", value: undefined },
    { label: "visible", value: "visible" },
    { label: "hidden", value: "hidden" },
  ];

  const buttons = filters.map(({ label, value }) => {
    const button = el("button", { type: "button", class: `${BTN} ${FILTER_OFF}` }, label);
    button.setAttribute("aria-pressed", String(value === filter));
    button.addEventListener("click", () => {
      filter = value;
      for (const [index, other] of buttons.entries()) {
        const active = filters[index]!.value === filter;
        other.className = `${BTN} ${active ? FILTER_ON : FILTER_OFF}`;
        other.setAttribute("aria-pressed", String(active));
      }
      void loadPage(true);
    });
    return button;
  });
  buttons[0]!.className = `${BTN} ${FILTER_ON}`;
  buttons[0]!.setAttribute("aria-pressed", "true");
  filtersEl.append(...buttons);

  void loadPage();

  const dispose = () => controller.abort();
  window.addEventListener("pagehide", dispose, { once: true });
  return dispose;
}
