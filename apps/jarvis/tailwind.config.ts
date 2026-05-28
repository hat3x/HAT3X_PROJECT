import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'jarvis-bg': '#040810',
        'jarvis-surface': '#0a1020',
        'jarvis-border': '#1a2540',
        'jarvis-accent': '#7c3aed',
        'jarvis-glow': '#a855f7',
        'jarvis-text': '#e2e8f0',
        'jarvis-muted': '#64748b',
      },
      keyframes: {
        'orb-idle': {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.8' },
          '50%': { transform: 'scale(1.04)', opacity: '1' },
        },
        'orb-pulse': {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.9' },
          '50%': { transform: 'scale(1.08)', opacity: '1' },
        },
        'ring-expand': {
          '0%': { transform: 'scale(1)', opacity: '0.6' },
          '100%': { transform: 'scale(1.8)', opacity: '0' },
        },
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'orb-idle': 'orb-idle 3s ease-in-out infinite',
        'orb-pulse': 'orb-pulse 0.8s ease-in-out infinite',
        'ring-1': 'ring-expand 2s ease-out infinite',
        'ring-2': 'ring-expand 2s ease-out 0.5s infinite',
        'ring-3': 'ring-expand 2s ease-out 1s infinite',
        'spin-slow': 'spin-slow 3s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
