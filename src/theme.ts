export interface ThemePreset {
  id: string;
  name: string;
  category: 'light' | 'dark';
  bgColor: string;
  cardColor: string;
  textColor: string;
  accentColor: string;
  previewBg: string;
  previewCard: string;
  previewAccent: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'light-slate',
    name: 'Clean Light Slate',
    category: 'light',
    bgColor: 'bg-slate-50',
    cardColor: 'bg-white border-slate-200 text-slate-900',
    textColor: 'text-slate-900',
    accentColor: 'text-cyan-600',
    previewBg: '#f8fafc',
    previewCard: '#ffffff',
    previewAccent: '#0891b2',
  },
  {
    id: 'nord-light',
    name: 'Ocean Breeze Light',
    category: 'light',
    bgColor: 'bg-sky-50/50',
    cardColor: 'bg-white border-sky-200 text-slate-900',
    textColor: 'text-slate-900',
    accentColor: 'text-sky-600',
    previewBg: '#f0f9ff',
    previewCard: '#ffffff',
    previewAccent: '#0284c7',
  },
  {
    id: 'mint-light',
    name: 'Fresh Mint Light',
    category: 'light',
    bgColor: 'bg-emerald-50/40',
    cardColor: 'bg-white border-emerald-200 text-slate-900',
    textColor: 'text-slate-900',
    accentColor: 'text-emerald-600',
    previewBg: '#ecfdf5',
    previewCard: '#ffffff',
    previewAccent: '#059669',
  },
  {
    id: 'dark-slate',
    name: 'Classic Slate Dark',
    category: 'dark',
    bgColor: 'bg-slate-950',
    cardColor: 'bg-slate-900 border-slate-800 text-slate-100',
    textColor: 'text-slate-100',
    accentColor: 'text-cyan-400',
    previewBg: '#030712',
    previewCard: '#0f172a',
    previewAccent: '#22d3ee',
  },
  {
    id: 'midnight',
    name: 'Midnight Navy Dark',
    category: 'dark',
    bgColor: 'bg-blue-950',
    cardColor: 'bg-slate-900/90 border-blue-900/80 text-blue-50',
    textColor: 'text-blue-50',
    accentColor: 'text-indigo-400',
    previewBg: '#090d16',
    previewCard: '#1e1b4b',
    previewAccent: '#818cf8',
  },
  {
    id: 'cyberpunk',
    name: 'Neon Cyberpunk Dark',
    category: 'dark',
    bgColor: 'bg-zinc-950',
    cardColor: 'bg-zinc-900 border-pink-900/50 text-zinc-100',
    textColor: 'text-zinc-100',
    accentColor: 'text-pink-500',
    previewBg: '#09090b',
    previewCard: '#18181b',
    previewAccent: '#ec4899',
  },
];

export function applyThemePreset(themeId: string) {
  const preset = THEME_PRESETS.find((t) => t.id === themeId) || THEME_PRESETS[0];
  const root = document.documentElement;

  // Set class for Tailwind dark variant
  if (preset.category === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
  }

  root.setAttribute('data-theme', preset.id);
  localStorage.setItem('app-theme-id', preset.id);
}
