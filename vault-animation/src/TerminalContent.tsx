import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { Cursor } from "./Cursor";

const COMMAND = "claude plugin install vault-sync";

// Timing (in seconds)
const IDLE_BEFORE = 1.0;
const TYPING_DURATION = 1.8;
const PAUSE_AFTER_ENTER = 0.3;
const LINE_STAGGER = 0.05; // 50ms between output lines

const OUTPUT_LINES = [
  { text: 'Installing plugin "vault-sync"...', color: "#d4d4d4" },
  {
    text: "✔ Successfully installed plugin: vault-sync (scope: user)",
    color: "#6bdf6b",
  },
];

export const TerminalContent = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const typingStartFrame = IDLE_BEFORE * fps;
  const typingEndFrame = typingStartFrame + TYPING_DURATION * fps;
  const outputStartFrame = typingEndFrame + PAUSE_AFTER_ENTER * fps;

  const charIndex = Math.floor(
    interpolate(frame, [typingStartFrame, typingEndFrame], [0, COMMAND.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );

  const isTyping = frame >= typingStartFrame && frame < typingEndFrame;
  const typingDone = frame >= typingEndFrame;
  const visibleText = COMMAND.slice(0, charIndex);

  return (
    <div
      style={{
        backgroundColor: "#1e1e1e",
        flex: 1,
        padding: 20,
        fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
        fontSize: 36,
        lineHeight: 1.6,
        color: "#d4d4d4",
      }}
    >
      {/* Command line */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <span style={{ color: "#6bdf6b" }}>~</span>
        <span style={{ color: "#d4d4d4", marginLeft: 8, marginRight: 4 }}>
          $
        </span>
        <span>{visibleText}</span>
        {!typingDone && <Cursor isTyping={isTyping} />}
      </div>

      {/* Output lines */}
      {typingDone &&
        OUTPUT_LINES.map((line, i) => {
          const lineFrame = outputStartFrame + i * LINE_STAGGER * fps;
          if (frame < lineFrame) return null;
          return (
            <div key={i} style={{ color: line.color }}>
              {line.text}
            </div>
          );
        })}

      {/* Cursor on new prompt after output */}
      {typingDone && (
        <div style={{ display: "flex", alignItems: "center", marginTop: 4 }}>
          <span style={{ color: "#6bdf6b" }}>~</span>
          <span style={{ color: "#d4d4d4", marginLeft: 8, marginRight: 4 }}>
            $
          </span>
          <Cursor isTyping={false} />
        </div>
      )}
    </div>
  );
};
