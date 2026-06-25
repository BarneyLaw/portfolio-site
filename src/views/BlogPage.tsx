import { blogPosts } from "../data/blog";
import { Hatch } from "../components/primitives/Hatch";

export function BlogPage() {
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
