import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'aiden-bg': '#040810',
        'aiden-surface': '#0a1020',
        'aiden-border': '#1a2540',
        'aiden-accent': '#7c3aed',
        'aiden-glow': '#a855f7',
        'aiden-text': '#e2e8f0',
        'aiden-muted': '#64748b',
      },
      keyframes: {
        /* ── Orb states ─────────────────────────────────────────── */
        'orb-breathe': {
          '0%, 100%': { transform: 'scale(1)', filter: 'brightness(0.85)' },
          '50%': { transform: 'scale(1.045)', filter: 'brightness(1.15)' },
        },
        'orb-lean': {
          '0%, 100%': { transform: 'scale(1.05)', filter: 'brightness(1.1)' },
          '50%': { transform: 'scale(1.1)', filter: 'brightness(1.25)' },
        },
        'orb-think': {
          '0%': { transform: 'rotate(0deg) scale(1)' },
          '50%': { transform: 'rotate(180deg) scale(1.04)' },
          '100%': { transform: 'rotate(360deg) scale(1)' },
        },
        'orb-speak': {
          '0%, 100%': { transform: 'scale(1)', filter: 'brightness(1)' },
          '25%': { transform: 'scale(1.06)', filter: 'brightness(1.3)' },
          '75%': { transform: 'scale(0.97)', filter: 'brightness(0.9)' },
        },
        /* ── Core inner glow ─────────────────────────────────────── */
        'core-pulse': {
          '0%, 100%': { opacity: '0.4', transform: 'scale(0.7)' },
          '50%': { opacity: '0.9', transform: 'scale(1)' },
        },
        'core-think': {
          '0%': { transform: 'rotate(0deg) scale(0.8)', opacity: '0.6' },
          '50%': { transform: 'rotate(180deg) scale(1.1)', opacity: '1' },
          '100%': { transform: 'rotate(360deg) scale(0.8)', opacity: '0.6' },
        },
        'core-speak': {
          '0%, 100%': { transform: 'scale(0.75)', opacity: '0.5' },
          '33%': { transform: 'scale(1.05)', opacity: '1' },
          '66%': { transform: 'scale(0.85)', opacity: '0.7' },
        },
        /* ── Rings ───────────────────────────────────────────────── */
        'ring-expand': {
          '0%': { transform: 'scale(1)', opacity: '0.7' },
          '100%': { transform: 'scale(2.2)', opacity: '0' },
        },
        /* ── Orbital arcs ────────────────────────────────────────── */
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        'spin-reverse': {
          from: { transform: 'rotate(360deg)' },
          to: { transform: 'rotate(0deg)' },
        },
        /* ── Speaking wave glow ──────────────────────────────────── */
        'speak-glow': {
          '0%, 100%': { opacity: '0.3', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.15)' },
        },
        /* ── Floating particles ──────────────────────────────────── */
        'float-1': {
          '0%, 100%': { transform: 'translateY(0px) translateX(0px)', opacity: '0.15' },
          '33%': { transform: 'translateY(-18px) translateX(8px)', opacity: '0.35' },
          '66%': { transform: 'translateY(-8px) translateX(-6px)', opacity: '0.2' },
        },
        'float-2': {
          '0%, 100%': { transform: 'translateY(0px) translateX(0px)', opacity: '0.1' },
          '50%': { transform: 'translateY(-24px) translateX(-10px)', opacity: '0.3' },
        },
        'float-3': {
          '0%, 100%': { transform: 'translateY(0px) translateX(0px)', opacity: '0.2' },
          '40%': { transform: 'translateY(12px) translateX(14px)', opacity: '0.05' },
          '80%': { transform: 'translateY(-14px) translateX(6px)', opacity: '0.25' },
        },
        /* ── Cursor blink ────────────────────────────────────────── */
        'blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        /* ── Dot typing ──────────────────────────────────────────── */
        'dot-appear': {
          '0%, 20%': { opacity: '0', transform: 'translateY(2px)' },
          '40%, 100%': { opacity: '1', transform: 'translateY(0)' },
        },
        /* ── Sound bar ────────────────────────────────────────────── */
        'bar-dance': {
          '0%, 100%': { transform: 'scaleY(0.35)' },
          '50%': { transform: 'scaleY(1)' },
        },
      },
      animation: {
        /* Orb */
        'orb-breathe': 'orb-breathe 4s ease-in-out infinite',
        'orb-lean': 'orb-lean 0.6s ease-in-out infinite',
        'orb-think': 'orb-think 3s ease-in-out infinite',
        'orb-speak': 'orb-speak 0.55s ease-in-out infinite',
        /* Core */
        'core-pulse': 'core-pulse 4s ease-in-out infinite',
        'core-think': 'core-think 2s ease-in-out infinite',
        'core-speak': 'core-speak 0.55s ease-in-out infinite',
        /* Rings */
        'ring-1': 'ring-expand 2.4s ease-out infinite',
        'ring-2': 'ring-expand 2.4s ease-out 0.7s infinite',
        'ring-3': 'ring-expand 2.4s ease-out 1.4s infinite',
        /* Orbitals */
        'spin-slow': 'spin-slow 4s linear infinite',
        'spin-medium': 'spin-slow 2.5s linear infinite',
        'spin-reverse': 'spin-reverse 6s linear infinite',
        /* FX */
        'speak-glow': 'speak-glow 0.55s ease-in-out infinite',
        /* Particles */
        'float-1': 'float-1 7s ease-in-out infinite',
        'float-2': 'float-2 9s ease-in-out infinite 1.5s',
        'float-3': 'float-3 11s ease-in-out infinite 3s',
        /* Labels */
        'blink': 'blink 1s step-end infinite',
        'dot-appear': 'dot-appear 1.2s ease-in-out infinite',
        'dot-appear-2': 'dot-appear 1.2s ease-in-out 0.4s infinite',
        'dot-appear-3': 'dot-appear 1.2s ease-in-out 0.8s infinite',
        /* Sound bars */
        'bar-dance': 'bar-dance 0.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
