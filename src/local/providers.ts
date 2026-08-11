import { ApiTarget, ModelTestResult } from '../types';
import { nativeFetch } from './native-fetch';


// ─────────────────────────────────────────────────────────────
// Provider registry
// ─────────────────────────────────────────────────────────────

export type ApiFormat = 'openai' | 'anthropic';

export interface ProviderPreset {
  id: string;
  label: string;
  apiFormat: ApiFormat;
  baseUrl: string;
  /** Whether the base URL is meant to be edited by the user (self-hosted / router). */
  editableBaseUrl: boolean;
  keyPlaceholder: string;
  notes?: string;
  /** Used when the provider has no usable GET /models endpoint. */
  fallbackModels?: string[];
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI (ChatGPT)',
    apiFormat: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    editableBaseUrl: false,
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    apiFormat: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    editableBaseUrl: false,
    keyPlaceholder: 'sk-ant-...',
    notes: 'Uses the native Messages API (x-api-key + anthropic-version headers).',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    apiFormat: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    editableBaseUrl: false,
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'mimo',
    label: 'MiMo (Xiaomi)',
    apiFormat: 'openai',
    baseUrl: 'https://api.mimo.ai/v1',
    editableBaseUrl: true,
    keyPlaceholder: 'API key',
    notes: 'Base URL is editable — confirm the endpoint your MiMo account was issued.',
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI-compatible / Custom',
    apiFormat: 'openai',
    baseUrl: '',
    editableBaseUrl: true,
    keyPlaceholder: 'Optional',
    notes: 'vLLM, Ollama, LM Studio, OpenRouter, WeizeRouter, and any other /v1-compatible gateway.',
  },
];

const DEFAULT_PROVIDER = 'openai-compatible';

export function getPreset(providerId?: string): ProviderPreset {
  return (
    PROVIDER_PRESETS.find((p) => p.id === providerId) ||
    PROVIDER_PRESETS.find((p) => p.id === DEFAULT_PROVIDER)!
  );
}

export function getApiFormat(target: ApiTarget): ApiFormat {
  return getPreset(target.provider).apiFormat;
}

// ─────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────

/** A timeout of 0 (or negative) means "run until the provider answers". */
export const UNLIMITED_TIMEOUT_MS = 0;

/**
 * Thrown when a request is aborted by its *own* timer rather than by the
 * caller. Without this distinction an abort from a user pressing Stop would be
 * indistinguishable from the budget running out, and both would be reported as
 * a timeout.
 */
export class RequestTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`Timed out after ${timeoutMs}ms`);
    this.name = 'RequestTimeoutError';
  }
}

export function isUnlimited(timeoutMs?: number | null): boolean {
  return timeoutMs === undefined || timeoutMs === null ? false : timeoutMs <= 0;
}

/** Normalise a target's configured budget; `undefined` falls back to 10s. */
export function resolveTimeoutMs(target: Pick<ApiTarget, 'timeoutMs'>): number {
  return target.timeoutMs ?? 10000;
}

/** Human-readable budget for error copy: 60000 → "60s", 120000 → "2m". */
export function formatBudget(ms: number): string {
  if (isUnlimited(ms)) return 'unlimited';
  if (ms >= 60000) {
    const minutes = ms / 60000;
    return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)}m`;
  }
  return `${Math.round(ms / 1000)}s`;
}

/**
 * Provider requests go through the native HTTP bridge rather than the WebView's
 * fetch. Inside the APK the WebView runs on origin `https://localhost`, so a
 * direct fetch to a provider is cross-origin and is blocked unless that provider
 * sends CORS headers — which server-side APIs generally do not. `nativeFetch`
 * issues the request from native code, where CORS does not apply.
 *
 * The timeout is enforced here so a budget expiry surfaces as
 * `RequestTimeoutError` — a distinct verdict from "the endpoint refused us" or
 * "the user hit Stop".
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number; signal?: AbortSignal }
): Promise<Response> {
  const { timeoutMs = 10000, signal: externalSignal, ...fetchOptions } = options;

  try {
    return await nativeFetch(url, { ...fetchOptions, timeoutMs, signal: externalSignal });
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new RequestTimeoutError(timeoutMs);
    throw err;
  }
}

