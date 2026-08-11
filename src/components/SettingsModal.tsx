import React, { useState, useEffect } from 'react';
import { X, Bell, Send, CheckCircle2, AlertTriangle, Loader2, ShieldCheck, Coins, Download } from 'lucide-react';
import { openInstallSettings, canInstallApks } from '../local/apk-installer';
import { AppSettings, WebhookTestResult } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useState<AppSettings>({
    enableAlerts: true,
    webhookUrl: '',
    webhookFormat: 'generic',
    telegramBotToken: '',
    telegramChatId: '',
    alertCooldownMinutes: 10,
  });

  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [installPermNote, setInstallPermNote] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<WebhookTestResult | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
    }
  }, [isOpen]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTestWebhook = async () => {
    try {
      setTesting(true);
      setTestResult(null);
      const res = await fetch('/api/settings/test-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Error connecting to server',
      });
    } finally {
      setTesting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="theme-bg-card border theme-border rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden theme-text-main my-8 transition-colors">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b theme-border theme-bg-subtle">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 text-indigo-500 rounded-lg">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold theme-text-main">Alert &amp; Notification Settings</h2>
              <p className="text-xs theme-text-muted">Configure Webhook &amp; Telegram alerts for system incidents</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg theme-text-muted hover:theme-text-main hover:theme-bg-subtle transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body Form */}
        <form onSubmit={handleSave} className="p-6 space-y-6 text-xs">
          {/* Master Enable Alert Toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl theme-bg-subtle border theme-border">
            <div>
              <label className="text-sm font-bold theme-text-main block">Enable Incident Alerts</label>
              <p className="text-xs theme-text-muted mt-0.5">Automatically dispatch notifications when a target fails</p>
            </div>
            <input
              type="checkbox"
              checked={settings.enableAlerts}
              onChange={(e) => setSettings({ ...settings, enableAlerts: e.target.checked })}
              className="w-5 h-5 rounded theme-bg-input theme-border text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
          </div>

          {/* Section 1: Generic / Discord / Slack Webhook */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-indigo-500 uppercase tracking-wider flex items-center gap-2">
              <Send className="w-4 h-4" /> Webhook Integration
            </h3>

            <div>
              <label className="block text-xs font-bold theme-text-main mb-1.5">Webhook URL</label>
              <input
                type="text"
                placeholder="https://discord.com/api/webhooks/... or https://hooks.slack.com/..."
                value={settings.webhookUrl || ''}
                onChange={(e) => setSettings({ ...settings, webhookUrl: e.target.value })}
                autoComplete="off"
                spellCheck={false}
                className="w-full theme-bg-input border theme-border rounded-xl px-3.5 py-2.5 text-xs theme-text-main placeholder:theme-text-muted focus:outline-none focus:border-indigo-500 font-mono select-text"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold theme-text-main mb-1.5">Payload Format</label>
                <select
                  value={settings.webhookFormat || 'generic'}
                  onChange={(e) => setSettings({ ...settings, webhookFormat: e.target.value as any })}
                  className="w-full theme-bg-input border theme-border rounded-xl px-3.5 py-2.5 text-xs theme-text-main focus:outline-none focus:border-indigo-500 font-semibold"
                >
                  <option value="generic" className="theme-bg-card theme-text-main">Generic JSON Payload</option>
                  <option value="slack" className="theme-bg-card theme-text-main">Slack Compatible</option>
                  <option value="discord" className="theme-bg-card theme-text-main">Discord Compatible</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold theme-text-main mb-1.5">Alert Cooldown (Minutes)</label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={settings.alertCooldownMinutes || 10}
                  onChange={(e) => setSettings({ ...settings, alertCooldownMinutes: Number(e.target.value) || 10 })}
                  className="w-full theme-bg-input border theme-border rounded-xl px-3.5 py-2.5 text-xs theme-text-main focus:outline-none focus:border-indigo-500 font-mono select-text"
                />
              </div>
            </div>
          </div>

          <hr className="theme-border" />

          {/* Section 2: Telegram Bot Integration */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-indigo-500 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Telegram Bot Alert
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold theme-text-main mb-1.5">Telegram Bot Token</label>
                <input
                  type="password"
                  placeholder="123456789:ABCdefGhIJK..."
                  value={settings.telegramBotToken || ''}
                  onChange={(e) => setSettings({ ...settings, telegramBotToken: e.target.value })}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full theme-bg-input border theme-border rounded-xl px-3.5 py-2.5 text-xs theme-text-main placeholder:theme-text-muted focus:outline-none focus:border-indigo-500 font-mono select-text"
                />
              </div>

              <div>
                <label className="block text-xs font-bold theme-text-main mb-1.5">Chat ID / Group ID</label>
                <input
                  type="text"
                  placeholder="-100123456789"
                  value={settings.telegramChatId || ''}
                  onChange={(e) => setSettings({ ...settings, telegramChatId: e.target.value })}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full theme-bg-input border theme-border rounded-xl px-3.5 py-2.5 text-xs theme-text-main placeholder:theme-text-muted focus:outline-none focus:border-indigo-500 font-mono select-text"
                />
              </div>
            </div>
          </div>

          <hr className="theme-border" />

          {/* Section: In-App Update Check */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-cyan-500 uppercase tracking-wider flex items-center gap-2">
              <Download className="w-4 h-4" /> Update Check
            </h3>
            <div>
              <label className="block text-xs font-bold theme-text-main mb-1.5">
                Sumber Update (GitHub repo / version.json URL)
              </label>
              <input
                type="text"
                placeholder="https://github.com/username/api-monitor"
                value={(settings as any).updateCheckUrl || ''}
                onChange={(e) => setSettings({ ...settings, updateCheckUrl: e.target.value } as any)}
                autoComplete="off"
                spellCheck={false}
                className="w-full theme-bg-input border theme-border rounded-xl px-3.5 py-2.5 text-xs theme-text-main placeholder:theme-text-muted focus:outline-none focus:border-cyan-500 font-mono select-text"
              />
              <p className="text-[10px] theme-text-muted mt-1">
                Isi repo GitHub (pakai GitHub Releases, APK sebagai asset) atau URL version.json
                berformat {'{ "version": "1.1.0", "url": "...apk", "notes": "..." }'}.
                Kosongkan untuk menonaktifkan.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const allowed = await canInstallApks();
                    if (allowed) {
                      setInstallPermNote('Izin install sudah aktif — update dapat berjalan.');
                      setTimeout(() => setInstallPermNote(null), 4000);
                      return;
                    }
                    openInstallSettings().catch(() => {});
                  } catch {
                    openInstallSettings().catch(() => {});
                  }
                }}
                className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition shadow-md"
              >
                Atur izin install APK
              </button>
              <span className="text-[10px] theme-text-muted">
                Buka layar "Install unknown apps" untuk app ini secara langsung.
              </span>
            </div>
            {installPermNote && (
              <div className="px-3 py-2 rounded-lg text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300">
                {installPermNote}
              </div>
            )}
          </div>

          <hr className="theme-border" />

          {/* Section 3: WeizeRouter Token Portal */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-amber-500 uppercase tracking-wider flex items-center gap-2">
              <Coins className="w-4 h-4" /> WeizeRouter Token Portal
            </h3>

            <div>
              <label className="block text-xs font-bold theme-text-main mb-1.5">Portal ID</label>
              <input
                type="text"
                placeholder="df9670a96396c0034d46a806becb5670ce0b8b6ea0d1fdf9e69d486112289e45"
                value={(settings as any).weizeRouterPortalId || ''}
                onChange={(e) => setSettings({ ...settings, weizeRouterPortalId: e.target.value } as any)}
                autoComplete="off"
                spellCheck={false}
                className="w-full theme-bg-input border theme-border rounded-xl px-3.5 py-2.5 text-xs theme-text-main placeholder:theme-text-muted focus:outline-none focus:border-amber-500 font-mono select-text"
              />
              <p className="text-[10px] theme-text-muted mt-1">
                ID dari URL portal WeizeRouter: weizerouter.web.id/portal?id=<strong>ID_ANDA</strong>
              </p>
            </div>
          </div>

          {/* Test Result Feedback Badge */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                testResult.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              )}
              <div>
                <span className="font-bold block">{testResult.success ? 'Test Successful' : 'Test Failed'}</span>
                <span className="font-mono text-[11px]">{testResult.message}</span>
              </div>
            </div>
          )}

          {saveSuccess && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs flex items-center gap-2 font-semibold">
              <CheckCircle2 className="w-4 h-4" />
              Settings saved successfully!
            </div>
          )}

          {/* Modal Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t theme-border">
            <button
              type="button"
              onClick={handleTestWebhook}
              disabled={testing || (!settings.webhookUrl && !settings.telegramBotToken)}
              className="px-4 py-2 text-xs font-bold theme-bg-subtle hover:opacity-80 theme-text-main border theme-border disabled:opacity-50 rounded-xl transition-all flex items-center gap-2"
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" /> : <Send className="w-3.5 h-3.5 text-indigo-500" />}
              Test Webhook
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold theme-text-muted hover:theme-text-main transition-colors"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
