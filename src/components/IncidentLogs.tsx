import React, { useState, useEffect } from 'react';
import { IncidentLog } from '../types';
import { AlertCircle, AlertTriangle, Info, Search, RefreshCw, ShieldAlert } from 'lucide-react';

export const IncidentLogs: React.FC = () => {
  const [incidents, setIncidents] = useState<IncidentLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');

  const fetchIncidents = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/incidents?limit=100');
      if (res.ok) {
        const data = await res.json();
        setIncidents(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
    // Refresh incident logs every 20s
    const timer = setInterval(fetchIncidents, 20000);
    return () => clearInterval(timer);
  }, []);

  const filteredIncidents = incidents.filter((inc) => {
    const matchesSearch =
      inc.targetName.toLowerCase().includes(search.toLowerCase()) ||
      inc.title.toLowerCase().includes(search.toLowerCase()) ||
      inc.details.toLowerCase().includes(search.toLowerCase()) ||
      (inc.modelId && inc.modelId.toLowerCase().includes(search.toLowerCase()));

    const matchesSeverity = severityFilter === 'all' || inc.severity === severityFilter;

    return matchesSearch && matchesSeverity;
  });

  return (
    <div className="theme-bg-card border theme-border rounded-2xl p-5 shadow-sm space-y-4 transition-colors theme-text-main">
      {/* Title & Actions Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b theme-border pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800 rounded-xl">
            <ShieldAlert className="w-5 h-5 text-rose-500" />
          </div>
          <div>
            <h2 className="text-base font-extrabold theme-text-main flex items-center gap-2">
              <span>Incident &amp; Error Stream</span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-800">
                {filteredIncidents.length} Events
              </span>
            </h2>
            <p className="text-xs theme-text-muted font-medium">
              Real-time feed of HTTP errors, LLM timeout events, and failure diagnostics
            </p>
          </div>
        </div>

        <button
          onClick={fetchIncidents}
          disabled={loading}
          className="px-3.5 py-1.5 rounded-xl text-xs font-bold theme-bg-subtle hover:opacity-80 theme-text-main border theme-border transition flex items-center space-x-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-cyan-500 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Feed</span>
        </button>
      </div>

      {/* Toolbar Search & Severity Filter */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 theme-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search incident titles, errors, models..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full theme-bg-input border theme-border rounded-xl pl-9 pr-3 py-1.5 theme-text-main placeholder:theme-text-muted focus:outline-none focus:border-cyan-500 transition font-medium"
          />
        </div>

        <div className="flex items-center space-x-1 theme-bg-subtle p-1 border theme-border rounded-xl">
          <button
            onClick={() => setSeverityFilter('all')}
            className={`px-3 py-1 rounded-lg font-bold text-xs transition ${
              severityFilter === 'all'
                ? 'theme-bg-card theme-text-main shadow-sm border theme-border'
                : 'theme-text-muted hover:theme-text-main'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setSeverityFilter('critical')}
            className={`px-3 py-1 rounded-lg font-bold text-xs transition ${
              severityFilter === 'critical'
                ? 'bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-800'
                : 'theme-text-muted hover:text-rose-500'
            }`}
          >
            Critical
          </button>
          <button
            onClick={() => setSeverityFilter('warning')}
            className={`px-3 py-1 rounded-lg font-bold text-xs transition ${
              severityFilter === 'warning'
                ? 'bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-800'
                : 'theme-text-muted hover:text-amber-500'
            }`}
          >
            Warning
          </button>
        </div>
      </div>

      {/* Incident Stream */}
      {filteredIncidents.length === 0 ? (
        <div className="p-10 text-center theme-text-muted theme-bg-subtle rounded-2xl border theme-border">
          <Info className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="font-bold theme-text-main text-sm">No Active Incidents Reported</p>
          <p className="text-xs theme-text-muted mt-1 font-medium">All monitored endpoints and auto-tested LLM models are healthy.</p>
        </div>
      ) : (
        <div className="space-y-3 pr-1">
          {filteredIncidents.map((inc) => {
            const isCritical = inc.severity === 'critical';
            return (
              <div
                key={inc.id}
                className={`p-4 rounded-xl border-l-4 border transition space-y-2 ${
                  isCritical
                    ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/80 border-l-rose-500 text-rose-900 dark:text-rose-200'
                    : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60 border-l-amber-500 text-amber-900 dark:text-amber-200'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2">
                    {isCritical ? (
                      <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    )}
                    <span className="font-extrabold theme-text-main">{inc.targetName}</span>
                    {inc.modelId && (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900">
                        {inc.modelId}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-mono theme-text-muted font-medium">
                    {new Date(inc.timestamp).toLocaleString()}
                  </span>
                </div>

                <p className="font-bold text-xs theme-text-main">{inc.title}</p>
                <p className="font-mono text-[11px] theme-text-main theme-bg-card p-2.5 rounded-xl border theme-border break-words">
                  {inc.details}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
