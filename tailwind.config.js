/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector', '.dark'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--ascend-canvas)',
        surface: {
          DEFAULT: 'var(--ascend-surface)',
          muted: 'var(--ascend-surface-muted)',
          elevated: 'var(--ascend-surface-elevated)',
        },
        ink: {
          DEFAULT: 'var(--ascend-ink)',
          muted: 'var(--ascend-ink-muted)',
        },
        line: 'var(--ascend-line)',
        accent: {
          DEFAULT: 'var(--ascend-accent)',
          fg: 'var(--ascend-accent-fg)',
          soft: 'var(--ascend-accent-soft)',
        },
      },
    },
  },
};
