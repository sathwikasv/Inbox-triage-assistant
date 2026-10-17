/** Semantic colour tokens come from CSS variables (src/index.css), so light and dark mode share one class set. */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: { sans: ['"Inter Variable"', "Inter", "ui-sans-serif", "system-ui", "sans-serif"] },
      colors: {
        canvas: token("canvas"),
        surface: token("surface"),
        subtle: token("subtle"),
        line: token("line"),
        fg: token("fg"),
        muted: token("muted"),
        brand: { DEFAULT: token("brand"), fg: token("brand-fg"), soft: token("brand-soft") },
        nav: token("nav"),
        row: { read: token("row-read"), unread: token("row-unread") },
      },
      boxShadow: {
        card: "0 1px 2px rgb(16 24 40 / 0.04), 0 1px 3px rgb(16 24 40 / 0.06)",
        pop: "0 12px 32px -8px rgb(16 24 40 / 0.24), 0 4px 8px -4px rgb(16 24 40 / 0.12)",
        row: "inset 1px 0 0 rgb(var(--line)), inset -1px 0 0 rgb(var(--line)), 0 1px 3px 0 rgb(60 64 67 / 0.3)",
      },
      keyframes: {
        "fade-in": { from: { opacity: 0, transform: "translateY(4px)" }, to: { opacity: 1, transform: "none" } },
        "slide-in": { from: { opacity: 0, transform: "translateX(12px)" }, to: { opacity: 1, transform: "none" } },
      },
      animation: { "fade-in": "fade-in 160ms ease-out", "slide-in": "slide-in 180ms ease-out" },
    },
  },
  plugins: [],
};
