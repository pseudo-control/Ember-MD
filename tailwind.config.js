/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './src/index.html'],
  theme: {
    extend: {},
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: [
      {
        wireframe: {
          ...require("daisyui/src/theming/themes")["wireframe"],
          // Override base-content to be darker (near-black)
          "base-content": "#1a1a1a",
          // Also darken neutral-content for better contrast
          "neutral-content": "#1a1a1a",
          // Darken primary for better readability
          "primary": "#374151",
          "primary-content": "#ffffff",
          // Use system font instead of wireframe's handwriting font
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        },
      },
    ],
  },
};
