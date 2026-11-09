/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // UFMS default brand: orange + navy
        brand: {
          50: '#fdf3ee', 100: '#fbe3d6', 200: '#f6c4ad', 300: '#ef9d78',
          400: '#e9682d', 500: '#e2560f', 600: '#c94d18', 700: '#a63d13',
          800: '#7f2f10', 900: '#5f240d',
        },
        navy: {
          50: '#f4f6f8', 100: '#e3e8ed', 200: '#c6d0da', 300: '#9aa9b8',
          400: '#6d7c8b', 500: '#4a5b6b', 600: '#3b4c5d', 700: '#263442',
          800: '#18212b', 900: '#0f161d',
        },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
