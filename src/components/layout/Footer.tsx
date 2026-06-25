import { Logo } from "../primitives/Logo";

export function Footer() {
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
