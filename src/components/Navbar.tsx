import React, { useState, useRef, useEffect } from 'react';
import { Activity, Plus, Zap, Settings, Palette, Check, SlidersHorizontal, Square } from 'lucide-react';

import { THEME_PRESETS } from '../theme';

interface NavbarProps {
  onAddClick: () => void;
  onRunAll: () => void;
  onCancelAll: () => void;
  onOpenSettings: () => void;
  currentThemeId: string;
  onSelectTheme: (themeId: string) => void;
  isRunningAll: boolean;
  autoRefreshInterval: number;
  setAutoRefreshInterval: (interval: number) => void;
  requestTimeoutMs: number;
  setRequestTimeoutMs: (timeoutMs: number) => void;
  lastUpdated?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  onAddClick,
  onRunAll,
  onCancelAll,
  onOpenSettings,
  currentThemeId,
  onSelectTheme,
  isRunningAll,
  autoRefreshInterval,
  setAutoRefreshInterval,
  requestTimeoutMs,
  setRequestTimeoutMs,
}) => {

  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [timingMenuOpen, setTimingMenuOpen] = useState(false);

  const themeMenuRef = useRef<HTMLDivElement>(null);
  const timingMenuRef = useRef<HTMLDivElement>(null);

  // Close the dropdowns on Escape or a click outside of them, so the user isn't
  // forced to toggle the same trigger button again.
  useEffect(() => {
    if (!themeMenuOpen && !timingMenuOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      const node = e.target as Node;
      if (themeMenuRef.current && !themeMenuRef.current.contains(node)) {
        setThemeMenuOpen(false);
      }
      if (timingMenuRef.current && !timingMenuRef.current.contains(node)) {
        setTimingMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setThemeMenuOpen(false);
        setTimingMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [themeMenuOpen, timingMenuOpen]);

  const activeTheme = THEME_PRESETS.find((t) => t.id === currentThemeId) || THEME_PRESETS[0];

  const pollingOptions = [
    { label: '10s', value: 10 },
    { label: '30s', value: 30 },
    { label: '1m', value: 60 },
    { label: '5m', value: 300 },
    { label: '15m', value: 900 },
    { label: '30m', value: 1800 },
    { label: '45m', value: 2700 },
    { label: '60m (1h)', value: 3600 },
    { label: '75m', value: 4500 },
    { label: '90m (1.5h)', value: 5400 },
    { label: '120m (2h)', value: 7200 },
  ];

  // Caps the entire check for a target, not just one request. Reasoning models
  // and large model lists need minutes, so the range goes well past 60s.
  // 0 = unlimited: run until the provider answers.
  const timeoutOptions = [
    { label: '5s', value: 5000 },
    { label: '10s', value: 10000 },
    { label: '30s', value: 30000 },
    { label: '1m', value: 60000 },
    { label: '2m', value: 120000 },
    { label: '5m', value: 300000 },
    { label: '10m', value: 600000 },
    { label: '15m', value: 900000 },
    { label: '30m', value: 1800000 },
    { label: '60m', value: 3600000 },
    { label: '∞', value: 0 },
  ];

  const formatTimeoutBadge = (ms: number) => {
    if (ms <= 0) return '∞';
    if (ms >= 60000) return `${Math.round(ms / 60000)}m`;
    return `${Math.round(ms / 1000)}s`;
  };


  return (
    <header className="theme-bg-header border-b theme-border sticky top-0 z-30 backdrop-blur-md transition-colors theme-text-main">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-0 sm:h-16 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        {/* Brand */}
        <div className="flex items-center space-x-3 min-w-0">
          <div className="p-2 theme-bg-subtle border theme-border rounded-xl relative group shadow-sm flex-shrink-0">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-xl blur opacity-25 group-hover:opacity-50 transition duration-300" />
            <Activity className="w-5 h-5 text-cyan-500 relative z-10" />
          </div>
          <div className="min-w-0">
            <h1 className="font-extrabold theme-text-main text-sm sm:text-base tracking-tight truncate">
              API <span className="text-cyan-500">&amp;</span> LLM Pulse
            </h1>
          </div>
        </div>

        {/* Action Controls */}
        <div className="relative flex items-center justify-end gap-1 sm:gap-2 flex-wrap min-w-0">
          {/* Theme Preset Selector Dropdown */}
          <div className="flex-shrink-0" ref={themeMenuRef}>
            <button
              onClick={() => {
                setThemeMenuOpen(!themeMenuOpen);
                setTimingMenuOpen(false);
              }}
              title="Pilih Tema Tampilan (Theme Switcher)"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl theme-bg-subtle hover:opacity-80 theme-text-main border theme-border transition text-xs font-semibold"
            >
              <Palette className="w-4 h-4 text-cyan-500" />
              <span className="hidden sm:inline">{activeTheme.name}</span>
            </button>

            {themeMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-1rem)] theme-bg-card border theme-border rounded-2xl shadow-2xl p-2 z-50 text-xs space-y-1 max-h-[70dvh] overflow-y-auto">
                <div className="px-3 py-1.5 font-mono font-bold text-[10px] uppercase tracking-wider theme-text-muted border-b theme-border mb-1 flex items-center justify-between">
                  <span>Pilih Tema (Theme Presets)</span>
                </div>

                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {THEME_PRESETS.map((t) => {
                    const isSelected = t.id === currentThemeId;
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          onSelectTheme(t.id);
                          setThemeMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition text-left ${
                          isSelected
                            ? 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 font-bold border border-cyan-300 dark:border-cyan-800'
                            : 'hover:theme-bg-subtle theme-text-main'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5">
                          {/* Color Palette Badge Circles */}
                          <div className="flex items-center -space-x-1">
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-700 shadow-sm"
                              style={{ backgroundColor: t.previewBg }}
                            />
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-700 shadow-sm"
                              style={{ backgroundColor: t.previewCard }}
                            />
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-700 shadow-sm"
                              style={{ backgroundColor: t.previewAccent }}
                            />
                          </div>
                          <div>
                            <span className="block">{t.name}</span>
                            <span className="text-[9px] uppercase font-mono theme-text-muted">
                              {t.category} mode
                            </span>
                          </div>
                        </div>

                        {isSelected && <Check className="w-4 h-4 text-cyan-500 stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* COMBINED SINGLE POPUP MENU: Polling Interval & Request Timeout */}
          <div className="flex-shrink-0" ref={timingMenuRef}>
            <button
              onClick={() => {
                setTimingMenuOpen(!timingMenuOpen);
                setThemeMenuOpen(false);
              }}
              title="Configure Polling Interval & Timeout"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl theme-bg-subtle hover:opacity-80 theme-text-main border theme-border transition text-xs font-semibold"
            >
              <SlidersHorizontal className="w-4 h-4 text-cyan-500" />
              <span className="hidden sm:inline">
                {autoRefreshInterval === 0 ? 'Manual' : `${autoRefreshInterval >= 60 ? `${autoRefreshInterval / 60}m` : `${autoRefreshInterval}s`}`} / {formatTimeoutBadge(requestTimeoutMs)}
              </span>

            </button>

            {timingMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-1rem)] theme-bg-card border theme-border rounded-2xl shadow-2xl p-2.5 z-50 text-xs space-y-2 max-h-[70dvh] overflow-y-auto">
                {/* Option 1: Off (Manual Only) */}
                <button
                  onClick={() => {
                    setAutoRefreshInterval(0);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition text-left font-bold ${
                    autoRefreshInterval === 0
                      ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-800'
                      : 'hover:theme-bg-subtle theme-text-main'
                  }`}
                >
                  <span>Off (Manual Only)</span>
                  {autoRefreshInterval === 0 && <Check className="w-4 h-4 text-rose-500 stroke-[3]" />}
                </button>

                <hr className="theme-border" />

                {/* Section Header: Polling Interval (s.d. 120m) */}
                <div>
                  <div className="px-2 py-1 font-mono font-bold text-[10px] uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                    Polling Interval (s.d. 120m)
                  </div>
                  <div className="grid grid-cols-3 gap-1 mt-1">
                    {pollingOptions.map((opt) => {
                      const isSelected = autoRefreshInterval === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => {
                            setAutoRefreshInterval(opt.value);
                          }}
                          className={`py-1.5 px-2 rounded-lg font-mono text-[11px] transition text-center font-semibold ${
                            isSelected
                              ? 'bg-cyan-50 dark:bg-cyan-950/80 text-cyan-600 dark:text-cyan-400 font-bold border border-cyan-300 dark:border-cyan-800'
                              : 'theme-bg-subtle hover:opacity-80 theme-text-main'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <hr className="theme-border" />

                {/* Section Header: Timeout in Seconds (No ms text) */}
                <div>
                  <div className="px-2 py-1 font-mono font-bold text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    Check Timeout (∞ = unlimited)
                  </div>
                  <div className="grid grid-cols-4 gap-1 mt-1">

                    {timeoutOptions.map((opt) => {
                      const isSelected = requestTimeoutMs === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => {
                            setRequestTimeoutMs(opt.value);
                          }}
                          className={`py-1.5 px-2 rounded-lg font-mono text-[11px] transition text-center font-semibold ${
                            isSelected
                              ? 'bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 font-bold border border-amber-300 dark:border-amber-800'
                              : 'theme-bg-subtle hover:opacity-80 theme-text-main'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Settings Button */}
          <button
            onClick={onOpenSettings}
            title="Notification & Webhook Settings"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold theme-bg-subtle hover:opacity-80 theme-text-main border theme-border transition"
          >
            <Settings className="w-3.5 h-3.5 text-indigo-500" />
            <span className="hidden md:inline">Alert Settings</span>
          </button>

          {/* Run All / Cancel All Checks Button */}
          {isRunningAll ? (
            <button
              onClick={onCancelAll}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/20 transition border border-rose-500/50"
            >
              <Square className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Stop All</span>
            </button>
          ) : (
            <button
              onClick={onRunAll}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition border border-indigo-500/50"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span className="hidden sm:inline">Run All Checks</span>
            </button>
          )}


          {/* Add Endpoint Button */}
          <button
            onClick={onAddClick}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md shadow-cyan-500/20 transition"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span className="hidden sm:inline">Add Endpoint</span>
          </button>
        </div>
      </div>
    </header>
  );
};
