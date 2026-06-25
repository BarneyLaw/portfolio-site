import { useState } from "react";
import { reviews, type ReviewType } from "../data/reviews";
import { VerdictBadge } from "../components/primitives/VerdictBadge";
import { Tag } from "../components/primitives/Tag";
import { Hatch } from "../components/primitives/Hatch";

type ReviewFilter = "all" | ReviewType;

export function ReviewsPage() {
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
