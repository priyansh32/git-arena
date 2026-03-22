/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        '3xl': '1920px',
      },
      colors: {
        'bg-base': '#09090b',
        'bg-surface': '#18181b',
        'bg-surface-hover': '#27272a',
        'bg-surface-soft': '#202327',
        'border-subtle': '#27272a',
        'border-strong': '#3f3f46',
        'text-primary': '#f4f4f5',
        'text-secondary': '#a1a1aa',
        'text-readable': '#c4c7d1',
        'accent-primary': '#06b6d4',
        'accent-hover': '#0891b2',
        
        'status-pass': '#10b981',
        'status-pass-bg': 'rgba(16, 185, 129, 0.14)',
        'status-pass-border': 'rgba(16, 185, 129, 0.4)',

        'status-fail': '#ef4444',
        'status-fail-bg': 'rgba(239, 68, 68, 0.18)',
        'status-fail-border': 'rgba(239, 68, 68, 0.5)',

        'status-warn': '#f59e0b',
        'status-warn-bg': 'rgba(245, 158, 11, 0.16)',
        'status-warn-border': 'rgba(245, 158, 11, 0.44)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
}
