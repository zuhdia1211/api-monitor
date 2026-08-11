import React, { useState } from 'react';
import { ApiTarget, getProviderLabel } from '../types';
import { TargetCard } from './TargetCard';
import {
  Search,
  Plus,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  SlidersHorizontal,
  LayoutGrid,
  Table as TableIcon,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Columns,
  Play,
  ExternalLink,
  Sliders,
  Trash2,
  Square,
  PauseCircle,
} from 'lucide-react';


interface TargetListProps {
  targets: ApiTarget[];
  onCheckNow: (id: string) => void;
  onCancelCheck: (id: string) => void;
  onInspect: (target: ApiTarget) => void;
  onDelete: (id: string) => void;
  onEdit: (target: ApiTarget) => void;
  onAddClick: () => void;
  checkingIds: Set<string>;
}


type SortField = 'name' | 'type' | 'status' | 'latency' | 'uptime' | 'lastCheck';
type SortOrder = 'asc' | 'desc';

export const TargetList: React.FC<TargetListProps> = ({
  targets,
  onCheckNow,
  onCancelCheck,
  onInspect,
  onDelete,
  onEdit,
  onAddClick,
  checkingIds,
}) => {

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter] = useState<'all' | 'openai'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'healthy' | 'degraded' | 'down'>('all');

  // View Mode: 'grid' | 'table'
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');

  // Sorting State
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // Dynamic Column Selector State
  const [columnsPopoverOpen, setColumnsPopoverOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState({
    name: true,
    type: true,
    status: true,
    latency: true,
    uptime: true,
    models: true,
    lastCheck: true,
    actions: true,
  });

  const toggleColumn = (key: keyof typeof visibleColumns) => {
    setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const filteredTargets = targets.filter((target) => {
    const matchesSearch =
      target.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (target.url && target.url.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (target.baseUrl && target.baseUrl.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType = typeFilter === 'all' || target.type === typeFilter;

    const currentStatus = target.lastCheckResult?.overallStatus || 'unknown';
    const matchesStatus = statusFilter === 'all' || currentStatus === statusFilter;

    return matchesSearch && matchesType && matchesStatus;
  });

  // Apply sorting
  const sortedTargets = [...filteredTargets].sort((a, b) => {
    let aVal: any;
    let bVal: any;

    if (sortField === 'name') {
      aVal = a.name.toLowerCase();
      bVal = b.name.toLowerCase();
    } else if (sortField === 'type') {
      aVal = a.type;
      bVal = b.type;
    } else if (sortField === 'status') {
      const order = { healthy: 1, degraded: 2, down: 3, unknown: 4 };
      aVal = order[a.lastCheckResult?.overallStatus || 'unknown'];
      bVal = order[b.lastCheckResult?.overallStatus || 'unknown'];
    } else if (sortField === 'latency') {
      aVal = a.lastCheckResult?.latencyMs ?? 999999;
      bVal = b.lastCheckResult?.latencyMs ?? 999999;
    } else if (sortField === 'uptime') {
      aVal = a.uptimePercent ?? 100;
      bVal = b.uptimePercent ?? 100;
    } else if (sortField === 'lastCheck') {
      aVal = a.lastCheckedAt ? new Date(a.lastCheckedAt).getTime() : 0;
      bVal = b.lastCheckedAt ? new Date(b.lastCheckedAt).getTime() : 0;
    }

    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 theme-text-muted" />;
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-cyan-500" />
    ) : (
      <ArrowDown className="w-3 h-3 text-cyan-500" />
    );
  };

  return (
    <div className="space-y-6">
      {/* Search & Filters Toolbar */}
      <div className="theme-bg-card border theme-border rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 transition-colors">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 theme-text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search endpoints, URLs, models..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full theme-bg-input border theme-border rounded-xl pl-10 pr-4 py-2 text-xs theme-text-main placeholder:theme-text-muted focus:outline-none focus:border-cyan-500 transition font-medium"
          />
        </div>

        {/* Filter Pills & View Controls */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Status Filters */}
          <div className="theme-bg-subtle p-1 border theme-border rounded-xl flex items-center text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-bold text-xs transition ${
                statusFilter === 'all'
                  ? 'theme-bg-card theme-text-main shadow-sm border theme-border'
                  : 'theme-text-muted hover:theme-text-main'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('healthy')}
              className={`px-2.5 py-1 rounded-lg font-bold text-xs transition flex items-center space-x-1 ${
                statusFilter === 'healthy'
                  ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                  : 'theme-text-muted hover:text-emerald-500'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Healthy</span>
            </button>
            <button
              onClick={() => setStatusFilter('degraded')}
              className={`px-2.5 py-1 rounded-lg font-bold text-xs transition flex items-center space-x-1 ${
                statusFilter === 'degraded'
                  ? 'bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-800'
                  : 'theme-text-muted hover:text-amber-500'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span>Degraded</span>
            </button>
            <button
              onClick={() => setStatusFilter('down')}
              className={`px-2.5 py-1 rounded-lg font-bold text-xs transition flex items-center space-x-1 ${
                statusFilter === 'down'
                  ? 'bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-800'
                  : 'theme-text-muted hover:text-rose-500'
              }`}
            >
              <XCircle className="w-3.5 h-3.5 text-rose-500" />
              <span>Down</span>
            </button>
          </div>

          {/* View Mode Switcher */}
          <div className="theme-bg-subtle p-1 border theme-border rounded-xl flex items-center text-xs">
            <button
              onClick={() => setViewMode('table')}
              title="Dynamic Table View"
              className={`p-1.5 rounded-lg transition ${
                viewMode === 'table'
                  ? 'theme-bg-card text-cyan-600 dark:text-cyan-400 shadow-sm border theme-border'
                  : 'theme-text-muted hover:theme-text-main'
              }`}
            >
              <TableIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              title="Grid Card View"
              className={`p-1.5 rounded-lg transition ${
                viewMode === 'grid'
                  ? 'theme-bg-card text-cyan-600 dark:text-cyan-400 shadow-sm border theme-border'
                  : 'theme-text-muted hover:theme-text-main'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          {/* Dynamic Column Visibility Selector Dropdown */}
          {viewMode === 'table' && (
            <div className="relative">
              <button
                onClick={() => setColumnsPopoverOpen(!columnsPopoverOpen)}
                className="flex items-center space-x-1.5 px-3 py-1.5 theme-bg-subtle border theme-border rounded-xl text-xs theme-text-main hover:opacity-80 transition font-medium"
              >
                <Columns className="w-3.5 h-3.5 text-indigo-500" />
                <span>Columns</span>
              </button>

              {columnsPopoverOpen && (
                <div className="absolute right-0 mt-2 w-48 theme-bg-card border theme-border rounded-xl shadow-2xl p-3 z-40 space-y-2 text-xs theme-text-main">
                  <div className="font-bold text-[11px] uppercase tracking-wider theme-text-muted border-b theme-border pb-1.5 mb-1">
                    Toggle Table Columns
                  </div>
                  {Object.keys(visibleColumns).map((colKey) => (
                    <label key={colKey} className="flex items-center space-x-2 capitalize cursor-pointer hover:theme-text-main">
                      <input
                        type="checkbox"
                        checked={(visibleColumns as any)[colKey]}
                        onChange={() => toggleColumn(colKey as any)}
                        className="rounded theme-border theme-bg-input text-indigo-500 focus:ring-0"
                      />
                      <span>{colKey === 'lastCheck' ? 'Last Checked' : colKey}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Target Content: Grid Cards vs Dynamic Data Table */}
      {sortedTargets.length === 0 ? (
        <div className="theme-bg-card border theme-border rounded-2xl p-12 text-center shadow-sm">
          <SlidersHorizontal className="w-10 h-10 theme-text-muted mx-auto mb-3" />
          <h3 className="text-base font-bold theme-text-main">No Endpoints Found</h3>
          <p className="text-xs theme-text-muted mt-1 max-w-sm mx-auto font-medium">
            {targets.length === 0
              ? 'No endpoints are currently monitored. Click below to add your first LLM / OpenAI-compatible endpoint.'
              : 'No endpoints match your current filter or search criteria.'}
          </p>
          <button
            onClick={onAddClick}
            className="mt-4 px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition inline-flex items-center space-x-1.5 shadow-lg shadow-cyan-500/20"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Add New Endpoint</span>
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 gap-4">
          {sortedTargets.map((target) => (
              <TargetCard
                key={target.id}
                target={target}
                onCheckNow={onCheckNow}
                onCancelCheck={onCancelCheck}
                onInspect={onInspect}
                onDelete={onDelete}
                onEdit={onEdit}
                isChecking={checkingIds.has(target.id)}
              />

          ))}
        </div>
      ) : (
        /* DYNAMIC DATA TABLE VIEW */
        <div className="theme-bg-card border theme-border rounded-2xl overflow-hidden shadow-sm transition-colors">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="theme-bg-subtle border-b theme-border theme-text-muted font-mono text-[11px] uppercase tracking-wider select-none">
                  {visibleColumns.name && (
                    <th className="p-3.5 cursor-pointer hover:theme-text-main" onClick={() => handleSort('name')}>
                      <div className="flex items-center space-x-1.5">
                        <span>Target Node</span>
                        {renderSortIcon('name')}
                      </div>
                    </th>
                  )}
                  {visibleColumns.type && (
                    <th className="p-3.5 cursor-pointer hover:theme-text-main" onClick={() => handleSort('type')}>
                      <div className="flex items-center space-x-1.5">
                        <span>Type</span>
                        {renderSortIcon('type')}
                      </div>
                    </th>
                  )}
                  {visibleColumns.status && (
                    <th className="p-3.5 cursor-pointer hover:theme-text-main" onClick={() => handleSort('status')}>
                      <div className="flex items-center space-x-1.5">
                        <span>Health Status</span>
                        {renderSortIcon('status')}
                      </div>
                    </th>
                  )}
                  {visibleColumns.latency && (
                    <th className="p-3.5 cursor-pointer hover:theme-text-main" onClick={() => handleSort('latency')}>
                      <div className="flex items-center space-x-1.5">
                        <span>Latency</span>
                        {renderSortIcon('latency')}
                      </div>
                    </th>
                  )}
                  {visibleColumns.uptime && (
                    <th className="p-3.5 cursor-pointer hover:theme-text-main" onClick={() => handleSort('uptime')}>
                      <div className="flex items-center space-x-1.5">
                        <span>Uptime</span>
                        {renderSortIcon('uptime')}
                      </div>
                    </th>
                  )}
                  {visibleColumns.models && <th className="p-3.5">Discovered Models</th>}
                  {visibleColumns.lastCheck && (
                    <th className="p-3.5 cursor-pointer hover:theme-text-main" onClick={() => handleSort('lastCheck')}>
                      <div className="flex items-center space-x-1.5">
                        <span>Last Checked</span>
                        {renderSortIcon('lastCheck')}
                      </div>
                    </th>
                  )}
                  {visibleColumns.actions && <th className="p-3.5 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y theme-border font-sans">
                {sortedTargets.map((t) => {
                  const isChecking = checkingIds.has(t.id);
                  const last = t.lastCheckResult;
                  const status = last?.overallStatus || 'unknown';

                  const badgeColors = {
                    healthy: 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800',
                    degraded: 'bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-800',
                    down: 'bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-800',
                    unknown: 'theme-bg-subtle theme-text-muted theme-border',
                  };

                  return (
                    <tr key={t.id} className="hover:theme-bg-subtle transition group">
                      {visibleColumns.name && (
                        <td className="p-3.5 max-w-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-extrabold theme-text-main truncate">{t.name}</span>
                            {t.enabled === false && (
                              <span
                                title="Auto-checks are disabled for this target"
                                className="inline-flex items-center gap-1 flex-shrink-0 text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded-md theme-bg-subtle theme-text-muted border theme-border"
                              >
                                <PauseCircle className="w-3 h-3" />
                                Paused
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[11px] theme-text-muted truncate max-w-xs">
                            {t.baseUrl || t.url}
                          </div>
                        </td>
                      )}

                      {visibleColumns.type && (
                        <td className="p-3.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold uppercase theme-bg-subtle theme-text-main border theme-border">
                            <Cpu className="w-3 h-3 text-indigo-500" />
                            {getProviderLabel(t.provider)}
                          </span>
                        </td>
                      )}

                      {visibleColumns.status && (
                        <td className="p-3.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-mono font-bold border ${badgeColors[status]}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                status === 'healthy'
                                  ? 'bg-emerald-500'
                                  : status === 'degraded'
                                  ? 'bg-amber-500'
                                  : status === 'down'
                                  ? 'bg-rose-500'
                                  : 'bg-slate-400'
                              } ${isChecking ? 'animate-ping' : ''}`}
                            />
                            <span>{isChecking ? 'Testing...' : status}</span>
                          </span>
                        </td>
                      )}

                      {visibleColumns.latency && (
                        <td className="p-3.5 whitespace-nowrap font-mono font-semibold theme-text-main">
                          {last?.latencyMs !== undefined ? `${last.latencyMs} ms` : '—'}
                        </td>
                      )}

                      {visibleColumns.uptime && (
                        <td className="p-3.5 whitespace-nowrap font-mono font-bold">
                          <span className={(t.uptimePercent || 100) >= 90 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                            {t.uptimePercent !== undefined ? `${t.uptimePercent}%` : '100%'}
                          </span>
                        </td>
                      )}

                      {visibleColumns.models && (
                        <td className="p-3.5 whitespace-nowrap">
                          {t.type === 'openai' && last?.modelResults ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-900/60 text-indigo-600 dark:text-indigo-300 font-mono text-[11px]">
                              {last.modelResults.filter((m) => m.status === 'operational').length} / {last.modelResults.length} Models
                            </span>
                          ) : (
                            <span className="theme-text-muted font-mono text-[11px]">—</span>
                          )}
                        </td>
                      )}

                      {visibleColumns.lastCheck && (
                        <td className="p-3.5 whitespace-nowrap font-mono theme-text-muted text-[11px]">
                          {t.lastCheckedAt ? new Date(t.lastCheckedAt).toLocaleTimeString() : 'Never'}
                        </td>
                      )}

                      {visibleColumns.actions && (
                        <td className="p-3.5 whitespace-nowrap text-right space-x-1">
                          {isChecking ? (
                            <button
                              onClick={() => onCancelCheck(t.id)}
                              title="Stop Testing"
                            className="p-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:theme-bg-subtle transition"
                            >
                              <Square className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => onCheckNow(t.id)}
                              title="Test Endpoint Now"
                            className="p-1.5 rounded-lg text-cyan-600 dark:text-cyan-400 hover:theme-bg-subtle transition"
                            >
                              <Play className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => onInspect(t)}
                            title="View Analytics & Logs"
                            className="p-1.5 rounded-lg text-indigo-600 dark:text-indigo-400 hover:theme-bg-subtle transition"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onEdit(t)}
                            title="Edit Target Configuration"
                            className="p-1.5 rounded-lg theme-text-muted hover:theme-text-main hover:theme-bg-subtle transition"
                          >
                            <Sliders className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDelete(t.id)}
                            title="Delete Target"
                            className="p-1.5 rounded-lg theme-text-muted hover:text-rose-500 hover:theme-bg-subtle transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
