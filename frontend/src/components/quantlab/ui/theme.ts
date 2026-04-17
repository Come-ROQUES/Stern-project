export type QuantLabTokens = {
  colors: {
    background: string;
    accent: string;
    text: string;
    muted: string;
    success: string;
    warn: string;
    danger: string;
    glass: string;
    paper: string;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
  };
  radii: {
    md: number;
    lg: number;
  };
  font: string;
};

export const quantLabTokens: QuantLabTokens = {
  colors: {
    background: "#040813",
    accent: "#46d3ff",
    text: "#e7ecf7",
    muted: "#99a8c2",
    success: "#2de3a0",
    warn: "#f6c341",
    danger: "#f25f73",
    glass: "rgba(255, 255, 255, 0.06)",
    paper: "#ffffff",
  },
  spacing: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 24,
  },
  radii: {
    md: 16,
    lg: 20,
  },
  font: '"Inter", "SF Pro Display", -apple-system, system-ui, sans-serif',
};

export const quantLabCssVariables: Record<string, string | number> = {
  "--ql-bg": quantLabTokens.colors.background,
  "--ql-accent": quantLabTokens.colors.accent,
  "--ql-text": quantLabTokens.colors.text,
  "--ql-muted": quantLabTokens.colors.muted,
  "--ql-success": quantLabTokens.colors.success,
  "--ql-warn": quantLabTokens.colors.warn,
  "--ql-danger": quantLabTokens.colors.danger,
  "--ql-radius-md": `${quantLabTokens.radii.md}px`,
  "--ql-radius-lg": `${quantLabTokens.radii.lg}px`,
  "--ql-space-xs": `${quantLabTokens.spacing.xs}px`,
  "--ql-space-sm": `${quantLabTokens.spacing.sm}px`,
  "--ql-space-md": `${quantLabTokens.spacing.md}px`,
  "--ql-space-lg": `${quantLabTokens.spacing.lg}px`,
  "--ql-glass": quantLabTokens.colors.glass,
  "--ql-paper": quantLabTokens.colors.paper,
};
