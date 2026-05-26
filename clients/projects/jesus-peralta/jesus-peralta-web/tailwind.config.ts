import type { Config } from 'tailwindcss'
const config: Config = {
  content: ['./src/pages/**/*.{js,ts,jsx,tsx,mdx}','./src/components/**/*.{js,ts,jsx,tsx,mdx}','./src/app/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: '#080808', surface: '#111111', 'surface-2': '#1A1A1A', border: '#2A2A2A',
        accent: { DEFAULT: '#7A9BAD', light: '#9DBDCE', dark: '#5C7D8F' }, muted: '#888888',
      },
      fontFamily: { sans: ['var(--font-inter)','sans-serif'], serif: ['var(--font-cormorant)','serif'] },
    },
  },
  plugins: [],
}
export default config
