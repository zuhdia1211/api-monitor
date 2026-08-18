export type TargetType = 'openai';

/** Matches the ids in server/providers.ts PROVIDER_PRESETS. */
export type ProviderId = 'openai' | 'anthropic' | 'deepseek' | 'mimo' | 'openai-compatible';

/**
 * Short display names for the presets in server/providers.ts — the full labels
 * ("OpenAI (ChatGPT)") are too long for the compact badges in list views.
 */
export const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  mimo: 'MiMo',
  'openai-compatible': 'Compatible',
};

/** Targets created before providers existed have no id, so default to custom. */
export function getProviderLabel(provider?: ProviderId): string {
  return (provider && PROVIDER_LABELS[provider]) || PROVIDER_LABELS['openai-compatible'];
}


export type OverallStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

/**
 * `testing` is a transient, never-persisted status used while a model probe is
 * still in flight, so the UI can render every discovered model immediately and
 * flip each row the moment its own result lands.
 *
 * `timeout` means the model did not answer within the per-model budget
 * configured in the header (Check Timeout).
 */
export type ModelStatusType =
  | 'operational'
  | 'error'
  | 'unreachable'
  | 'auth_failed'
  | 'timeout'
  | 'testing';

/** Shared presentation for every model status so all views stay in sync. */
export const MODEL_STATUS_META: Record<
  ModelStatusType,
  { label: string; tone: 'good' | 'bad' | 'warn' | 'idle'; badge: string; dot: string }
> = {
  operational: {
    label: 'operational',
    tone: 'good',
    badge:
      'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800',
    dot: 'bg-emerald-500',
  },
  timeout: {
    label: 'timeout',
    tone: 'warn',
    badge:
      'bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-800',
    dot: 'bg-amber-500',
  },
  auth_failed: {
    label: 'auth_failed',
    tone: 'bad',
    badge:
      'bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-800',
    dot: 'bg-rose-500',
  },
  unreachable: {
    label: 'unreachable',
    tone: 'bad',
    badge:
      'bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-800',
    dot: 'bg-rose-500',
  },
  error: {
    label: 'error',
    tone: 'bad',
    badge:
      'bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-800',
    dot: 'bg-rose-500',
  },
  testing: {
    label: 'testing...',
    tone: 'idle',
    badge:
      'bg-cyan-50 dark:bg-cyan-950/80 text-cyan-600 dark:text-cyan-400 border-cyan-300 dark:border-cyan-800',
    dot: 'bg-cyan-500',
  },
};

export function getModelStatusMeta(status: string) {
  return MODEL_STATUS_META[status as ModelStatusType] || MODEL_STATUS_META.error;
}

/** A model still being probed has no verdict yet, so it is neither pass nor fail. */
export function isSettledStatus(status: string): boolean {
  return status !== 'testing';
}


export interface ModelTestResult {
  modelId: string;
  status: ModelStatusType;
  latencyMs: number;
  httpStatus: number;
  responseSnippet?: string;
  errorMessage?: string;
  testedAt: string;
  /**
   * When this model's own request opened. Only present while `status` is
   * `testing`, so the UI can count up from it — models wait their turn in the
   * concurrency queue, so the check's own start time would overstate how long
   * any individual model has actually been running.
   */
  startedAt?: string;
}


export interface HealthCheckResult {
  id: string;
  targetId: string;
  timestamp: string;
  overallStatus: OverallStatus;
  latencyMs: number;
  httpStatus: number;
  discoveredModelsCount?: number;
  modelResults?: ModelTestResult[];
  errorMessage?: string;
}

/**
 * Live per-model progress for a check that is still running. Every discovered
 * model is probed in parallel, so `modelResults` is seeded with a `testing`
 * placeholder for each one and individual entries are swapped in as their own
 * request settles. That lets the UI paint the full matrix instantly and update
 * each row independently instead of waiting for the whole endpoint.
 */
