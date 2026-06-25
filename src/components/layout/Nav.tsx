import { Logo } from "../primitives/Logo";
import type { Page } from "../../types";

export function Nav({
  page,
  dark,
  onNav,
  onToggleDark,
}: {
  page: Page;
  dark: boolean;
  onNav: (p: Page) => void;
  onToggleDark: () => void;
}) {
  const links: { label: string; id: Page }[] = [
    { label: "Projects", id: "projects" },
    { label: "Blog", id: "blog" },
    { label: "Reviews", id: "reviews" },
    { label: "About", id: "about" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
      <nav className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Logo onClick={() => onNav("home")} />
        <div className="flex items-center gap-5">
          {links.map((l) => (
            <button
              key={l.id}
              onClick={() => onNav(l.id)}
              className={`text-[13px] font-mono transition-colors cursor-pointer ${
                page === l.id
                  ? "text-primary border-b-2 border-primary pb-0.5"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {l.label}
            </button>
          ))}
          <button
            onClick={onToggleDark}
            className={`w-11 h-6 rounded-full relative transition-colors flex-shrink-0 cursor-pointer ${
              dark ? "bg-primary" : "bg-[#d9d2c2]"
            }`}
            aria-label="Toggle dark mode"
          >
            <div
              className={`absolute top-1 w-4 h-4 rounded-full transition-all ${
                dark ? "right-1 bg-[#12151f]" : "left-1 bg-white"
              }`}
            />
          </button>
        </div>
      </nav>
    </header>
  );
}
