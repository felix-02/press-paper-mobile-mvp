import { defineConfig, loadEnv } from "vite";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode, command }) => {
  const loaded = loadEnv(mode, process.cwd(), "");
  const appMode = (process.env.VITE_APP_MODE || loaded.VITE_APP_MODE || "live").toLowerCase();
  const supabaseUrl = process.env.VITE_SUPABASE_URL || loaded.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || loaded.VITE_SUPABASE_ANON_KEY;

  if (command === "build") {
    if (appMode !== "live") {
      throw new Error('VITE_APP_MODE must be "live". Non-database runtime builds are disabled.');
    }
    if (Boolean(supabaseUrl) !== Boolean(supabaseAnonKey)) {
      throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be configured together.");
    }
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Builds require VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
    }
  }

  return {
    base: "/",
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    build: {
      outDir: "dist",
      chunkSizeWarningLimit: 4000,
    },
  };
});
