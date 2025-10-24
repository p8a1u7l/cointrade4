import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        midnight: '#0b1220',
        emerald: '#00d897',
        coral: '#ff6b6b',
        steel: '#1b2432',
        slate: '#4f5d75',
      },
    },
  },
  plugins: [],
} satisfies Config;
