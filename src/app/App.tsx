import React, { useState, useEffect } from "react";

type Page = "home" | "projects" | "blog" | "reviews" | "about";

// ─── sprite frames ─────────────────────────────────────────────────────────────
// Walk-cycle frames for the loading sprite, loaded + sorted piece_0 … piece_24.
const walkFrames = Object.entries(
  import.meta.glob(
    "../img/sprite_sheet/darjeeling_sprite_sheet/*.png",
    { eager: true, query: "?url", import: "default" },
  ) as Record<string, string>,
)
  .sort(([a], [b]) => {
    const n = (s: string) => Number(s.match(/piece_(\d+)/)?.[1] ?? 0);
    return n(a) - n(b);
  })
  .map(([, url]) => url);

// ─── data ────────────────────────────────────────────────────────────────────

const projects = [
  {
    id: "relic-overlay",
    name: "relic overlay",
    status: "SHIPPED",
    tags: ["Electron", "overlay", "market API"],
    meta: "Warframe · overlay",
    description:
      "A real-time market overlay for Warframe that pulls live relic pricing data and displays it on-screen while you play. Hooks into the Warframe.market API and a local game log watcher.",
    codeSnippet: "$ npm run dev\n▸ overlay listening on :9990\n▸ log watcher active",
  },
  {
    id: "k3s-cluster",
    name: "k3s cluster",
    status: "BUILDING",
    tags: ["k3s", "Kubernetes", "Ansible"],
    meta: "k3s · self-host",
    description:
      "Four-node bare-metal k3s cluster running at home on repurposed Intel NUCs. Provisioned with Ansible, serving this site and a handful of personal services behind Traefik.",
    codeSnippet: "$ kubectl get nodes\nNAME    STATUS   ROLES\nnuc-0   Ready    control-plane\nnuc-1   Ready    worker",
  },
  {
    id: "obsync",
    name: "obsync",
    status: "PLANNED",
    tags: ["Go", "Postgres"],
    meta: "Go · Postgres",
    description:
      "Self-hosted Obsidian sync server written in Go. The official sync product is fine but I'd rather own the infra. Will use Postgres for vault snapshots and conflict resolution.",
    codeSnippet: "// coming soon",
  },
  {
    id: "lan-drop",
    name: "lan-drop",
    status: "PLANNED",
    tags: ["C++", "networking"],
    meta: "C++ · hole-punch",
    description:
      "LAN-first file drop utility with UDP hole-punching fallback for cross-NAT transfers. Basically AirDrop but for Linux and with a CLI.",
    codeSnippet: "// coming soon",
  },
];

const blogPosts = [
  {
    id: 1,
    date: "2026-06-10",
    readTime: "8 min",
    category: "homelab",
    title: "Running k3s on four nodes: what I learned the hard way",
    excerpt:
      "After two failed attempts and one corrupted etcd, I finally have a stable bare-metal k3s cluster. Here's what actually works.",
    featured: true,
  },
  {
    id: 2,
    date: "2026-05-28",
    readTime: "5 min",
    category: "networking",
    title: "Dissecting my home network with nmap and Grafana",
    excerpt: "A weekend project that turned into a permanent dashboard.",
    featured: false,
  },
  {
    id: 3,
    date: "2026-05-12",
    readTime: "11 min",
    category: "homelab",
    title: "Self-hosting everything: six months in",
    excerpt:
      "The services I kept, the ones I dropped, and the one that nearly bricked my NAS.",
    featured: false,
  },
  {
    id: 4,
    date: "2026-04-30",
    readTime: "6 min",
    category: "go",
    title: "Writing a TCP connection pool in Go from scratch",
    excerpt:
      "Because I wanted to understand what database/sql is actually doing under the hood.",
    featured: false,
  },
];

const reviews = [
  {
    id: 1,
    type: "HARDWARE",
    verdict: "RECOMMENDED",
    name: "MikroTik RB5009UG+S+IN",
    date: "2026-06-01",
    excerpt:
      "The best sub-$200 router I've owned. RouterOS has a steep learning curve but the hardware is rock-solid and the feature set is absurd for the price.",
  },
  {
    id: 2,
    type: "SOFTWARE",
    verdict: "MIXED",
    name: "Tailscale",
    date: "2026-05-15",
    excerpt:
      "Great for what it is, but the free tier limits sting and I'd rather self-host Headscale. Setup was effortless though.",
  },
  {
    id: 3,
    type: "HARDWARE",
    verdict: "PASS",
    name: "TP-Link EAP670",
    date: "2026-04-20",
    excerpt:
      "Fine specs on paper but the Omada controller software is a mess and the hardware runs warm. Returned it after a week.",
  },
  {
    id: 4,
    type: "SOFTWARE",
    verdict: "RECOMMENDED",
    name: "Proxmox VE",
    date: "2026-03-10",
    excerpt:
      "The virtualization platform I should have switched to years ago. Web UI is functional, clustering works, and the community is excellent.",
  },
];

