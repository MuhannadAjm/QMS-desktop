import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#1E3A5F",
          light: "#2E5080",
          subtle: "#EBF2FA",
        },
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
