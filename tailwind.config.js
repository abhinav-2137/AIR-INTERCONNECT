/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/client/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        error: "#ba1a1a",
        "on-tertiary": "#ffffff",
        "primary-fixed": "#e0e0ff",
        "on-primary-container": "#ccceff",
        "on-secondary-container": "#1f258d",
        "surface-container-lowest": "#ffffff",
        "surface-container-high": "#e9e7f0",
        "on-background": "#1b1b22",
        "secondary-fixed": "#e0e0ff",
        "on-surface-variant": "#454653",
        "surface-tint": "#4a53bd",
        secondary: "#4c53b8",
        "error-container": "#ffdad6",
        "primary-container": "#464eb8",
        "on-secondary-fixed": "#00026c",
        "on-secondary-fixed-variant": "#333a9f",
        "surface-variant": "#e4e1eb",
        "on-error-container": "#93000a",
        "on-surface": "#1b1b22",
        "tertiary-fixed-dim": "#bec2ff",
        "on-tertiary-fixed-variant": "#2e38a8",
        "tertiary-fixed": "#e0e0ff",
        background: "#fbf8ff",
        "on-primary": "#ffffff",
        "on-error": "#ffffff",
        surface: "#fbf8ff",
        "tertiary-container": "#434dbc",
        "surface-bright": "#fbf8ff",
        "primary-fixed-dim": "#bec2ff",
        "inverse-primary": "#bec2ff",
        "on-primary-fixed": "#00026c",
        "surface-dim": "#dbd9e2",
        primary: "#2d349f",
        "on-secondary": "#ffffff",
        "secondary-container": "#8c94fe",
        "on-primary-fixed-variant": "#3139a4",
        "surface-container": "#efecf6",
        "on-tertiary-container": "#cbceff",
        "inverse-surface": "#303037",
        "inverse-on-surface": "#f2eff9",
        "surface-container-low": "#f5f2fc",
        outline: "#767684",
        "on-tertiary-fixed": "#000569",
        tertiary: "#2933a3",
        "secondary-fixed-dim": "#bec2ff",
        "surface-container-highest": "#e4e1eb",
        "outline-variant": "#c6c5d5",
        
        /* Legacy/Structural Mappings for Bureau Blue Stationery Theme */
        "sidebar-bone": "#f5f2fc",
        "paper": "#fbf8ff",
        "line-hairline": "#c6c5d5",
        "ink": "#1b1b22",
        "ink-muted": "#454653",
        "success-moss": "#386a20"
      },
      borderRadius: {
        DEFAULT: "0.125rem",
        lg: "0.25rem",
        xl: "0.5rem",
        full: "0.75rem"
      },
      spacing: {
        "margin-page": "24px",
        "sidebar-width": "260px",
        "rail-width": "56px",
        gutter: "24px"
      },
      fontFamily: {
        "ui-label": ["Work Sans", "sans-serif"],
        "body-message": ["Work Sans", "sans-serif"],
        "display-xl": ["Source Serif 4", "serif"],
        caption: ["Work Sans", "sans-serif"],
        "header-title": ["Source Serif 4", "serif"],
        "label-caps": ["JetBrains Mono", "monospace"]
      },
      fontSize: {
        "ui-label": ["13px", { lineHeight: "1", letterSpacing: "0.02em", fontWeight: "500" }],
        "body-message": ["15px", { lineHeight: "1.5", fontWeight: "400" }],
        "display-xl": ["28px", { lineHeight: "1.2", fontWeight: "600" }],
        caption: ["12px", { lineHeight: "1.2", fontWeight: "400" }],
        "header-title": ["20px", { lineHeight: "1.2", fontWeight: "600" }]
      }
    }
  },
  plugins: [],
  darkMode: "class"
};
