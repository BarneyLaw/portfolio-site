import { Tag } from "../components/primitives/Tag";
import { Hatch } from "../components/primitives/Hatch";

export function AboutPage() {
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
