import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Anek Latin Variable", "ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"] },
      colors: {
        canvas: "rgb(var(--canvas) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        elevated: "rgb(var(--elevated) / <alpha-value>)",
        stroke: "rgb(var(--stroke) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        signal: "rgb(var(--signal) / <alpha-value>)",
        brand: "rgb(var(--brand) / <alpha-value>)",
        "brand-fill": "rgb(var(--brand-fill) / <alpha-value>)",
        "brand-ink": "rgb(var(--brand-ink) / <alpha-value>)",
      },
      boxShadow: { panel: "0 1px 0 rgba(5,11,36,.04)" },
    },
  },
  plugins: [],
};
export default config;
