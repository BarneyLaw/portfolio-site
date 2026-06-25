import type { ReactNode } from "react";

export function Tag({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
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
