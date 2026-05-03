import { Composition, Folder } from "remotion";
import { AttuneBrandVideo, attuneBrandDefaults } from "./AttuneBrandVideo";

export const RemotionRoot = () => {
  return (
    <Folder name="Attune">
      <Composition
        id="AttuneBrandVertical"
        component={AttuneBrandVideo}
        durationInFrames={1080}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={attuneBrandDefaults}
      />
    </Folder>
  );
};
