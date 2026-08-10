// ── Comment section ──────────────────────────────────────────────────────
// Loaded on demand by src/components/astro/Comments.astro when the section
// nears the viewport. Everything in here is optional: the article is already
// rendered and complete, and every failure path below degrades to a message
// inside this section without touching the rest of the page.
//
// ── Rendering rule ───────────────────────────────────────────────────────
// Comment text is untrusted input echoed back from the database. It is only
// ever written with textContent — never innerHTML, never insertAdjacentHTML,
// never a template string built into markup. That single rule is what keeps a
// stored XSS out of every reader's page, so keep it even where the value
// "obviously" cannot contain markup.

import { ApiError } from "../../lib/api";
import { LIMITS, validateComment, type Comment } from "../../lib/api-contract";
import { createComment, listComments } from "../../lib/comments";

/** Tailwind class strings live as literals so the content scanner sees them —
    see the content-scan gotcha in DEVELOPMENT.md. */
const FIELD =
  "w-full bg-input-background border border-border rounded px-3 py-2 font-mono text-[14px] text-foreground";
const LABEL = "block text-[13px] font-mono text-muted-foreground mb-1";
const BUTTON =
  "text-[13px] font-mono px-3 py-1.5 rounded cursor-pointer transition-colors bg-primary text-white disabled:opacity-50 disabled:cursor-not-allowed";
const GHOST_BUTTON =
  "text-[13px] font-mono px-3 py-1.5 rounded cursor-pointer transition-colors border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground";
const FIELD_ERROR = "text-[12px] font-mono text-destructive mt-1";

const dateFormat = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

/** Builds an element and sets text safely. */
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

/** One comment, as a list item. */
function renderComment(comment: Comment): HTMLLIElement {
  const item = el("li", {
    class: "bg-card border border-border rounded p-3",
    "data-comment-id": String(comment.id),
  });

  const header = el("div", { class: "flex items-baseline gap-2 mb-1.5 flex-wrap" });

  // Untrusted: the author picked this string.
  const author = el("span", { class: "font-bold font-mono text-[14px] text-foreground" });
  author.textContent = comment.author_name;

  const parsed = new Date(comment.created_at);
  const time = el("time", {
    datetime: comment.created_at,
    class: "text-[12px] font-mono text-muted-foreground",
  });
  time.textContent = dateFormat.format(parsed);

  header.append(author, time);

  // Untrusted, and the whole reason for the rendering rule above. Plain text
  // per the API contract; `whitespace-pre-wrap` preserves the author's line
  // breaks without interpreting anything as markup.
  const body = el("p", {
    class: "text-[14px] font-mono text-foreground/80 leading-relaxed whitespace-pre-wrap break-words",
  });
  body.textContent = comment.body;

  item.append(header, body);
  return item;
}

/** Turns any thrown value into something worth showing a reader. */
function messageFor(error: unknown): string {
  if (!(error instanceof ApiError)) return "Something went wrong.";
  switch (error.kind) {
    case "timeout":
      return "That took too long. Check your connection and try again.";
    case "network":
      return "Could not reach the server.";
    case "malformed":
      return "The server sent something unexpected.";
    case "http":
      if (error.status === 404) return "Comments are not available for this post.";
      if (error.status === 409) return "This post has reached its comment limit.";
      if (error.status === 413) return "That comment is too large to send.";
      if (error.status === 429) return "Too many comments too quickly. Try again shortly.";
      if (error.status >= 500) return "The server is having trouble. Try again shortly.";
      // error.detail is the server's message: untrusted, so it is only ever
      // assigned through textContent by the caller.
      return error.detail ?? "That request was rejected.";
  }
}