/** Resolve the effective base URL for a target, falling back to its provider preset. */
export function resolveBaseUrl(target: ApiTarget): string {
  const preset = getPreset(target.provider);
  const raw = (target.baseUrl || target.url || preset.baseUrl || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  if (raw.endsWith('/v1') || raw.includes('/v1/')) return raw;
  return `${raw}/v1`;
}

function authHeaders(target: ApiTarget): Record<string, string> {
  if (!target.apiKey) return {};
  if (getApiFormat(target) === 'anthropic') {
    return {
      'x-api-key': target.apiKey,
      'anthropic-version': '2023-06-01',
    };
  }
  return { Authorization: `Bearer ${target.apiKey}` };
}

export interface NormalizedUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

/**
 * Pull assistant text out of a response regardless of provider shape.
 * Reasoning models put their output in `reasoning_content` (OpenAI-style)
 * or in `thinking` blocks (Anthropic-style) when `content` is empty.
 */
export function extractContent(data: any, format: ApiFormat): string | null {
  if (format === 'anthropic') {
    const blocks = Array.isArray(data?.content) ? data.content : [];
    const text = blocks
      .filter((b: any) => b?.type === 'text' && b.text)
      .map((b: any) => b.text)
      .join('');
    if (text) return text;
    const thinking = blocks
      .filter((b: any) => (b?.type === 'thinking' || b?.type === 'redacted_thinking') && (b.thinking || b.text))
      .map((b: any) => b.thinking || b.text)
      .join('');
    return thinking || null;
  }

  const msg = data?.choices?.[0]?.message;
  return msg?.content || msg?.reasoning_content || null;
}

export function normalizeUsage(data: any, format: ApiFormat): NormalizedUsage {
  if (format === 'anthropic') {
    const u = data?.usage || {};
    const input = u.input_tokens;
    const output = u.output_tokens;
    return {
      prompt_tokens: input,
      completion_tokens: output,
      total_tokens: input != null && output != null ? input + output : undefined,
    };
  }
  return data?.usage || {};
}

/** Extract a human-readable error from either provider's error envelope. */
export function extractError(data: any, rawText: string, httpStatus: number): string | null {
  const err = data?.error;
  if (err) {
    const detail = typeof err === 'string' ? err : err.message || JSON.stringify(err);
    return `HTTP ${httpStatus}: ${String(detail).substring(0, 250)}`;
  }
  if (data?.message && typeof data.message === 'string') {
    return `HTTP ${httpStatus}: ${data.message.substring(0, 250)}`;
  }
  if (rawText) return `HTTP ${httpStatus}: ${rawText.substring(0, 200)}`;
  return null;
}

// ─────────────────────────────────────────────────────────────
// Model discovery
// ─────────────────────────────────────────────────────────────

export interface ListModelsResult {
  models: string[];
  httpStatus: number;
  error?: string;
}

export async function listModels(target: ApiTarget, signal?: AbortSignal): Promise<ListModelsResult> {
  const preset = getPreset(target.provider);
  const baseUrl = resolveBaseUrl(target);
  if (!baseUrl) {
    return { models: [], httpStatus: 0, error: 'No base URL configured for this target' };
  }

  try {
    const res = await fetchWithTimeout(`${baseUrl}/models`, {
      method: 'GET',
      headers: { Accept: 'application/json', ...authHeaders(target) },
      timeoutMs: resolveTimeoutMs(target),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      // Some gateways don't expose /models — fall back to the preset list if we have one.
      if (preset.fallbackModels?.length) {
        return { models: [...preset.fallbackModels], httpStatus: res.status };
      }
      return {
        models: [],
        httpStatus: res.status,
        error: `HTTP ${res.status} on GET /v1/models: ${errText.substring(0, 200)}`,
      };
    }

    const data = await res.json();
    const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : data?.models;
    const models = Array.isArray(list)
      ? list.map((m: any) => (typeof m === 'string' ? m : m?.id)).filter(Boolean)
      : [];

    if (models.length === 0 && preset.fallbackModels?.length) {
      return { models: [...preset.fallbackModels], httpStatus: res.status };
    }
    return { models, httpStatus: res.status };
  } catch (err: any) {
    if (preset.fallbackModels?.length) {
      return { models: [...preset.fallbackModels], httpStatus: 0 };
    }
    return {
      models: [],
      httpStatus: 0,
      error:
        err.name === 'AbortError'
          ? `Timeout connecting to ${baseUrl}/models`
          : `Failed to connect to ${baseUrl}/models: ${err.message}`,
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Chat completion
// ─────────────────────────────────────────────────────────────

export interface ChatRequestMessage {
  role: string;
  content: string;
}

export interface ChatCompletionResult {
  ok: boolean;
  httpStatus: number;
  latencyMs: number;
  content?: string;
  /** Set when the model produced no text but did not fail — e.g. max_tokens hit during reasoning. */
  truncated?: boolean;
  /** The request exhausted its own budget rather than failing or being cancelled. */
  timedOut?: boolean;
  usage?: NormalizedUsage;
  error?: string;
}

export async function chatCompletion(
  target: ApiTarget,
  modelId: string,
  messages: ChatRequestMessage[],
  maxTokens: number,
  timeoutMs?: number,
  signal?: AbortSignal
): Promise<ChatCompletionResult> {
  const format = getApiFormat(target);
  const baseUrl = resolveBaseUrl(target);
  const startTime = Date.now();
  const effectiveTimeoutMs = timeoutMs ?? resolveTimeoutMs(target);

  const endpoint = format === 'anthropic' ? `${baseUrl}/messages` : `${baseUrl}/chat/completions`;

  // Anthropic takes the system prompt as a top-level field, not a message.
  let body: Record<string, unknown>;
  if (format === 'anthropic') {
    const systemParts = messages.filter((m) => m.role === 'system').map((m) => m.content);
    const convo = messages.filter((m) => m.role !== 'system');
    body = {
      model: modelId,
      max_tokens: maxTokens,
      messages: convo.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
    };
    if (systemParts.length) body.system = systemParts.join('\n\n');
  } else {
    body = { model: modelId, messages, max_tokens: maxTokens, stream: false };
  }

  try {
    const res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...authHeaders(target),
      },
      body: JSON.stringify(body),
      timeoutMs: effectiveTimeoutMs,
      signal,
    });

    const latencyMs = Date.now() - startTime;
    const rawText = await res.text().catch(() => '');
    let data: any = {};
    try {
      data = JSON.parse(rawText);
    } catch {
      data = {};
    }

    const errMsg = data?.error || !res.ok ? extractError(data, rawText, res.status) : null;
    if (errMsg) {
      return { ok: false, httpStatus: res.status, latencyMs, error: errMsg };
    }

    const content = extractContent(data, format);
    if (content) {
      return {
        ok: true,
        httpStatus: res.status,
        latencyMs,
        content,
        usage: normalizeUsage(data, format),
      };
    }

    // A reasoning model can burn the whole budget before emitting text. The
    // endpoint is still healthy, so report it as truncated rather than failed.
    const stopReason =
      format === 'anthropic' ? data?.stop_reason : data?.choices?.[0]?.finish_reason;
    if (stopReason === 'length' || stopReason === 'max_tokens') {
      return {
        ok: true,
        httpStatus: res.status,
        latencyMs,
        truncated: true,
        usage: normalizeUsage(data, format),
      };
    }

    return {
      ok: false,
      httpStatus: res.status,
      latencyMs,
      error: 'Empty response — no content returned',
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;

    // The request burnt through its own budget — this is a timeout, which is a
    // distinct verdict from "the endpoint refused us" or "the user hit Stop".
    if (err instanceof RequestTimeoutError) {
      return {
        ok: false,
        httpStatus: 0,
        latencyMs,
        timedOut: true,
        error: `No response within the ${formatBudget(effectiveTimeoutMs)} timeout budget`,
      };
    }

    return {
      ok: false,
      httpStatus: 0,
      latencyMs,
      error: err.name === 'AbortError' ? 'Request cancelled' : err.message,
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Single-model health probe
// ─────────────────────────────────────────────────────────────

/** Reasoning models spend their budget on thinking, so never probe with a tiny cap. */
export const MIN_PROBE_TOKENS = 100;

/**
 * Probes one model. `timeoutMs` is the budget for *this model alone* — every
 * model in a check gets its own clock, so one slow model can never eat the
 * allowance of the others running alongside it.
 */
export async function testModel(
  target: ApiTarget,
  modelId: string,
  signal?: AbortSignal,
  timeoutMs?: number
): Promise<ModelTestResult> {
  const prompt = target.testPrompt || 'ping';
  const maxTokens = Math.max(target.maxTokens || 5, MIN_PROBE_TOKENS);

  const result = await chatCompletion(
    target,
    modelId,
    [{ role: 'user', content: prompt }],
    maxTokens,
    timeoutMs ?? resolveTimeoutMs(target),
    signal
  );

  const testedAt = new Date().toISOString();

  if (result.timedOut) {
    return {
      modelId,
      status: 'timeout',
      latencyMs: result.latencyMs,
      httpStatus: 0,
      errorMessage: result.error,
      testedAt,
    };
  }

  if (result.ok) {
    return {
      modelId,
      status: 'operational',
      latencyMs: result.latencyMs,
      httpStatus: result.httpStatus,
      responseSnippet: result.truncated
        ? '[reasoning model — output truncated by max_tokens]'
        : String(result.content).substring(0, 150),
      testedAt,
    };
  }

  if (result.httpStatus === 0) {
    return {
      modelId,
      status: 'unreachable',
      latencyMs: result.latencyMs,
      httpStatus: 0,
      errorMessage: result.error,
      testedAt,
    };
  }

  const isAuth = result.httpStatus === 401 || result.httpStatus === 403;
  return {
    modelId,
    status: isAuth ? 'auth_failed' : 'error',
    latencyMs: result.latencyMs,
    httpStatus: result.httpStatus,
    errorMessage: result.error,
    testedAt,
  };
}
