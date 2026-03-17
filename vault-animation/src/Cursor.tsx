import { useCurrentFrame, useVideoConfig } from "remotion";

type CursorProps = {
  isTyping?: boolean;
};

export const Cursor = ({ isTyping = false }: CursorProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Solid while typing, blinks every 0.5s when idle
  const visible = isTyping || Math.floor(frame / (fps * 0.5)) % 2 === 0;

  return (
    <span
      style={{
        display: "inline-block",
        width: 14,
        height: 40,
        backgroundColor: visible ? "#d4d4d4" : "transparent",
        marginLeft: 2,
        verticalAlign: "middle",
      }}
    />
  );
};
