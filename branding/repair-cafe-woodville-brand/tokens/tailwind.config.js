/**
 * Repair Cafe Woodville - Tailwind theme extension.
 *
 * Usage: merge `theme.extend` into your tailwind.config.js, or spread this
 * whole object. Exposes brand colours (bg-rc-orange, text-rc-navy, ...),
 * the Hanken Grotesk stack (font-display / font-body), the type scale,
 * spacing, radii and shadows.
 *
 * Reminder for generators: orange is accent-only. Use text-rc-navy or
 * text-rc-ink for body copy. Never text-rc-orange on white for paragraphs.
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        rc: {
          orange:  { DEFAULT: "#ED6A42", 600: "#C95A38", 700: "#A64A2E", 200: "#F7BCAA", 100: "#FCE4DD", 50: "#FEF5F2" },
          navy:    { DEFAULT: "#2D2E82", 600: "#26276E", 700: "#20205B", 200: "#A0A1C7", 100: "#D9D9E8", 50: "#F0F0F6" },
          sky:     { DEFAULT: "#698AC6", 600: "#5975A8", 100: "#E4EAF5" },
          sand:    { DEFAULT: "#DBC19A", 600: "#BAA483", 100: "#F9F4ED" },
          stone:   { DEFAULT: "#E6E2DB", 600: "#C4C0BA", 200: "#F4F2EF", 100: "#FAFAF9" },
          ink:     "#231F20",
          violet:  { DEFAULT: "#9300FF", 600: "#7D00D9", 100: "#ECD1FF" }, // optional Woodville accent
        },
      },
      fontFamily: {
        display: ["Hanken Grotesk", "Arial Black", "Helvetica Neue", "Arial", "sans-serif"],
        body:    ["Hanken Grotesk", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Arial", "sans-serif"],
      },
      fontWeight: {
        light: "300",
        black: "900",
      },
      fontSize: {
        "rc-xs":  ["0.75rem",  { lineHeight: "1.6" }],
        "rc-sm":  ["0.875rem", { lineHeight: "1.6" }],
        "rc-base":["1rem",     { lineHeight: "1.6" }],
        "rc-lg":  ["1.25rem",  { lineHeight: "1.4" }],
        "rc-xl":  ["1.563rem", { lineHeight: "1.2" }],
        "rc-2xl": ["1.953rem", { lineHeight: "1.1" }],
        "rc-3xl": ["2.441rem", { lineHeight: "1.05" }],
        "rc-4xl": ["3.052rem", { lineHeight: "1.05" }],
        "rc-5xl": ["3.815rem", { lineHeight: "1.0" }],
      },
      spacing: {
        "rc-1": "0.25rem", "rc-2": "0.5rem", "rc-3": "0.75rem", "rc-4": "1rem",
        "rc-5": "1.5rem", "rc-6": "2rem", "rc-7": "3rem", "rc-8": "4rem",
        "rc-9": "6rem", "rc-10": "8rem",
      },
      borderRadius: {
        "rc-sm": "4px", "rc-md": "8px", "rc-lg": "16px", "rc-xl": "24px", "rc-pill": "999px",
      },
      boxShadow: {
        "rc-sm": "0 1px 3px rgba(35,31,32,0.08)",
        "rc-md": "0 4px 8px rgba(35,31,32,0.08)",
        "rc-lg": "0 12px 24px rgba(35,31,32,0.10)",
        "rc-accent": "0 8px 20px rgba(237,106,66,0.28)",
      },
    },
  },
};
