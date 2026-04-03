import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,   // 0.0.0.0 → 같은 와이파이 폰에서 접속 가능
    port: 5173,
  },
});
