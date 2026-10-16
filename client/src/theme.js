import { useEffect, useMemo, useState } from 'react';

// SVG presentation attributes (fill, stroke) do not accept var(), so the design
// tokens are resolved to concrete colour strings here. Everything is derived from
// the tokens in index.css, so the two stay in step automatically.
const STATUS_TOKENS = {
  submitted: '--status-submitted',
  under_review: '--status-under_review',
  needs_clarification: '--status-needs_clarification',
  verified: '--status-verified',
  assigned: '--status-assigned',
  in_progress: '--status-in_progress',
  resolved: '--status-resolved',
  rejected: '--status-rejected'
};

// Ordered for chart series, which need a consistent palette.
const SERIES_TOKENS = [
  '--accent',
  '--level-none',
  '--level-moderate',
  '--level-severe',
  '--level-violet',
  '--level-light',
  '--level-heavy'
];

function resolve() {
  const style = getComputedStyle(document.documentElement);
  const hsl = (name, alpha) => {
    const value = style.getPropertyValue(name).trim();
    return alpha === undefined ? `hsl(${value})` : `hsl(${value} / ${alpha})`;
  };

  return {
    accent: hsl('--accent'),
    accentText: hsl('--accent-text'),
    muted: hsl('--text-3'),
    green: hsl('--level-none'),
    teal: hsl('--level-light'),
    amber: hsl('--level-moderate'),
    orange: hsl('--level-heavy'),
    red: hsl('--level-severe'),
    violet: hsl('--level-violet'),
    grid: hsl('--line', 0.09),
    series: SERIES_TOKENS.map(t => hsl(t)),
    status: Object.fromEntries(
      Object.entries(STATUS_TOKENS).map(([status, token]) => [status, hsl(token)])
    )
  };
}

// Tracks the data-theme attribute the toggle writes, so anything derived from it
// re-renders when the user switches theme.
function useThemeAttribute() {
  const read = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  const [theme, setTheme] = useState(read);

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(read()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}

export function useThemeName() {
  return useThemeAttribute();
}

export function useThemeColors() {
  const theme = useThemeAttribute();
  // resolve() reads computed styles, so it must rerun when the theme changes.
  return useMemo(resolve, [theme]);
}
