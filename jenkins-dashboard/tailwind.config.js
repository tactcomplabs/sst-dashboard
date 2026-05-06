/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        slate: {
          850: '#1a1f2e',
          925: '#0d1117',
          950: '#080b10',
        },
        emerald: {
          450: '#34d399',
        },
        rose: {
          450: '#fb7185',
        },
        amber: {
          450: '#fbbf24',
        },
        // Bench Scope tokens — used exclusively by the benchmark section.
        // Names evoke instrumentation: bezel (case), graticule (cal grid),
        // phosphor (signal trace), annot (annotations: trigger / regression).
        bezel: {
          0: '#0a0c0d', // canvas
          1: '#0f1213', // channel row
          2: '#15191b', // raised: header strip, dropdown
          3: '#0c0e10', // inset: control / input
        },
        graticule: {
          1: 'rgba(180,200,200,0.04)', // subtle grid
          2: 'rgba(180,200,200,0.08)', // hairline divider
          3: 'rgba(180,200,200,0.16)', // axis tick
        },
        phosphor: {
          300: '#bdfbd0', // active dot, hover trace
          500: '#7af8b1', // primary trace
          band: 'rgba(122,248,177,0.08)', // p10–p95 fill
        },
        annot: {
          trigger: '#e7b34a', // sst_version / sha change marker
          warn: '#e76d6d',    // regression > 25% (desaturated red)
        },
        ink: {
          1: '#dfe4e3', // primary label
          2: '#9aa3a1', // secondary
          3: '#5a615f', // tertiary / disabled
        },
      },
      fontFamily: {
        sans: ['Inter var', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      backgroundImage: {
        'grid-pattern': 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
      backgroundSize: {
        'grid': '24px 24px',
      },
    },
  },
  plugins: [],
};
