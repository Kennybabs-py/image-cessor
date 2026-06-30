import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "processor/image-processor": "src/processor/image-processor.ts",
  },
  format: ["cjs", "esm"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: "node18",
  outDir: "dist",
  external: ["bullmq", "ioredis", "sharp"],
});
