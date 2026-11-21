import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { FrameCode } from "./FrameCode";

// Placeholder chart: bars that keep moving for the whole composition, so every slice has motion in it.
const VALUES = [0.35, 0.8, 0.55, 0.95, 0.4, 0.7, 0.6, 0.85];

export const Bars: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  return (
    <AbsoluteFill style={{ background: "#f4f1de", fontFamily: "sans-serif" }}>
      <div style={{ position: "absolute", top: 90, width: "100%", textAlign: "center", fontSize: 72, color: "#3d405b", fontWeight: 700 }}>
        Placeholder chart
      </div>
      <div style={{ position: "absolute", left: 240, right: 240, bottom: 140, height: 640, display: "flex", alignItems: "flex-end", gap: 40 }}>
        {VALUES.map((v, i) => {
          const grow = interpolate(frame, [i * 6, i * 6 + 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const wave = 0.15 * Math.sin(t * 1.3 + i * 0.9);
          return (
            <div key={i} style={{ flex: 1, height: `${Math.max(0, Math.min(1, v + wave)) * 100 * grow}%`, background: i % 2 ? "#e07a5f" : "#81b29a", borderRadius: 12 }} />
          );
        })}
      </div>
      <div style={{ position: "absolute", bottom: 60, width: "100%", textAlign: "center", fontSize: 40, color: "#3d405b" }}>
        {(t).toFixed(1)} s of {(durationInFrames / fps).toFixed(0)} s
      </div>
      <FrameCode />
    </AbsoluteFill>
  );
};