// ─── primitive components ──────────────────────────────────────────────────────

function Cursor({ large = false }: { large?: boolean }) {
  return (
    <span
      className={`inline-block bg-primary align-middle ml-1 ${
        large ? "w-3.5 h-[26px] -mb-[3px]" : "w-2 h-4 -mb-px"
      }`}
      style={{ animation: "blink 1s steps(1) infinite" }}
    />
  );
}

function LogoBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  const cls =
    size === "md"
      ? "w-11 h-11 rounded-lg text-[16px]"
      : "w-7 h-7 rounded-md text-[11px]";
  return (
    <div
      className={`${cls} bg-primary flex items-center justify-center font-bold font-mono text-white flex-shrink-0`}
    >
      &gt;_
    </div>
  );
}

function Logo({
  size = "sm",
  onClick,
}: {
  size?: "sm" | "md";
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
    >
      <LogoBadge size={size} />
      <div className="flex flex-col leading-[1.05]">
        <span
          className={`font-bold font-mono text-foreground ${
            size === "md" ? "text-[15px]" : "text-[13px]"
          }`}
        >
          packetcraft
        </span>
        <span
          className={`font-mono text-muted-foreground ${
            size === "md" ? "text-[10px]" : "text-[9px]"
          }`}
        >
          .dev
        </span>
      </div>
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    SHIPPED: "text-[#1b7f4b] bg-[#e3f3e9]",
    BUILDING: "text-[#9a6b1b] bg-[#f7eedd]",
    PLANNED: "text-[#5a5a6a] bg-[#ececf2]",
  };
  return (
    <span
      className={`text-[8px] font-bold font-mono px-1.5 py-0.5 rounded ${map[status] ?? map.PLANNED}`}
    >
      {status}
    </span>
  );
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const map: Record<string, string> = {
    RECOMMENDED: "bg-[#1b7f4b] text-white",
    MIXED: "bg-[#9a6b1b] text-white",
    PASS: "bg-[#8a2a2a] text-white",
  };
  return (
    <span
      className={`text-[9px] font-bold font-mono px-2 py-1 rounded ${map[verdict] ?? ""}`}
    >
      {verdict}
    </span>
  );
}

function Tag({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
        muted
          ? "text-[#7a6f55] border-[#c9bd9f]"
          : "text-primary border-primary"
      }`}
    >
      {children}
    </span>
  );
}

function Hatch({ className = "", label = "" }: { className?: string; label?: string }) {
  return (
    <div
      className={`flex items-center justify-center text-[9px] font-mono text-[#9a9a9a] rounded ${className}`}
      style={{
        background:
          "repeating-linear-gradient(45deg,#ececec,#ececec 7px,#f5f5f5 7px,#f5f5f5 14px)",
      }}
    >
      {label}
    </div>
  );
}

function TerminalSnippet({ code }: { code: string }) {
  return (
    <div className="bg-[#12151f] rounded-md p-3 font-mono text-[9px] leading-relaxed">
      {code.split("\n").map((line, i) => (
        <div key={i} className={i === 0 ? "text-[#8a93a6]" : "text-[#3b82f6]"}>
          {line || <>&nbsp;</>}
        </div>
      ))}
    </div>
  );
}

