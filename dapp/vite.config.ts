import react from "@vitejs/plugin-react"
import path from "path"
import { defineConfig } from "vite"
import { nodePolyfills } from "vite-plugin-node-polyfills"

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Enable polyfills for specific globals and modules
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  resolve: {
    alias: {
      assets: path.resolve(__dirname, "./src/assets"),
      shared: path.resolve(__dirname, "./src/shared"),
    },
  },
})
