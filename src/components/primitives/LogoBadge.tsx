export function LogoBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  const cls =
    size === "md"
      ? "w-11 h-11 rounded-lg text-[16px]"
      : "w-7 h-7 rounded-md text-[11px]";
  return (
    <div
      className={`${cls} bg-primary flex items-center justify-center font-bold font-mono text-white flex-shrink-0`}
    >
      &gt;_
    </div>
  );
}
