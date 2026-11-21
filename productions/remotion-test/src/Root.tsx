import { Composition } from "remotion";
import pipeline from "../pipeline.json";
import { Title } from "./Title";
import { Bars } from "./Bars";

// The frame count of each composition is stated once, in pipeline.json, so the render
// plan (made before anything is installed) and the composition always agree.
const frames = (id: string): number => {
  const p = pipeline.projects.find((x) => x.id === id);
  if (!p) throw new Error(id + " is not listed in pipeline.json");
  return p.frames;
};

export const Root: React.FC = () => (
  <>
    <Composition id="Title" component={Title} durationInFrames={frames("Title")} fps={pipeline.fps} width={1920} height={1080} />
    <Composition id="Bars" component={Bars} durationInFrames={frames("Bars")} fps={pipeline.fps} width={1920} height={1080} />
  </>
);
