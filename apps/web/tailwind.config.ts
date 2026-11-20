import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem', screens: { '2xl': '1280px' } },
    extend: {
      fontFamily: { sans: ['"Schibsted Grotesk Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        // Evidence semantics used across the whole product
        verified: { DEFAULT: 'hsl(var(--verified))', soft: 'hsl(var(--verified-soft))' },
        pending: { DEFAULT: 'hsl(var(--pending))', soft: 'hsl(var(--pending-soft))' },
        gap: { DEFAULT: 'hsl(var(--gap))', soft: 'hsl(var(--gap-soft))' },
        ink: 'hsl(var(--ink))',
        brand: 'hsl(var(--brand))',
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 3px)', sm: 'calc(var(--radius) - 6px)' },
    },
  },
  plugins: [animate],
};
export default config;
