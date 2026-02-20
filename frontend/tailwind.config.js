/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-base': '#0f1923',
        'bg-card': '#162030',
        'bg-card-raised': '#1e2d40',
        'border-subtle': '#2a3f57',
        'solar-yellow': '#f5c518',
        'solar-yellow-dim': '#7a6209',
        'grid-blue': '#3b82f6',
        'ev-green': '#22c55e',
        'home-teal': '#14b8a6',
        'alert-red': '#ef4444',
        'warning-amber': '#f59e0b',
        'ai-purple': '#a855f7',
        'text-primary': '#f0f4f8',
        'text-secondary': '#8da4be',
        'text-dim': '#4a6382',
      },
    },
  },
  plugins: [],
}
