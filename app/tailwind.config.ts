import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0edff",
          100: "#e0daff",
          200: "#c4b5fe",
          300: "#a48ffc",
          400: "#7c5cf7",
          500: "#6241e8",
          600: "#5233cc",
          700: "#4528a8",
          800: "#3a2189",
          900: "#2e1a6e",
          950: "#1a0f42",
        },
        accent: {
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",
          800: "#9a3412",
          900: "#7c2d12",
          950: "#431407",
        },
      },
    },
  },
  plugins: [],
};

export default config;