function SpriteWalker({ size = 44, fps = 10 }: { size?: number; fps?: number }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (walkFrames.length === 0) return;
    const id = setInterval(
      () => setFrame((f) => (f + 1) % walkFrames.length),
      1000 / fps,
    );
    return () => clearInterval(id);
  }, [fps]);

  if (walkFrames.length === 0) return null;
  return (
    <img
      src={walkFrames[frame]}
      alt="loading"
      width={size}
      height={size}
      className="flex-none object-contain"
      style={{ imageRendering: "pixelated" }}
    />
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function Nav({
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

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="bg-secondary border-t border-border">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid grid-cols-4 gap-6">
          <div>
            <Logo />
            <p className="text-[11px] font-mono text-muted-foreground mt-3 leading-[1.6]">
              tinkerer documenting homelab builds, networking experiments, and gaming-adjacent projects.
            </p>
          </div>
          <div>
            <div className="text-[9px] font-mono text-muted-foreground mb-3">/site</div>
            <div className="flex flex-col gap-1.5">
              {["Projects", "Blog", "Reviews", "About"].map((l) => (
                <span
                  key={l}
                  className="text-[11px] font-mono text-foreground/60 hover:text-foreground cursor-pointer transition-colors"
                >
                  {l}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[9px] font-mono text-muted-foreground mb-3">/elsewhere</div>
            <div className="flex flex-col gap-1.5">
              {["github ↗", "email ↗", "rss ↗"].map((l) => (
                <span
                  key={l}
                  className="text-[11px] font-mono text-foreground/60 hover:text-foreground cursor-pointer transition-colors"
                >
                  {l}
                </span>
              ))}
            </div>
          </div>
          <div className="border-2 border-dashed border-[#b8ad8d] rounded flex items-center justify-center p-3 text-center">
            <span className="text-[9px] font-mono text-muted-foreground leading-[1.5]">
              slot · add more later
            </span>
          </div>
        </div>
        <div className="mt-6 pt-4 border-t border-border flex justify-between">
          <span className="text-[10px] font-mono text-muted-foreground">
            © 2026 packetcraft · served by k3s @ home
          </span>
          <span className="text-[10px] font-mono text-muted-foreground">
            uptime 99.4% · build #1284
          </span>
        </div>
      </div>
    </footer>
  );
}

// ─── Home page ────────────────────────────────────────────────────────────────

function HomePage({ onNav }: { onNav: (p: Page) => void }) {
  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      {/* Hero */}
      <div className="mb-8">
        <div className="font-bold font-mono text-5xl text-foreground tracking-tight leading-none">
          <span className="text-primary">&gt;</span> packetcraft
          <Cursor large />
        </div>
        <div className="font-mono text-[13px] text-primary mt-3">
          networks · gaming · systems
        </div>
      </div>

      {/* Terminal whoami */}
      <div className="bg-[#12151f] rounded-lg px-6 py-5 font-mono text-[12px] leading-[1.8] mb-10">
        <div>
          <span className="text-[#3b82f6]">me@packetcraft</span>
          <span className="text-[#8a93a6]">:~$ whoami</span>
        </div>
        <div className="text-[#f0eada]">
          tinkerer · networks · games adjacent · self-host enjoyer
        </div>
        <div>
          <span className="text-[#3b82f6]">me@packetcraft</span>
          <span className="text-[#8a93a6]">:~$ uname -a</span>
        </div>
        <div className="text-[#f0eada]">
          k3s on 4 nodes · arch + ubuntu · serving this site
        </div>
        <div className="mt-1">
          <span className="text-[#3b82f6]">me@packetcraft</span>
          <span className="text-[#8a93a6]">:~$ </span>
          <span className="text-[#f0eada]">cat ./latest</span>
          <Cursor />
        </div>
      </div>

      {/* Featured */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-mono text-muted-foreground">// featured</span>
        <span className="text-[9px] font-mono text-muted-foreground">
          ▸ news · hardware drops · findings
        </span>
      </div>
      <div className="bg-card border border-border border-l-[3px] border-l-primary rounded-md overflow-hidden flex gap-4 p-4 mb-8">
        <Hatch className="w-28 h-20 flex-none" label="cover" />
        <div className="flex-1 min-w-0">
          <div className="flex gap-2 items-center">
            <span className="text-[9px] font-mono text-primary border border-primary rounded px-1.5 py-0.5">
              FEATURED
            </span>
            <span className="text-[9px] font-mono text-muted-foreground">2026-06-22</span>
          </div>
          <div className="mt-3 font-bold font-mono text-[13px] text-foreground leading-snug">
            k3s cluster: one year of lessons from running prod at home
          </div>
          <div className="mt-2 text-[11px] font-mono text-muted-foreground leading-relaxed">
            What broke, what held, and what I'd do differently if I started over today.
          </div>
        </div>
      </div>

      {/* Recent */}
      <div className="text-[11px] font-mono text-muted-foreground mb-3">// recent</div>
      <div className="flex flex-col gap-3 mb-10">
        {[
          { tag: "PROJECT", label: "relic overlay — SHIPPED", sub: "Warframe market overlay using Electron + WF.Market API", muted: false },
          { tag: "BLOG", label: "Dissecting my home network with nmap and Grafana", sub: "2026-05-28 · 5 min · networking", muted: true },
          { tag: "REVIEW", label: "MikroTik RB5009 — RECOMMENDED", sub: "The best sub-$200 router I've owned", muted: true },
        ].map((item, i) => (
          <div
            key={i}
            className="bg-card border border-border rounded p-3 flex gap-3 hover:border-primary/40 transition-colors cursor-pointer"
          >
            <Hatch className="w-14 h-14 flex-none" />
            <div className="flex-1 min-w-0">
              <Tag muted={item.muted}>{item.tag}</Tag>
              <div className="mt-2 font-mono text-[12px] text-foreground font-bold leading-snug">
                {item.label}
              </div>
              <div className="mt-1 text-[10px] font-mono text-muted-foreground">
                {item.sub}
              </div>
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-2 px-1">
          <SpriteWalker size={44} />
          <span className="text-[10px] font-mono text-muted-foreground">
            fetching more…
          </span>
        </div>
      </div>

      {/* Quick nav cards */}
      <div className="grid grid-cols-3 gap-4">
        {(["projects", "blog", "reviews"] as Page[]).map((id) => (
          <button
            key={id}
            onClick={() => onNav(id)}
            className="bg-card border border-border rounded p-4 text-left hover:border-primary/50 hover:bg-primary/5 transition-all group"
          >
            <div className="text-[11px] font-mono text-muted-foreground mb-1">→</div>
            <div className="font-bold font-mono text-[13px] text-foreground group-hover:text-primary transition-colors">
              {id}
            </div>
          </button>
        ))}
      </div>
    </main>
  );
}

// ─── Projects page ────────────────────────────────────────────────────────────

type ProjectFilter = "all" | "SHIPPED" | "BUILDING" | "PLANNED";

function ProjectsPage({ onSelect }: { onSelect: (id: string) => void }) {
  const [filter, setFilter] = useState<ProjectFilter>("all");
  const visible =
    filter === "all" ? projects : projects.filter((p) => p.status === filter);
  const filters: { label: string; id: ProjectFilter }[] = [
    { label: "all", id: "all" },
    { label: "shipped", id: "SHIPPED" },
    { label: "in progress", id: "BUILDING" },
    { label: "planned", id: "PLANNED" },
  ];

  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <h1 className="font-bold font-mono text-3xl text-foreground mb-5">projects</h1>
      <div className="flex gap-2 mb-8">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`text-[10px] font-mono px-3 py-1.5 rounded cursor-pointer transition-colors ${
              filter === f.id
                ? "bg-primary text-white"
                : "border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {visible.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className="bg-card border border-border rounded overflow-hidden text-left hover:border-primary/50 transition-colors group"
          >
            <Hatch className="h-24 w-full" label="screenshot" />
            <div className="p-4">
              <div className="flex items-center justify-between mb-2.5">
                <span className="font-bold font-mono text-[13px] text-foreground group-hover:text-primary transition-colors">
                  {p.name}
                </span>
                <StatusBadge status={p.status} />
              </div>
              <div className="text-[11px] font-mono text-muted-foreground leading-relaxed line-clamp-2">
                {p.description}
              </div>
              <div className="mt-3 text-[9px] font-mono text-muted-foreground">
                {p.meta}
              </div>
            </div>
          </button>
        ))}
      </div>
    </main>
  );
}

// ─── Project detail page ──────────────────────────────────────────────────────

function ProjectDetailPage({
  projectId,
  onBack,
}: {
  projectId: string;
  onBack: () => void;
}) {
  const p = projects.find((x) => x.id === projectId) ?? projects[0];
  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <button
        onClick={onBack}
        className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors mb-5 cursor-pointer"
      >
        ← projects / {p.name}
      </button>

      <div className="flex items-center gap-3 mb-3">
        <h1 className="font-bold font-mono text-2xl text-foreground">{p.name}</h1>
        <StatusBadge status={p.status} />
      </div>

      <div className="flex gap-2 flex-wrap mb-6">
        {p.tags.map((t) => (
          <Tag key={t}>{t}</Tag>
        ))}
      </div>

      {/* Demo embed */}
      <div className="h-48 border-2 border-dashed border-primary rounded-md flex flex-col items-center justify-center gap-3 mb-8 bg-primary/5">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-primary"
              style={{ animation: `blink 1.2s steps(1) ${i * 0.4}s infinite` }}
            />
          ))}
        </div>
        <div className="text-[10px] font-mono text-primary">demo loading…</div>
      </div>

      <div className="grid grid-cols-[1.7fr_1fr] gap-6">
        <div>
          <p className="text-[13px] font-mono text-foreground/80 leading-[1.8]">
            {p.description}
          </p>
          <div className="mt-5">
            <TerminalSnippet code={p.codeSnippet} />
          </div>
        </div>
        <div className="bg-card border border-border rounded p-4">
          <div className="text-[9px] font-mono text-muted-foreground mb-3">links</div>
          <div className="flex flex-col gap-2">
            {["github ↗", "release notes ↗"].map((l) => (
              <span
                key={l}
                className="text-[11px] font-mono text-primary hover:underline cursor-pointer"
              >
                {l}
              </span>
            ))}
          </div>
          <div className="mt-5 text-[9px] font-mono text-muted-foreground mb-3">meta</div>
          <div className="flex flex-col gap-1.5">
            <div className="text-[10px] font-mono text-foreground/70">
              status: <span className="text-foreground">{p.status}</span>
            </div>
            <div className="text-[10px] font-mono text-foreground/70">
              stack: <span className="text-foreground">{p.tags.join(", ")}</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

// ─── Blog page ────────────────────────────────────────────────────────────────

function BlogPage() {
  const featured = blogPosts[0];
  const rest = blogPosts.slice(1);
  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <h1 className="font-bold font-mono text-3xl text-foreground mb-3">blog</h1>
      <p className="text-[12px] font-mono text-muted-foreground mb-8">
        homelab notes · networking deep-dives · gaming-adjacent things
      </p>

      {/* Featured */}
      <div className="bg-card border border-border rounded overflow-hidden mb-8 hover:border-primary/50 transition-colors cursor-pointer group">
        <Hatch className="h-32 w-full" label="featured cover" />
        <div className="p-5">
          <div className="flex gap-2 items-center mb-3">
            <span className="text-[9px] font-mono text-primary border border-primary rounded px-1.5 py-0.5">
              FEATURED
            </span>
            <span className="text-[9px] font-mono text-muted-foreground">
              {featured.date} · {featured.readTime} · {featured.category}
            </span>
          </div>
          <div className="font-bold font-mono text-[16px] text-foreground group-hover:text-primary transition-colors leading-snug mb-2">
            {featured.title}
          </div>
          <div className="text-[12px] font-mono text-muted-foreground leading-relaxed">
            {featured.excerpt}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex flex-col divide-y divide-border">
        {rest.map((post) => (
          <div
            key={post.id}
            className="py-5 hover:bg-primary/5 -mx-2 px-2 rounded transition-colors cursor-pointer group"
          >
            <div className="text-[9px] font-mono text-muted-foreground mb-2">
              {post.date} · {post.readTime} · {post.category}
            </div>
            <div className="font-bold font-mono text-[13px] text-foreground group-hover:text-primary transition-colors mb-1.5">
              {post.title}
            </div>
            <div className="text-[11px] font-mono text-muted-foreground leading-relaxed">
              {post.excerpt}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex justify-center gap-2 mt-8">
        {[1, 2, 3].map((n) => (
          <button
            key={n}
            className={`w-8 h-8 text-[10px] font-mono rounded cursor-pointer transition-colors ${
              n === 1
                ? "bg-primary text-white"
                : "border border-border text-muted-foreground hover:border-primary/40"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </main>
  );
}

// ─── Reviews page ─────────────────────────────────────────────────────────────

type ReviewFilter = "all" | "HARDWARE" | "SOFTWARE";

function ReviewsPage() {
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const visible =
    filter === "all" ? reviews : reviews.filter((r) => r.type === filter);
  const filters: { label: string; id: ReviewFilter }[] = [
    { label: "all", id: "all" },
    { label: "hardware", id: "HARDWARE" },
    { label: "software", id: "SOFTWARE" },
  ];

  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <h1 className="font-bold font-mono text-3xl text-foreground mb-3">reviews</h1>
      <p className="text-[12px] font-mono text-muted-foreground mb-5">
        verdicts only — no stars, no affiliate links
      </p>
      <div className="flex gap-2 mb-8">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`text-[10px] font-mono px-3 py-1.5 rounded cursor-pointer transition-colors ${
              filter === f.id
                ? "bg-primary text-white"
                : "border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {visible.map((r) => (
          <div
            key={r.id}
            className="bg-card border border-border rounded p-4 flex gap-4 hover:border-primary/50 transition-colors cursor-pointer"
          >
            <Hatch className="w-16 h-16 flex-none" label="product" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3 mb-2.5">
                <div className="flex items-center gap-2">
                  <Tag muted>{r.type}</Tag>
                  <span className="font-bold font-mono text-[13px] text-foreground">
                    {r.name}
                  </span>
                </div>
                <VerdictBadge verdict={r.verdict} />
              </div>
              <div className="text-[11px] font-mono text-muted-foreground leading-relaxed">
                {r.excerpt}
              </div>
              <div className="mt-2 text-[9px] font-mono text-muted-foreground">{r.date}</div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

// ─── About page ───────────────────────────────────────────────────────────────

function AboutPage() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <div className="flex gap-6 items-start mb-8">
        <Hatch className="w-24 h-24 flex-none rounded-lg border-2 border-dashed border-muted" label="portrait" />
        <div className="flex-1">
          <h1 className="font-bold font-mono text-3xl text-foreground mb-3">about</h1>
          <p className="text-[13px] font-mono text-foreground/80 leading-[1.8]">
            I'm a self-taught tinkerer based somewhere with fast internet and a
            suspiciously large number of network switches. I work on networking
            infrastructure by day and run a homelab by night.
          </p>
        </div>
      </div>

      <div className="text-[13px] font-mono text-foreground/80 leading-[1.8] mb-8">
        <p>
          This site documents things I build, hardware I test, and observations I
          want to write down somewhere. It runs on a 4-node k3s cluster in my
          basement and serves as both a portfolio and a way to force myself to
          explain things clearly.
        </p>
      </div>

      {/* Stack */}
      <div className="mb-8">
        <div className="text-[11px] font-mono text-muted-foreground mb-3">// stack</div>
        <div className="flex flex-wrap gap-2">
          {["Go", "C++", "k3s", "Postgres", "Ansible", "networking", "Arch Linux", "Ubuntu Server"].map(
            (t) => (
              <Tag key={t}>{t}</Tag>
            )
          )}
        </div>
      </div>

      {/* Now */}
      <div className="bg-card border border-border border-l-[3px] border-l-primary rounded p-4 mb-8">
        <div className="text-[10px] font-mono text-primary mb-2">// now</div>
        <p className="text-[12px] font-mono text-foreground/80 leading-[1.7]">
          Migrating personal services to the k3s cluster · writing obsync ·
          playing Warframe badly
        </p>
      </div>

      {/* Links */}
      <div className="flex gap-5">
        {["github ↗", "email ↗", "rss ↗"].map((l) => (
          <span
            key={l}
            className="text-[12px] font-mono text-muted-foreground hover:text-primary transition-colors cursor-pointer"
          >
            {l}
          </span>
        ))}
      </div>
    </main>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [dark, setDark] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  function handleNav(p: Page) {
    setPage(p);
    setSelectedProject(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleSelectProject(id: string) {
    setSelectedProject(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleBackToProjects() {
    setSelectedProject(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div
      className={`min-h-screen flex flex-col bg-background text-foreground font-mono ${dark ? "dark" : ""}`}
      style={{ fontFamily: "'Space Mono', monospace" }}
    >
      <Nav
        page={page}
        dark={dark}
        onNav={handleNav}
        onToggleDark={() => setDark((d) => !d)}
      />

      <div className="flex-1">
        {page === "home" && <HomePage onNav={handleNav} />}
        {page === "projects" &&
          (selectedProject ? (
            <ProjectDetailPage
              projectId={selectedProject}
              onBack={handleBackToProjects}
            />
          ) : (
            <ProjectsPage onSelect={handleSelectProject} />
          ))}
        {page === "blog" && <BlogPage />}
        {page === "reviews" && <ReviewsPage />}
        {page === "about" && <AboutPage />}
      </div>

      <Footer />
    </div>
  );
}
