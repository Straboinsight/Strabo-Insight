// frame-ticker is UMD-only; three-globe expects a default ESM export.
import * as FrameTickerModule from "frame-ticker/dist/FrameTicker.js";

const FrameTicker =
  (FrameTickerModule as { default?: unknown }).default ??
  (FrameTickerModule as { FrameTicker?: unknown }).FrameTicker;

export default FrameTicker;
