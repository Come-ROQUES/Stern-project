/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#00FF88",
        secondary: "#00CC6A",
        highlight: "#00FF88",
        success: "#00FF88",
        warning: "#FFD700",
        danger: "#FF4444",
        card: "#0A0E18",
        cardAlt: "#0E1220",
        bg: "#050510",
        neutral: {
          100: "#8a918a",
          200: "#4a524a",
        },
      },
    },
  },
  plugins: [],
};
