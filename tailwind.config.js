/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          red:    '#e63946',
          amber:  '#f4a261',
          green:  '#2ec27e',
          yellow: '#f9c74f',
          bg:     '#0c0c0f',
          panel:  '#141418',
          card:   '#1a1a20',
          border: '#2a2a35',
          muted:  '#8a8a9a',
        },
      },
      fontFamily: {
        display: ['var(--font-bebas)', 'Impact', 'sans-serif'],
        body:    ['var(--font-dm)', 'system-ui', 'sans-serif'],
      },
      animation: {
        'flip-in': 'flipIn 0.5s ease forwards',
        'pulse-ring': 'pulseRing 1.5s ease-in-out infinite',
        'slide-up': 'slideUp 0.3s ease forwards',
        'fade-in': 'fadeIn 0.4s ease forwards',
      },
      keyframes: {
        flipIn: {
          '0%':   { transform: 'rotateY(90deg)', opacity: '0' },
          '100%': { transform: 'rotateY(0deg)',  opacity: '1' },
        },
        pulseRing: {
          '0%, 100%': { boxShadow: '0 0 0 0px rgba(230, 57, 70, 0.4)' },
          '50%':      { boxShadow: '0 0 0 8px rgba(230, 57, 70, 0)' },
        },
        slideUp: {
          '0%':   { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
