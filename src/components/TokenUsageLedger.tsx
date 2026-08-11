import React, { useState, useEffect, useMemo } from 'react';
import { WeizeRouterUsageEntry, WeizeRouterData } from '../types';
import { Coins, RefreshCw, Clock, Zap, ArrowUpDown, ArrowUp, ArrowDown, Search, X } from 'lucide-react';

function parseUTC(utcStr: string): Date {
  return new Date(utcStr.replace(' ', 'T') + 'Z');
}

function toWIB(utcStr: string): string {
  return parseUTC(utcStr).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function formatNumber(n: number): string {
  return n.toLocaleString('id-ID');
}

type SortKey = 'waktu' | 'model' | 'status' | 'raw_total_tokens' | 'billing_multiplier' | 'wallet_debit_tokens' | 'estimated_rupiah';
type SortDir = 'asc' | 'desc';

function getSortValue(entry: WeizeRouterUsageEntry, key: SortKey): number | string {
  switch (key) {
    case 'waktu': return parseUTC(entry.waktu).getTime();
    case 'model': return entry.model;
    case 'status': return entry.status;
    case 'raw_total_tokens': return entry.raw_total_tokens;
    case 'billing_multiplier': return entry.billing_multiplier;
    case 'wallet_debit_tokens': return entry.wallet_debit_tokens;
    case 'estimated_rupiah': return entry.estimated_rupiah;
  }
}

export const TokenUsageLedger: React.FC = () => {
  const [data, setData] = useState<WeizeRouterData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>('waktu');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterModel, setFilterModel] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'Berhasil' | 'Gagal'>('all');

  const fetchUsage = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/weizerouter/usage?page=1&page_size=200');
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Gagal mengambil data');
        return;
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsage();
    const timer = setInterval(fetchUsage, 60000);
    return () => clearInterval(timer);
  }, []);

  const allItems = data?.usage?.items || data?.recent_requests || [];

  const latestTimestamp = useMemo(() => {
    if (allItems.length === 0) return 0;
    return Math.max(...allItems.map((e) => parseUTC(e.waktu).getTime()));
  }, [allItems]);

  const recentEntries = useMemo(() => {
    if (latestTimestamp === 0) return [];
    const cutoff = latestTimestamp - 60 * 60 * 1000;
    return allItems.filter((e) => parseUTC(e.waktu).getTime() >= cutoff);
  }, [allItems, latestTimestamp]);

  const uniqueModels = useMemo(() => {
    const models = new Set(recentEntries.map((e) => e.model));
    return [...models].sort();
  }, [recentEntries]);

  const filtered = useMemo(() => {
    return recentEntries.filter((e) => {
      if (filterModel && e.model !== filterModel) return false;
      if (filterStatus !== 'all') {
        if (filterStatus === 'Berhasil' && e.status !== 'Berhasil') return false;
        if (filterStatus === 'Gagal' && e.status === 'Berhasil') return false;
      }
      return true;
    });
  }, [recentEntries, filterModel, filterStatus]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalDebit = filtered.reduce((sum, e) => sum + e.wallet_debit_tokens, 0);
  const totalRupiah = filtered.reduce((sum, e) => sum + e.estimated_rupiah, 0);
  const totalRaw = filtered.reduce((sum, e) => sum + e.raw_total_tokens, 0);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'waktu' ? 'desc' : 'asc');
    }
  };

  const SortIcon: React.FC<{ col: SortKey }> = ({ col }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 text-amber-500" />
      : <ArrowDown className="w-3 h-3 text-amber-500" />;
  };

  const latestWIB = latestTimestamp
    ? new Date(latestTimestamp).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    : '';

  if (error) {
    return (
      <div className="theme-bg-card border theme-border rounded-2xl p-5 shadow-sm theme-text-main">
        <div className="flex items-center space-x-3 mb-3">
          <div className="p-2.5 bg-amber-50 dark:bg-amber-950/80 border border-amber-200 dark:border-amber-800 rounded-xl">
            <Coins className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h2 className="text-base font-extrabold theme-text-main">Token Usage Ledger</h2>
            <p className="text-xs theme-text-muted font-medium">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="theme-bg-card border theme-border rounded-2xl p-5 shadow-sm space-y-4 transition-colors theme-text-main">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b theme-border pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-amber-50 dark:bg-amber-950/80 border border-amber-200 dark:border-amber-800 rounded-xl">
            <Coins className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h2 className="text-base font-extrabold theme-text-main flex items-center gap-2">
              <span>Token Usage Ledger</span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-800">
                {filtered.length} / {recentEntries.length} requests
              </span>
            </h2>
            <p className="text-xs theme-text-muted font-medium">
              1 jam dari data terakhir ({latestWIB} WIB) — klik header kolom untuk sort
            </p>
          </div>
        </div>

        <button
          onClick={fetchUsage}
          disabled={loading}
          className="px-3.5 py-1.5 rounded-xl text-xs font-bold theme-bg-subtle hover:opacity-80 theme-text-main border theme-border transition flex items-center space-x-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-amber-500 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="theme-bg-subtle border theme-border rounded-xl p-3">
            <div className="text-[10px] font-bold theme-text-muted uppercase flex items-center gap-1">
              <Coins className="w-3 h-3" /> Sisa Token
            </div>
            <div className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
              {formatNumber(data.token_remaining)}
            </div>
            <div className="text-[10px] theme-text-muted">{data.remaining_percent.toFixed(1)}% tersisa</div>
          </div>
          <div className="theme-bg-subtle border theme-border rounded-xl p-3">
            <div className="text-[10px] font-bold theme-text-muted uppercase flex items-center gap-1">
              <Zap className="w-3 h-3" /> Debit (filtered)
            </div>
            <div className="text-sm font-extrabold text-amber-600 dark:text-amber-400 mt-1">
              {formatNumber(totalDebit)}
            </div>
            <div className="text-[10px] theme-text-muted">{filtered.length} requests</div>
          </div>
          <div className="theme-bg-subtle border theme-border rounded-xl p-3">
            <div className="text-[10px] font-bold theme-text-muted uppercase flex items-center gap-1">
              <Clock className="w-3 h-3" /> Biaya (filtered)
            </div>
            <div className="text-sm font-extrabold text-rose-600 dark:text-rose-400 mt-1">
              Rp{totalRupiah.toFixed(2)}
            </div>
          </div>
          <div className="theme-bg-subtle border theme-border rounded-xl p-3">
            <div className="text-[10px] font-bold theme-text-muted uppercase flex items-center gap-1">
              <Coins className="w-3 h-3" /> Biaya Hari Ini
            </div>
            <div className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">
              Rp{formatNumber(Math.round(data.value_summary.today_rupiah))}
            </div>
            <div className="text-[10px] theme-text-muted">{formatNumber(data.value_summary.today_tokens)} token</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="relative">
          <select
            value={filterModel}
            onChange={(e) => setFilterModel(e.target.value)}
            className="theme-bg-input border theme-border rounded-lg pl-2.5 pr-7 py-1.5 text-xs theme-text-main font-mono focus:outline-none focus:border-amber-500 appearance-none cursor-pointer"
          >
            <option value="">Semua model</option>
            {uniqueModels.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <ArrowDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 theme-text-muted pointer-events-none" />
        </div>

        <div className="flex items-center space-x-1 theme-bg-subtle p-0.5 border theme-border rounded-lg">
          {(['all', 'Berhasil', 'Gagal'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-2.5 py-1 rounded-md font-bold text-[11px] transition ${
                filterStatus === s
                  ? s === 'Berhasil'
                    ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                    : s === 'Gagal'
                    ? 'bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-800'
                    : 'theme-bg-card theme-text-main shadow-sm border theme-border'
                  : 'theme-text-muted hover:theme-text-main border border-transparent'
              }`}
            >
              {s === 'all' ? 'Semua' : s}
            </button>
          ))}
        </div>

        {(filterModel || filterStatus !== 'all') && (
          <button
            onClick={() => { setFilterModel(''); setFilterStatus('all'); }}
            className="px-2 py-1 rounded-lg text-[11px] font-bold theme-text-muted hover:text-rose-500 transition flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Reset
          </button>
        )}
      </div>

      {/* Table */}
      {recentEntries.length === 0 ? (
        <div className="p-8 text-center theme-text-muted theme-bg-subtle rounded-2xl border theme-border">
          <Clock className="w-8 h-8 text-amber-500 mx-auto mb-2" />
          <p className="font-bold theme-text-main text-sm">Tidak ada data pemakaian</p>
          <p className="text-xs theme-text-muted mt-1 font-medium">Data akan muncul saat ada request ke WeizeRouter.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="theme-bg-subtle border-b theme-border">
                {([
                  ['waktu', 'Waktu WIB', 'left'],
                  ['model', 'Model', 'left'],
                  ['status', 'Status', 'left'],
                  ['raw_total_tokens', 'Token Mentah', 'right'],
                  ['billing_multiplier', 'Multiplier', 'right'],
                  ['wallet_debit_tokens', 'Token Tertagih', 'right'],
                  ['estimated_rupiah', 'Est. Biaya', 'right'],
                ] as [SortKey, string, string][]).map(([key, label, align]) => (
                  <th
                    key={key}
                    onClick={() => handleSort(key)}
                    className={`text-${align} px-3 py-2 font-bold theme-text-muted cursor-pointer hover:text-amber-500 transition select-none whitespace-nowrap`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      <SortIcon col={key} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry, i) => (
                <tr key={entry.request_id || i} className="border-b theme-border hover:theme-bg-subtle transition">
                  <td className="px-3 py-2.5 font-mono theme-text-muted whitespace-nowrap">{toWIB(entry.waktu)}</td>
                  <td className="px-3 py-2.5">
                    <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{entry.model}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                      entry.status === 'Berhasil'
                        ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800'
                        : 'bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-800'
                    }`}>
                      {entry.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono theme-text-main">{formatNumber(entry.raw_total_tokens)}</td>
                  <td className="px-3 py-2.5 text-right font-mono theme-text-muted">x{entry.billing_multiplier}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold theme-text-main">{formatNumber(entry.wallet_debit_tokens)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-amber-600 dark:text-amber-400">
                    Rp{entry.estimated_rupiah.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="theme-bg-subtle border-t-2 theme-border font-bold">
                <td colSpan={3} className="px-3 py-2.5 theme-text-muted">
                  Total{filterModel || filterStatus !== 'all' ? ' (filtered)' : ''}
                </td>
                <td className="px-3 py-2.5 text-right font-mono theme-text-main">{formatNumber(totalRaw)}</td>
                <td className="px-3 py-2.5"></td>
                <td className="px-3 py-2.5 text-right font-mono theme-text-main">{formatNumber(totalDebit)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-amber-600 dark:text-amber-400">
                  Rp{totalRupiah.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};
