import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#5B6DFF',
          hover: '#4C5CF5',
          light: '#7F8DFF',
          active: '#4250DA',
        },
        secondary: '#7A5AF8',
        bg: {
          DEFAULT: '#0F172A',
          secondary: '#161B2E',
        },
        card: {
          DEFAULT: '#1C2238',
          hover: '#2D3654',
        },
        sidebar: '#131827',
        navbar: '#111827',
        surface: {
          hover: '#252D47',
          border: '#303B5A',
        },
        text: {
          secondary: '#C7D2FE',
          description: '#94A3B8',
          disabled: '#64748B',
        },
        status: {
          online: '#22C55E',
          idle: '#F59E0B',
          dnd: '#EF4444',
          invisible: '#6B7280',
        },
      },
      keyframes: {
        'logo-pop': {
          '0%': { opacity: '0', transform: 'scale(0.8)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        wink: {
          '0%, 40%, 60%, 100%': { transform: 'scaleY(1)' },
          '48%, 52%': { transform: 'scaleY(0.15)' },
        },
        'letter-in': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'spin-slow': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'ring-pulse': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.55', transform: 'scale(1.06)' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.55', transform: 'scale(0.94)' },
          '50%': { opacity: '1', transform: 'scale(1.08)' },
        },
        twinkle: {
          '0%, 100%': { opacity: '0.3', transform: 'scale(0.7)' },
          '50%': { opacity: '1', transform: 'scale(1.15)' },
        },
        flicker: {
          '0%, 100%': { opacity: '0.85', transform: 'scale(1) rotate(0deg)' },
          '25%': { opacity: '1', transform: 'scale(1.05) rotate(-2deg)' },
          '50%': { opacity: '0.75', transform: 'scale(0.97) rotate(1deg)' },
          '75%': { opacity: '1', transform: 'scale(1.06) rotate(2deg)' },
        },
        'aurora-flow': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'badge-pop': {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '60%': { transform: 'scale(1.3)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        'logo-pop': 'logo-pop 0.6s ease-out both',
        wink: 'wink 0.9s ease-in-out 1 both',
        'letter-in': 'letter-in 0.4s ease-out both',
        'fade-in': 'fade-in 0.5s ease-out both',
        'fade-out': 'fade-out 0.5s ease-in both',
        'spin-slow': 'spin-slow 5s linear infinite',
        'spin-slower': 'spin-slow 9s linear infinite',
        'ring-pulse': 'ring-pulse 2s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        twinkle: 'twinkle 1.8s ease-in-out infinite',
        flicker: 'flicker 1.4s ease-in-out infinite',
        'aurora-flow': 'aurora-flow 5s ease-in-out infinite',
        'badge-pop': 'badge-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both',
      },
    },
  },
  plugins: [],
} satisfies Config;