export function mountComments(section: HTMLElement): () => void {
  const slug = section.dataset.slug;
  const statusEl = section.querySelector<HTMLElement>("[data-comments-status]");
  const listEl = section.querySelector<HTMLOListElement>("[data-comments-list]");
  const actionsEl = section.querySelector<HTMLElement>("[data-comments-actions]");
  if (!slug || !statusEl || !listEl || !actionsEl) return () => {};

  // One controller for the section's lifetime: everything in flight is
  // cancelled together when the reader leaves.
  const controller = new AbortController();
  let cursor: number | null = null;
  let loading = false;
  let closed = false;

  const setStatus = (text: string) => {
    statusEl.textContent = text;
  };

  // ── Loading older pages ────────────────────────────────────────────────

  const loadMoreButton = el("button", { type: "button", class: GHOST_BUTTON }, "Load older comments");
  const retryButton = el("button", { type: "button", class: GHOST_BUTTON }, "Try again");

  // An arrow rather than a function declaration: declarations are hoisted, so
  // TypeScript will not carry the null guard above into their bodies.
  const loadPage = async (): Promise<void> => {
    if (loading || closed) return;
    loading = true;
    loadMoreButton.disabled = true;
    retryButton.remove();
    setStatus(listEl!.childElementCount === 0 ? "Loading comments…" : "Loading older comments…");

    try {
      const page = await listComments(slug, {
        beforeId: cursor ?? undefined,
        signal: controller.signal,
      });

      for (const comment of page.comments) listEl.append(renderComment(comment));
      cursor = page.next_before_id;

      setStatus(listEl.childElementCount === 0 ? "No comments yet. Be the first." : "");

      if (cursor === null) loadMoreButton.remove();
      else actionsEl.prepend(loadMoreButton);
    } catch (error) {
      if (controller.signal.aborted) return;
      setStatus(messageFor(error));
      // Only offer a retry for failures where retrying makes sense.
      if (!(error instanceof ApiError) || error.retryable) actionsEl.prepend(retryButton);
      // The post is not registered with the backend: there is nothing to load
      // and nothing to post to, so take the form away rather than let someone
      // write a comment that cannot land.
      if (error instanceof ApiError && error.status === 404) {
        closed = true;
        submit.disabled = true;
        form.hidden = true;
      }
    } finally {
      loading = false;
      loadMoreButton.disabled = false;
    }
  };

  loadMoreButton.addEventListener("click", () => void loadPage());
  retryButton.addEventListener("click", () => void loadPage());

  // ── The form ───────────────────────────────────────────────────────────

  const form = el("form", { class: "mt-6 flex flex-col gap-3", novalidate: "" });

  const nameWrap = el("div");
  const nameLabel = el("label", { class: LABEL, for: "comment-author" }, "Name");
  const nameInput = el("input", {
    id: "comment-author",
    name: "author_name",
    type: "text",
    class: FIELD,
    maxlength: String(LIMITS.authorNameMax),
    autocomplete: "nickname",
    required: "",
  });
  const nameError = el("p", { class: FIELD_ERROR, id: "comment-author-error", hidden: "" });
  nameWrap.append(nameLabel, nameInput, nameError);

  const bodyWrap = el("div");
  const bodyLabel = el("label", { class: LABEL, for: "comment-body" }, "Comment");
  const bodyInput = el("textarea", {
    id: "comment-body",
    name: "body",
    rows: "4",
    class: `${FIELD} resize-y`,
    maxlength: String(LIMITS.bodyMax),
    required: "",
  });
  const bodyError = el("p", { class: FIELD_ERROR, id: "comment-body-error", hidden: "" });
  bodyWrap.append(bodyLabel, bodyInput, bodyError);

  // Honeypot. Hidden from sight and from assistive tech, and skipped by Tab,
  // so no real person can fill it in; a bot filling every field will. The
  // server answers 204 and stores nothing. Not display:none — that is the
  // first thing a scripted submitter checks for.
  const trapWrap = el("div", {
    class: "absolute w-px h-px overflow-hidden",
    style: "left:-9999px",
    "aria-hidden": "true",
  });
  const trapInput = el("input", {
    id: "comment-website",
    type: "text",
    name: "website",
    tabindex: "-1",
    autocomplete: "off",
  });
  trapWrap.append(el("label", { for: "comment-website" }, "Website"), trapInput);

  const submit = el("button", { type: "submit", class: BUTTON }, "Post comment");
  const formStatus = el("p", {
    class: "text-[13px] font-mono text-muted-foreground",
    role: "status",
    "aria-live": "polite",
  });

  form.append(nameWrap, bodyWrap, trapWrap, submit, formStatus);

  const showFieldErrors = (errors: ReturnType<typeof validateComment>) => {
    for (const [input, errorEl, field] of [
      [nameInput, nameError, "author_name"],
      [bodyInput, bodyError, "body"],
    ] as const) {
      const found = errors.find((e) => e.field === field);
      if (found) {
        errorEl.textContent = found.message;
        errorEl.hidden = false;
        input.setAttribute("aria-invalid", "true");
        input.setAttribute("aria-describedby", errorEl.id);
      } else {
        errorEl.textContent = "";
        errorEl.hidden = true;
        input.removeAttribute("aria-invalid");
        input.removeAttribute("aria-describedby");
      }
    }
    // Move focus to the first problem so a keyboard user is taken to it
    // rather than left guessing why nothing happened.
    const first = errors[0];
    if (first) (first.field === "author_name" ? nameInput : bodyInput).focus();
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (closed) return;

    const input = {
      author_name: nameInput.value,
      body: bodyInput.value,
      website: trapInput.value,
    };

    const errors = validateComment(input);
    showFieldErrors(errors);
    if (errors.length > 0) {
      formStatus.textContent = "";
      return;
    }

    submit.disabled = true;
    formStatus.textContent = "Posting…";

    try {
      const created = await createComment(
        slug,
        {
          author_name: input.author_name.trim(),
          body: input.body.trim(),
          // Only sent when non-empty, so a normal submission carries no
          // pointless field.
          ...(input.website ? { website: input.website } : {}),
        },
        controller.signal,
      );

      // `null` means the server took the honeypot path and stored nothing.
      // The message is identical either way — telling a spammer their comment
      // was discarded is exactly how a honeypot stops working.
      if (created) listEl.prepend(renderComment(created));
      if (statusEl.textContent === "No comments yet. Be the first.") setStatus("");

      form.reset();
      formStatus.textContent = "Posted.";
    } catch (error) {
      if (controller.signal.aborted) return;
      formStatus.textContent = messageFor(error);
      if (error instanceof ApiError && (error.status === 409 || error.status === 404)) {
        // No amount of retrying will help; stop offering the form.
        closed = true;
        submit.disabled = true;
        return;
      }
    } finally {
      if (!closed) submit.disabled = false;
    }
  });

  actionsEl.append(form);
  void loadPage();

  // Cancel anything in flight if the section is torn down.
  const dispose = () => controller.abort();
  window.addEventListener("pagehide", dispose, { once: true });
  return dispose;
}
