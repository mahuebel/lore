import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { Terminal } from "./Terminal";

export const Master = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const entrance = spring({
    frame,
    fps,
    config: { damping: 200 },
  });

  const translateY = interpolate(entrance, [0, 1], [800, 0]);
  const rotateY = interpolate(frame, [0, durationInFrames], [10, -10]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0f1117", perspective: 1200 }}>
      <Sequence
        from={0}
        durationInFrames={300}
        premountFor={30}
        style={{
          transform: `translateY(${translateY}px) rotateX(10deg) rotateY(${rotateY}deg)`,
          transformStyle: "preserve-3d",
        }}
      >
        <Terminal />
      </Sequence>
    </AbsoluteFill>
  );
};
