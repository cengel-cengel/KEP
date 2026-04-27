import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1rem',
        sm: '1.5rem',
        lg: '2rem',
      },
      screens: {
        '2xl': '1200px',
      },
    },
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
      '3xl': '1920px',
      '4xl': '2304px',
    },
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0f2744',
          50: '#f0f4f9',
          100: '#dbe5f0',
          200: '#b8cae0',
          300: '#8ba9cb',
          400: '#5a83b1',
          500: '#3a6390',
          600: '#264a73',
          700: '#1a385c',
          800: '#13294a',
          900: '#0f2744',
          950: '#0a1a2f',
        },
        gold: {
          DEFAULT: '#C9A961',
          50: '#fbf7ec',
          100: '#f5edd0',
          200: '#ebda9f',
          300: '#dfc26b',
          400: '#d3ad48',
          500: '#C9A961',
          600: '#a88a47',
          700: '#856a3a',
          800: '#6b5532',
          900: '#5a482e',
        },
        accent: {
          DEFAULT: '#3B82F6',
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3B82F6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        'display-2xl': ['4.5rem', { lineHeight: '1.05', letterSpacing: '-0.025em', fontWeight: '700' }],
        'display-xl':  ['3.75rem', { lineHeight: '1.05', letterSpacing: '-0.025em', fontWeight: '700' }],
        'display-lg':  ['3rem',    { lineHeight: '1.1',  letterSpacing: '-0.02em',  fontWeight: '700' }],
        'display-md':  ['2.25rem', { lineHeight: '1.15', letterSpacing: '-0.015em', fontWeight: '700' }],
      },
      maxWidth: {
        prose: '68ch',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'fade-up': 'fadeUp 0.5s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      backgroundImage: {
        'grid-brand': 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.07) 1px, transparent 0)',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

export default config;
