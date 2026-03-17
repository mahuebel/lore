import { Composition } from "remotion";
import { Master } from "./Master";

export const RemotionRoot = () => {
  return (
    <Composition
      id="PluginInstall"
      component={Master}
      durationInFrames={300}
      fps={30}
      width={1280}
      height={700}
    />
  );
};
