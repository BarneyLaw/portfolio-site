import { useState } from "react";
import { projects, type ProjectStatus } from "../data/projects";
import { StatusBadge } from "../components/primitives/StatusBadge";
import { Hatch } from "../components/primitives/Hatch";

type ProjectFilter = "all" | ProjectStatus;

export function ProjectsPage({ onSelect }: { onSelect: (id: string) => void }) {
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
