import { Cursor } from "../components/primitives/Cursor";
import { Hatch } from "../components/primitives/Hatch";
import { Tag } from "../components/primitives/Tag";
import { SpriteWalker } from "../components/SpriteWalker";
import type { Page } from "../types";

export function HomePage({ onNav }: { onNav: (p: Page) => void }) {
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
