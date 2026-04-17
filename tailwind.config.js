/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}', './src/renderer/index.html'],
  theme: {
    extend: {
      colors: {
        bg: {
          deep: '#F2F2F7',
          card: '#FFFFFF',
          elevated: '#F2F2F7',
          border: '#E5E5EA'
        },
        accent: {
          cyan: '#007AFF',
          'cyan-muted': '#5AC8FA',
          violet: '#AF52DE',
          'violet-deep': '#5856D6'
        },
        streak: '#FF9500',
        success: '#34C759',
        danger: '#FF3B30',
        txt: {
          primary: '#1D1D1F',
          secondary: '#8E8E93',
          muted: '#AEAEB2'
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'monospace']
      }
    }
  },
  plugins: []
}
