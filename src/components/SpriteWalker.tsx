import { useState, useEffect } from "react";

// Walk-cycle frames for the loading sprite, loaded + sorted piece_0 … piece_24.
const walkFrames = Object.entries(
  import.meta.glob(
    "../img/sprite_sheet/darjeeling_sprite_sheet/*.png",
    { eager: true, query: "?url", import: "default" },
  ) as Record<string, string>,
)
  .sort(([a], [b]) => {
    const n = (s: string) => Number(s.match(/piece_(\d+)/)?.[1] ?? 0);
    return n(a) - n(b);
  })
  .map(([, url]) => url);

export function SpriteWalker({ size = 44, fps = 10 }: { size?: number; fps?: number }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (walkFrames.length === 0) return;
    const id = setInterval(
      () => setFrame((f) => (f + 1) % walkFrames.length),
      1000 / fps,
    );
    return () => clearInterval(id);
  }, [fps]);

  if (walkFrames.length === 0) return null;
  return (
    <img
      src={walkFrames[frame]}
      alt="loading"
      width={size}
      height={size}
      className="flex-none object-contain"
      style={{ imageRendering: "pixelated" }}
    />
  );
}
