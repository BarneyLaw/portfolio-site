export function TerminalSnippet({ code }: { code: string }) {
  return (
    <div className="bg-[#12151f] rounded-md p-3 font-mono text-[9px] leading-relaxed">
      {code.split("\n").map((line, i) => (
        <div key={i} className={i === 0 ? "text-[#8a93a6]" : "text-[#3b82f6]"}>
          {line || <>&nbsp;</>}
        </div>
      ))}
    </div>
  );
}
