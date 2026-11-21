import { useCurrentFrame } from "remotion";

// Test aid: the frame number as 16 black and white squares in the top-left corner (most significant bit
// first), so the joined file can be checked for missing or repeated frames at every join.
export const FrameCode: React.FC<{ offset?: number }> = ({ offset = 0 }) => {
  const frame = useCurrentFrame() + offset;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, display: "flex", background: "#000", padding: 8 }}>
      {Array.from({ length: 16 }, (_, i) => (
        <div key={i} style={{ width: 24, height: 24, background: (frame >> (15 - i)) & 1 ? "#fff" : "#000" }} />
      ))}
    </div>
  );
};
