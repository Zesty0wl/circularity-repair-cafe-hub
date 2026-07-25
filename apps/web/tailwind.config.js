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
        // The `accent` scale themes call-to-action buttons independently of the
        // brand colour (defaults to the same teal — see app.css / brand.ts).
        accent: {
          50: 'rgb(var(--accent-50) / <alpha-value>)',
          100: 'rgb(var(--accent-100) / <alpha-value>)',
          200: 'rgb(var(--accent-200) / <alpha-value>)',
          300: 'rgb(var(--accent-300) / <alpha-value>)',
          400: 'rgb(var(--accent-400) / <alpha-value>)',
          500: 'rgb(var(--accent-500) / <alpha-value>)',
          600: 'rgb(var(--accent-600) / <alpha-value>)',
          700: 'rgb(var(--accent-700) / <alpha-value>)',
          800: 'rgb(var(--accent-800) / <alpha-value>)',
          900: 'rgb(var(--accent-900) / <alpha-value>)',
        },
        // Supporting colours. `pine`, `clay`, `sun` and `sage` all follow the
        // cafe's own two colours, so a page never mixes a cafe's palette with
        // Circularity's. `paper` (page background) and `ink` (body text) stay
        // fixed: they are near-neutral and work under any brand colour.
        //   pine  → headings and strong text
        //   clay  → small warm accents (eyebrows, meta icons)
        //   sun   → highlight badges
        //   sage  → soft tinted surfaces and section bands
        pine: 'rgb(var(--brand-700) / <alpha-value>)',
        clay: 'rgb(var(--accent-600) / <alpha-value>)',
        sun: 'rgb(var(--accent-500) / <alpha-value>)',
        sage: 'rgb(var(--brand-100) / <alpha-value>)',
        paper: '#FBF7EF',
        ink: '#1C2622',
      },
      fontFamily: {
        // Body/UI (`sans`) and display headings (`display`) read CSS variables
        // so a cafe can switch typeface; defaults (Circularity Mulish/Fraunces)
        // and every selectable family are self-hosted via @fontsource-variable
        // (see +layout.svelte) to work offline and satisfy the app's CSP.
        sans: ['var(--font-sans)'],
        display: ['var(--font-display)'],
      },
    },
  },
  plugins: [],
};
