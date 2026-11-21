import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FrameCode } from "./FrameCode";

// Placeholder title card.
export const Title: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 200 } });
  return (
    <AbsoluteFill style={{ background: "#14213d", justifyContent: "center", alignItems: "center", fontFamily: "sans-serif" }}>
      <div
        style={{
          color: "#fca311",
          fontSize: 140,
          fontWeight: 700,
          scale: String(0.8 + 0.2 * pop),
          opacity: interpolate(frame, [durationInFrames - 15, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        Placeholder Title
      </div>
      <div
        style={{
          color: "#e5e5e5",
          fontSize: 56,
          marginTop: 24,
          opacity: interpolate(frame, [20, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) }),
        }}
      >
        Remotion pipeline test
      </div>
      <FrameCode />
    </AbsoluteFill>
  );
};
