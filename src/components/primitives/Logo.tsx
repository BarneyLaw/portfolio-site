import { LogoBadge } from "./LogoBadge";

export function Logo({
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
