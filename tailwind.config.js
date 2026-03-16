/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'teal': {
          600: '#0D6E8A',
          700: '#0A5A72',
          800: '#084A5E',
        },
      },
      fontFamily: {
        'mono': ['"DM Mono"', 'monospace'],
        'sans': ['Sora', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
