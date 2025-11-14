/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./public/**/*.{html,js}",
    "./src/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "Manrope", "system-ui", "-apple-system", "sans-serif"],
      },
      colors: {
        "vibe-indigo": {
          200: "#c7d2fe",
          300: "#a5b4fc",
          500: "#6366f1",
        },
        "vibe-emerald": {
          200: "#a7f3d0",
        },
      },
      boxShadow: {
        "vibe-card": "0 15px 45px rgba(15, 23, 42, 0.45)",
      },
    },
  },
  plugins: [],
};
