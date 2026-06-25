import { projects } from "../data/projects";
import { StatusBadge } from "../components/primitives/StatusBadge";
import { Tag } from "../components/primitives/Tag";
import { TerminalSnippet } from "../components/primitives/TerminalSnippet";

export function ProjectDetailPage({ projectId }: { projectId: string }) {
  const p = projects.find((x) => x.id === projectId) ?? projects[0];
  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <a
        href="/projects"
        className="inline-block text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors mb-5 cursor-pointer"
      >
        ← projects / {p.name}
      </a>

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
