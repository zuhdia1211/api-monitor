/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ApiTarget, SummaryMetrics, CheckProgress, isSettledStatus } from './types';

import { Navbar } from './components/Navbar';
import { SummaryCards } from './components/SummaryCards';
import { TargetList } from './components/TargetList';
import { AddTargetModal } from './components/AddTargetModal';
import { TargetDetailModal } from './components/TargetDetailModal';
import { SettingsModal } from './components/SettingsModal';
import { IncidentLogs } from './components/IncidentLogs';
import { ModelMonitor } from './components/ModelMonitor';
import { ModelChatModal } from './components/ModelChatModal';
import { ChatAgent } from './components/ChatAgent';
import { applyThemePreset, THEME_PRESETS } from './theme';
import { LayoutGrid, ShieldAlert, Cpu, MessageSquare, CheckCircle2, AlertCircle, Download, X } from 'lucide-react';
import { checkForUpdate, UpdateInfo } from './local/update-checker';
import { downloadAndInstallApk, canInstallApks, openInstallSettings } from './local/apk-installer';

export default function App() {
  const [targets, setTargets] = useState<ApiTarget[]>([]);
  const [metrics, setMetrics] = useState<SummaryMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  // Theme Preset State
  const [currentThemeId, setCurrentThemeId] = useState<string>(() => {
    return localStorage.getItem('app-theme-id') || 'light-slate';
  });

  useEffect(() => {
    applyThemePreset(currentThemeId);
  }, [currentThemeId]);

  const handleSelectTheme = (themeId: string) => {
    setCurrentThemeId(themeId);
    const preset = THEME_PRESETS.find((t) => t.id === themeId);
    if (preset) {
      showToast(`Tema diubah ke ${preset.name}`, 'info');
    }
  };

  // Tab State: 'dashboard' | 'models' | 'incidents' | 'chat' — default to 'models'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'models' | 'incidents' | 'chat'>('models');

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<ApiTarget | null>(null);
  const [inspectTarget, setInspectTarget] = useState<ApiTarget | null>(null);

  // Model Chat Modal state
  const [chatModal, setChatModal] = useState<{ targetId: string; targetName: string; modelId: string } | null>(null);

  // Auto Refresh Interval in seconds (0 = off) — persisted server-side
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(30);
  const [pollingLoaded, setPollingLoaded] = useState(false);

  // Global request/check budget in ms (0 = unlimited) — persisted server-side.
  const [requestTimeoutMs, setRequestTimeoutMs] = useState<number>(10000);

  const formatTimeout = (ms: number) =>
    ms <= 0 ? 'Unlimited' : ms >= 60000 ? `${Math.round(ms / 60000)} menit` : `${Math.round(ms / 1000)} detik`;

  const handleSetRequestTimeout = async (timeout: number) => {
    setRequestTimeoutMs(timeout);

    try {
      // Persist globally first so new targets inherit it too.
      const currentSettings = await fetch('/api/settings').then((r) => r.json());
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...currentSettings, requestTimeoutMs: timeout }),
      });

      // Then apply to every existing target so the change takes effect now.
      await Promise.all(
        targets.map((t) =>
          fetch(`/api/targets/${t.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...t, timeoutMs: timeout }),
          })
        )
      );
      await fetchData();
      showToast(
        `Global Timeout diubah ke ${formatTimeout(timeout)} dan diterapkan ke semua ${targets.length} endpoint`,
        'success'
      );
    } catch (err: any) {
      showToast(`Timeout diubah tetapi gagal update beberapa endpoint: ${err.message}`, 'error');
    }
  };


  // Checking state per target ID
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set());
  const [isRunningAll, setIsRunningAll] = useState(false);

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // In-app update banner
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const info = await checkForUpdate();
      if (!cancelled && info.available) setUpdateInfo(info);
    };
    run();
    // Re-check when returning to the foreground and every 6 hours.
    const timer = setInterval(run, 6 * 60 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const handleUpdateNow = async () => {
    if (!updateInfo?.downloadUrl || updating) return;

    // Android 8+ blocks the install intent unless this app is allowed to
    // install unknown apps. Surface the settings screen instead of failing
    // silently after a full APK download.
    const canInstall = await canInstallApks();
    if (!canInstall) {
      showToast('Aktifkan "Izinkan dari sumber ini" untuk update', 'info');
      openInstallSettings().catch(() => {});
      return;
    }

    setUpdating(true);
    try {
      await downloadAndInstallApk(updateInfo.downloadUrl);
    } catch (err: any) {
      showToast(`Gagal mengunduh update: ${err.message}`, 'error');
    } finally {
      setUpdating(false);
    }
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  };

  // Fetch Targets & Summary Metrics
  const fetchData = useCallback(async () => {
    try {
      const [targetsRes, metricsRes, settingsRes] = await Promise.all([
        fetch('/api/targets'),
        fetch('/api/metrics/summary'),
        !pollingLoaded ? fetch('/api/settings') : Promise.resolve(null),
      ]);

      if (targetsRes.ok) {
        const targetsData = await targetsRes.json();
        setTargets(targetsData);
      }

      if (metricsRes.ok) {
        const metricsData = await metricsRes.json();
        setMetrics(metricsData);
      }

      // Load polling interval + global timeout from server on first fetch
      if (!pollingLoaded && settingsRes && settingsRes.ok) {
        const settings = await settingsRes.json();
        if (settings.autoRefreshInterval !== undefined) {
          setAutoRefreshInterval(settings.autoRefreshInterval);
        }
        if (settings.requestTimeoutMs !== undefined) {
          setRequestTimeoutMs(settings.requestTimeoutMs);
        }
        setPollingLoaded(true);
      }

    } catch (err: any) {
      console.error('Failed to fetch monitoring data:', err);
    } finally {
      setLoading(false);
    }
  }, [pollingLoaded]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh timer effect
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const timer = setInterval(() => {
      fetchData();
    }, autoRefreshInterval * 1000);

    return () => clearInterval(timer);
  }, [autoRefreshInterval, fetchData]);

  // Live per-model progress for checks still running, keyed by target id.
  const [progressMap, setProgressMap] = useState<Record<string, CheckProgress>>({});

  // While a check is in flight the card should not sit on stale data, even in
  // Manual mode where the auto-refresh timer above is disabled. Progress is
  // polled on a tighter loop than the full refresh so each model result shows
  // up almost as soon as the server records it.
  // Auto-clear isRunningAll once every in-flight check has settled.
  useEffect(() => {
    if (isRunningAll && checkingIds.size === 0) {
      setIsRunningAll(false);
      showToast('All endpoint checks completed', 'success');
      fetchData();
    }
  }, [isRunningAll, checkingIds.size]);

  const hasCheckInFlight = checkingIds.size > 0 || isRunningAll;
  useEffect(() => {
    if (!hasCheckInFlight) {
      setProgressMap({});
      return;
    }

    let cancelled = false;

    const pollProgress = async () => {
      try {
        const [progressRes, inFlightRes] = await Promise.all([
          fetch('/api/targets/progress'),
          fetch('/api/targets/in-flight'),
        ]);
        if (cancelled) return;

        if (progressRes.ok) {
          const list: CheckProgress[] = await progressRes.json();
          setProgressMap(Object.fromEntries(list.map((p) => [p.targetId, p])));
        }

        // Keep the per-row Stop buttons accurate during Run All, where the
        // individual ids were never added locally.
        if (inFlightRes.ok) {
          const { targetIds } = await inFlightRes.json();
          setCheckingIds(new Set<string>(targetIds));
        }
      } catch {
        // Transient failures are fine; the next tick retries.
      }
    };

    pollProgress();
    const progressTimer = setInterval(pollProgress, 1000);
    const dataTimer = setInterval(() => fetchData(), 3000);

    return () => {
      cancelled = true;
      clearInterval(progressTimer);
      clearInterval(dataTimer);
    };
  }, [hasCheckInFlight, fetchData]);

  /**
   * Overlays live progress onto the persisted targets so every view (cards,
   * table, model monitor) renders per-model results as they land instead of
   * waiting for the whole endpoint to finish.
   */
  const displayTargets = React.useMemo(() => {
    if (Object.keys(progressMap).length === 0) return targets;

    return targets.map((t) => {
      const progress = progressMap[t.id];
      if (!progress) return t;

      // Models still in flight carry a `testing` placeholder, so the roll-up
      // has to ignore them — counting them as failures would flash a false
      // "down" badge for as long as the first request is open.
      const settled = progress.modelResults.filter((m) => isSettledStatus(m.status));
      const done = settled.length;
      const operational = settled.filter((m) => m.status === 'operational').length;

      return {
        ...t,
        lastCheckResult: {
          ...(t.lastCheckResult || {
            id: `live-${t.id}`,
            targetId: t.id,
            httpStatus: 200,
          }),
          timestamp: progress.startedAt,
          // Partial roll-up so the badge reflects what has been seen so far.
          overallStatus:
            done === 0 ? 'unknown' : operational === done ? 'healthy' : operational === 0 ? 'down' : 'degraded',
          latencyMs:
            done > 0 ? Math.round(settled.reduce((s, m) => s + m.latencyMs, 0) / done) : 0,
          discoveredModelsCount: progress.totalModels,
          modelResults: progress.modelResults,
          errorMessage: undefined,
        },
        checkProgress: progress,
      } as ApiTarget;

    });
  }, [targets, progressMap]);


  // Persist polling interval change to server
  const handleSetAutoRefresh = async (interval: number) => {
    setAutoRefreshInterval(interval);
    try {
      const currentSettings = await fetch('/api/settings').then(r => r.json());
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...currentSettings, autoRefreshInterval: interval }),
      });
    } catch (err: any) {
      console.error('Failed to persist polling interval:', err);
    }
  };

  // Manual check for single target
  const handleCheckNow = async (id: string) => {
    setCheckingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/targets/${id}/check`, { method: 'POST' });
      if (res.ok) {
        const result = await res.json();
        if (result.cancelled) {
          showToast('Check stopped', 'info');
        } else {
          showToast(
            `Checked endpoint. Status: ${result.overallStatus.toUpperCase()} (${result.latencyMs}ms)`,
            result.overallStatus === 'healthy' ? 'success' : 'error'
          );
        }
        await fetchData();
      } else {
        showToast('Check failed to execute', 'error');
      }

    } catch (err: any) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      setCheckingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // Stop a single check or all checks
  const handleCancelCheck = async (id: string) => {
    try {
      const res = await fetch(`/api/targets/${id}/cancel`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.stopped) {
          showToast('Check stopped', 'info');
          await fetchData();
        }
      }
    } catch (err: any) {
      showToast(`Stop failed: ${err.message}`, 'error');
    }
  };

  const handleCancelAll = async () => {
    try {
      const res = await fetch('/api/targets/cancel-all', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        showToast(`Stopped ${data.stoppedCount} running checks`, 'info');
        await fetchData();
      }
    } catch (err: any) {
      showToast(`Cancel-all failed: ${err.message}`, 'error');
    }
  };

  // Run all checks — fire-and-forget; progress polling handles live updates.
  const handleRunAll = async () => {
    setIsRunningAll(true);
    try {
      const res = await fetch('/api/targets/check-all', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.startedCount > 0) {
          showToast(`Started checks for ${data.startedCount} endpoints`, 'info');
        } else {
          showToast('All endpoints are already being checked', 'info');
          setIsRunningAll(false);
        }
      } else {
        showToast('Failed to run all checks', 'error');
        setIsRunningAll(false);
      }
    } catch (err: any) {
      showToast(`Error running check-all: ${err.message}`, 'error');
      setIsRunningAll(false);
    }
  };


  // Save (Create or Edit) Target
  const handleSaveTarget = async (payload: Partial<ApiTarget>) => {
    const isEdit = Boolean(payload.id);
    const endpoint = isEdit ? `/api/targets/${payload.id}` : '/api/targets';
    const method = isEdit ? 'PUT' : 'POST';

    const fullPayload = {
      ...payload,
      // 0 means "unlimited", so respect an explicit 0 from the form.
      timeoutMs: payload.timeoutMs ?? requestTimeoutMs,
    };


    const res = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fullPayload),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save target');
    }

    showToast(isEdit ? 'Target updated successfully' : 'Target created and initial check triggered!', 'success');
    await fetchData();
  };

  // Delete Target
  const handleDeleteTarget = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this monitored endpoint?')) return;

    try {
      const res = await fetch(`/api/targets/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Endpoint target deleted', 'info');
        await fetchData();
      }
    } catch (err: any) {
      showToast(`Delete failed: ${err.message}`, 'error');
    }
  };

  // Clear All Configured Targets
  const handleClearData = async () => {
    if (!window.confirm('Clear all targets and reset data to empty setup?')) return;
    try {
      const res = await fetch('/api/clear-all-data', { method: 'POST' });
      if (res.ok) {
        showToast('All targets cleared! System is now empty.', 'info');
        await fetchData();
      }
    } catch (err: any) {
      showToast(`Clear failed: ${err.message}`, 'error');
    }
  };

  // The chat tab manages its own internal scrolling, so lock the page to the
  // viewport there instead of letting the whole document grow.
  const isChatTab = activeTab === 'chat';

  return (
    <div
      className="theme-bg-app theme-text-main font-sans antialiased transition-colors h-dvh flex flex-col overflow-hidden"
    >
      {/* Toast Notification Banner */}
      {toast && (
        <div className="fixed top-20 right-6 z-50 animate-bounce">
          <div
            className={`flex items-center space-x-2 px-4 py-3 rounded-2xl border shadow-2xl text-xs font-semibold ${
              toast.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                : toast.type === 'error'
                ? 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                : 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Update Available Banner */}
      {updateInfo && !updateDismissed && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-lg">
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-2xl text-xs font-semibold bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-800">
            <Download className="w-4 h-4 text-amber-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <span>
                Versi baru <span className="font-mono font-bold">{updateInfo.latestVersion}</span> tersedia
              </span>
              {updateInfo.notes && (
                <p className="text-[10px] theme-text-muted truncate mt-0.5">{updateInfo.notes}</p>
              )}
            </div>
            {updateInfo.downloadUrl && (
              <button
                onClick={handleUpdateNow}
                disabled={updating}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-white font-bold transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {updating ? 'Mengunduh...' : 'Update'}
              </button>
            )}
            <button
              onClick={() => setUpdateDismissed(true)}
              className="shrink-0 theme-text-muted hover:opacity-70"
              title="Tutup"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Top Navbar */}
      <Navbar
        onAddClick={() => {
          setEditingTarget(null);
          setIsAddModalOpen(true);
        }}
        onRunAll={handleRunAll}
        onCancelAll={handleCancelAll}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        currentThemeId={currentThemeId}
        onSelectTheme={handleSelectTheme}
        isRunningAll={isRunningAll}

        autoRefreshInterval={autoRefreshInterval}
        setAutoRefreshInterval={handleSetAutoRefresh}
        requestTimeoutMs={requestTimeoutMs}
        setRequestTimeoutMs={handleSetRequestTimeout}
      />

      {/* Main Container */}
      <main
        className={`w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 flex-1 min-h-0 ${
          isChatTab ? 'flex flex-col overflow-hidden' : 'overflow-y-auto overscroll-contain'
        }`}
      >
        {/* Global Summary Metric Cards */}
        <SummaryCards metrics={metrics} loading={loading} />

        {/* View Tab Switcher */}
        <div className="flex items-center space-x-2 border-b theme-border pb-3">
          <button
            onClick={() => setActiveTab('models')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-extrabold text-xs transition ${
              activeTab === 'models'
                ? 'bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 border border-indigo-300 dark:border-indigo-800/80 shadow-md'
                : 'theme-text-muted hover:theme-text-main hover:theme-bg-subtle border border-transparent'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>Monitored Models</span>
          </button>

          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-extrabold text-xs transition ${
              activeTab === 'dashboard'
                ? 'bg-cyan-50 dark:bg-cyan-950/80 text-cyan-600 dark:text-cyan-400 border border-cyan-300 dark:border-cyan-800/80 shadow-md'
                : 'theme-text-muted hover:theme-text-main hover:theme-bg-subtle border border-transparent'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            <span>Monitored Endpoints ({targets.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-extrabold text-xs transition ${
              activeTab === 'chat'
                ? 'bg-violet-50 dark:bg-violet-950/80 text-violet-600 dark:text-violet-400 border border-violet-300 dark:border-violet-800/80 shadow-md'
                : 'theme-text-muted hover:theme-text-main hover:theme-bg-subtle border border-transparent'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>AI Chat</span>
          </button>

          <button
            onClick={() => setActiveTab('incidents')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-extrabold text-xs transition ${
              activeTab === 'incidents'
                ? 'bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-800/80 shadow-md'
                : 'theme-text-muted hover:theme-text-main hover:theme-bg-subtle border border-transparent'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Incident &amp; Error Stream</span>
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'models' ? (
          <ModelMonitor
            targets={displayTargets}
            onOpenChat={(targetId, targetName, modelId) => setChatModal({ targetId, targetName, modelId })}
          />
        ) : activeTab === 'dashboard' ? (
          <TargetList
            targets={displayTargets}
            onCheckNow={handleCheckNow}
            onCancelCheck={handleCancelCheck}
            onInspect={(t) => setInspectTarget(t)}
            onDelete={handleDeleteTarget}
            onEdit={(t) => {
              setEditingTarget(t);
              setIsAddModalOpen(true);
            }}
            onAddClick={() => {
              setEditingTarget(null);
              setIsAddModalOpen(true);
            }}
            checkingIds={checkingIds}
          />

        ) : activeTab === 'chat' ? (
          <div className="flex-1 min-h-0 flex flex-col">
            <ChatAgent targets={targets} />
          </div>
        ) : (
          <IncidentLogs />
        )}
      </main>

      {/* Add / Edit Target Modal */}
      <AddTargetModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingTarget(null);
        }}
        onSave={handleSaveTarget}
        editingTarget={editingTarget}
      />

      {/* Target Detail Inspection Modal */}
      <TargetDetailModal
        target={inspectTarget}
        onClose={() => setInspectTarget(null)}
        onRunCheck={handleCheckNow}
        isCheckInFlight={inspectTarget ? checkingIds.has(inspectTarget.id) : false}
      />

      {/* App Alert & Webhook Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />

      {/* Model Chat Reasoning Test Modal */}
      <ModelChatModal
        isOpen={chatModal !== null}
        onClose={() => setChatModal(null)}
        targetId={chatModal?.targetId || ''}
        targetName={chatModal?.targetName || ''}
        modelId={chatModal?.modelId || ''}
      />
    </div>
  );
}
