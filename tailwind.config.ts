import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // NodeMap デザイントークン
        nm: {
          bg: '#F8FAFC',         // slate-50 相当
          surface: '#FFFFFF',
          border: '#E2E8F0',     // slate-200
          'border-hover': '#CBD5E1', // slate-300
          text: '#1E293B',       // slate-800
          'text-secondary': '#64748B', // slate-500
          'text-muted': '#94A3B8',     // slate-400
          primary: '#2563EB',    // blue-600
          'primary-hover': '#1D4ED8', // blue-700
          'primary-light': '#EFF6FF', // blue-50
          'primary-border': '#BFDBFE', // blue-200
          dark: '#1E293B',       // slate-800
          'dark-surface': '#334155',   // slate-700
        },
      },
      boxShadow: {
        'nm-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.04)',
        'nm-md': '0 2px 8px -1px rgba(0, 0, 0, 0.06), 0 1px 4px -1px rgba(0, 0, 0, 0.04)',
        'nm-lg': '0 4px 16px -2px rgba(0, 0, 0, 0.08), 0 2px 6px -2px rgba(0, 0, 0, 0.04)',
      },
      borderRadius: {
        'nm': '0.75rem',  // 12px — カード標準
      },
      spacing: {
        'nm-xs': '0.25rem',  // 4px
        'nm-sm': '0.5rem',   // 8px
        'nm-md': '1rem',     // 16px
        'nm-lg': '1.5rem',   // 24px
        'nm-xl': '2rem',     // 32px
      },
    },
  },
  plugins: [],
}
export default config
