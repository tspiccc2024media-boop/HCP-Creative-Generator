import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#06122b",
          900: "#071a3d",
          800: "#0a2558",
          700: "#103a78"
        },
        alert: {
          yellow: "#ffd33d",
          red: "#e11d2e",
          cyan: "#2dd4bf"
        }
      },
      boxShadow: {
        panel: "0 18px 45px rgba(6, 18, 43, 0.12)",
        insetline: "inset 0 0 0 1px rgba(15, 23, 42, 0.08)"
      },
      fontFamily: {
        sans: ["Inter", "Poppins", "Noto Sans", "system-ui", "sans-serif"],
        telugu: ["Noto Sans Telugu", "Noto Sans", "system-ui", "sans-serif"],
        devanagari: ["Noto Sans Devanagari", "Noto Sans", "system-ui", "sans-serif"],
        urdu: ["Noto Nastaliq Urdu", "Noto Naskh Arabic", "serif"]
      }
    }
  },
  plugins: []
};

export default config;
