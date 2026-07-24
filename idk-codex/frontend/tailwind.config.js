/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#F5F0E8',
        surface: '#FFFFFF',
        border: '#E8E0D0',
        'text-primary': '#1A1A1A',
        'text-secondary': '#6B6B6B',
        accent: '#C17D3C',
        success: '#22C55E',
        error: '#EF4444',
        warning: '#F59E0B',
        'phase-planning': '#F59E0B',
        'phase-executing': '#3B82F6',
        'phase-testing': '#A855F7',
        'phase-deploying': '#22C55E',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'Monaco', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
}
