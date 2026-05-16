import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: "hsl(var(--muted))",
        card: "hsl(var(--card))",
        primary: "hsl(var(--primary))",
        accent: "hsl(var(--accent))"
      }
    }
  },
  plugins: []
} satisfies Config;
