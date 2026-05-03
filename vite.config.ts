import { defineConfig } from "vite";

// GitHub project sites live under /<repo>/; relative base keeps asset URLs correct.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
