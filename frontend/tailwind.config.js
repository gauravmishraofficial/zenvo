/** @type {import('tailwindcss').Config} */
const c = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: c('paper'),
        card: c('card'),
        ink: c('ink'),
        muted: c('muted'),
        line: c('line'),
        accent: c('accent'),
        'accent-fg': c('accent-fg'),
        sea: c('sea'),
        brass: c('brass'),
      },
      fontFamily: {
        display: ['"Iowan Old Style"', '"Palatino Linotype"', 'Palatino', 'Georgia', 'Cambria', 'serif'],
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', '"Liberation Mono"', 'monospace'],
      },
      boxShadow: {
        stamp: '4px 4px 0 0 rgb(var(--shadow))',
        'stamp-sm': '2px 2px 0 0 rgb(var(--shadow))',
        'stamp-lg': '7px 7px 0 0 rgb(var(--shadow))',
      },
    },
  },
  plugins: [],
};
