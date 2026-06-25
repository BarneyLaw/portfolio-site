export function VerdictBadge({ verdict }: { verdict: string }) {
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
