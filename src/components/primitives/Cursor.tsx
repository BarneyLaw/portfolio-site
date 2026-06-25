export function Cursor({ large = false }: { large?: boolean }) {
  return (
    <span
      className={`inline-block bg-primary align-middle ml-1 ${
        large ? "w-3.5 h-[26px] -mb-[3px]" : "w-2 h-4 -mb-px"
      }`}
      style={{ animation: "blink 1s steps(1) infinite" }}
    />
  );
}
