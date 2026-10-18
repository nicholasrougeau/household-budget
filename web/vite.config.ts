import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Served from https://nicholasrougeau.github.io/household-budget/
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  server: { port: 5181, strictPort: true },
});
