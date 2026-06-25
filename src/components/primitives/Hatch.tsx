export function Hatch({ className = "", label = "" }: { className?: string; label?: string }) {
  return (
    <div
      className={`flex items-center justify-center text-[9px] font-mono text-[#9a9a9a] rounded ${className}`}
      style={{
        background:
          "repeating-linear-gradient(45deg,#ececec,#ececec 7px,#f5f5f5 7px,#f5f5f5 14px)",
      }}
    >
      {label}
    </div>
  );
}