export interface CheckProgress {
  targetId: string;
  phase: 'discovering' | 'testing' | 'done';
  startedAt: string;
  totalModels: number;
  completedModels: number;
  /** Models whose request is still open — drives the "testing X..." caption. */
  currentModelIds: string[];
  /** Always contains every discovered model; unsettled ones are `testing`. */
  modelResults: ModelTestResult[];
  /** Per-model budget in ms (0 = unlimited) so the UI can explain a timeout. */
  perModelTimeoutMs: number;
}


export interface ApiTarget {
  id: string;
  name: string;
  type: TargetType;
  provider?: ProviderId;
  enabled: boolean;
  url: string;
  baseUrl?: string;
  apiKey?: string;
  autoDiscoverModels?: boolean;
  testPrompt?: string;
  maxTokens?: number;
  checkIntervalSeconds: number;
  timeoutMs: number;
  lastCheckResult?: HealthCheckResult;
  /** Present only while a check is running; not persisted. */
  checkProgress?: CheckProgress;
  lastCheckedAt?: string;
  uptimePercent?: number;
  avgLatencyMs?: number;
  /** Per-endpoint WeizeRouter portal config. Overrides global settings. */
  weizeRouterPortalId?: string;
  weizeRouterBaseUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SummaryMetrics {
  totalTargets: number;
  activeTargets: number;
  healthyCount: number;
  degradedCount: number;
  downCount: number;
  totalModelsDiscovered: number;
  totalModelsOperational: number;
  totalModelsFailing: number;
  overallUptimePercent: number;
  averageLatencyMs: number;
  lastGlobalCheckAt?: string;
}

export interface IncidentLog {
  id: string;
  targetId: string;
  targetName: string;
  targetType: TargetType;
  timestamp: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  details: string;
  modelId?: string;
}

export interface AppSettings {
  enableAlerts: boolean;
  webhookUrl?: string;
  webhookFormat?: 'generic' | 'slack' | 'discord';
  telegramBotToken?: string;
  telegramChatId?: string;
  alertCooldownMinutes?: number;
  /**
   * Master polling interval in seconds. 0 means "Manual only" — the background
   * scheduler stays idle and checks only run when the user triggers them.
   */
  autoRefreshInterval?: number;
  /** Global request/check budget in ms. 0 means unlimited (no timeout). */
  requestTimeoutMs?: number;
  /** WeizeRouter portal token for fetching token usage data. */
  weizeRouterPortalId?: string;
  /** Base URL for WeizeRouter API. Defaults to https://weizerouter.web.id if empty. */
  weizeRouterBaseUrl?: string;
  /**
   * URL of a hosted version.json for in-app update checks, e.g.
   * `https://example.com/api-pulse/version.json` returning
   * `{ "version": "1.1.0", "url": "https://.../app.apk", "notes": "..." }`.
   * Empty disables update checking.
   */
  updateCheckUrl?: string;
}

export interface WeizeRouterUsageEntry {
  model: string;
  waktu: string;
  status: string;
  request_id: string;
  raw_input_tokens: number;
  raw_output_tokens: number;
  raw_total_tokens: number;
  billing_multiplier: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  wallet_debit_tokens: number;
  estimated_rupiah: number;
}

export interface WeizeRouterData {
  token_total: number;
  token_used: number;
  token_remaining: number;
  used_percent: number;
  remaining_percent: number;
  status: string;
  recent_requests: WeizeRouterUsageEntry[];
  usage: {
    items: WeizeRouterUsageEntry[];
    page: number;
    page_size: number;
    total: number;
    pages: number;
  };
  value_summary: {
    today_tokens: number;
    today_rupiah: number;
    seven_day_tokens: number;
    seven_day_rupiah: number;
  };
}


export interface WebhookTestResult {
  success: boolean;
  message: string;
  statusCode?: number;
}

export interface ChatSession {
  id: string;
  title: string;
  modelId: string;
  targetId: string;
  targetName: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  modelId?: string;
  latencyMs?: number;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  createdAt: string;
}

export interface ChatCompression {
  id: string;
  sessionId: string;
  summaryText: string;
  messagesCompressed: number;
  createdAt: string;
}
