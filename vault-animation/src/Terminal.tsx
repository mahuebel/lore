import { AbsoluteFill } from "remotion";
import { TerminalContent } from "./TerminalContent";

export const Terminal = () => {
  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {/* Title bar */}
        <div
          style={{
            backgroundColor: "#2d2d2d",
            height: 44,
            display: "flex",
            alignItems: "center",
            paddingLeft: 16,
            paddingRight: 16,
            flexShrink: 0,
          }}
        >
          {/* Traffic lights */}
          <div style={{ display: "flex", gap: 8 }}>
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                backgroundColor: "#ff5f57",
              }}
            />
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                backgroundColor: "#febc2e",
              }}
            />
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                backgroundColor: "#28c840",
              }}
            />
          </div>
          {/* Title */}
          <div
            style={{
              flex: 1,
              textAlign: "center",
              color: "#999",
              fontSize: 14,
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              marginRight: 60,
            }}
          >
            Terminal
          </div>
        </div>

        <TerminalContent />
      </div>
    </AbsoluteFill>
  );
};
