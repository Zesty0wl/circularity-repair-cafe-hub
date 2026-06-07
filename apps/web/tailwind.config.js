/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        // The `brand` scale is driven by CSS custom properties so each cafe can
        // override its primary colour at runtime (see src/lib/brand.ts). The
        // defaults baked into app.css are the Circularity teal scale.
        brand: {
          50: 'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          800: 'rgb(var(--brand-800) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
        },
        // Fixed Circularity brand colours (not per-cafe themeable).
        pine: '#0E3D33',
        clay: '#D2683F',
        sun: '#F3B43E',
        sage: '#BFD6C4',
        paper: '#FBF7EF',
        ink: '#1C2622',
      },
      fontFamily: {
        // Mulish for body/UI, Fraunces for display headings — self-hosted via
        // @fontsource-variable (see +layout.svelte) so they work offline and
        // satisfy the app's strict CSP.
        sans: ['"Mulish Variable"', 'Mulish', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Fraunces Variable"', 'Fraunces', 'Georgia', '"Times New Roman"', 'serif'],
      },
    },
  },
  plugins: [],
};
