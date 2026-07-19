import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primaria: {
          DEFAULT: "#15803D",
          escura: "#166534",
          clara: "#DCFCE7",
        },
        fundo: "#F8FAFC",
        superficie: "#FFFFFF",
        texto: "#0F172A",
        destaque: {
          DEFAULT: "#EA580C",
          clara: "#FFEDD5",
        },
        erro: {
          DEFAULT: "#DC2626",
          clara: "#FEE2E2",
        },
        sucesso: {
          DEFAULT: "#16A34A",
          clara: "#DCFCE7",
        },
      },
      borderRadius: {
        card: "12px",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
