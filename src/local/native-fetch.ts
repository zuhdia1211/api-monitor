/**
 * Native HTTP bridge.
 *
 * On the web build the dashboard talks to provider APIs through its own Node
 * server, so the browser never makes a cross-origin request. In the APK there
 * is no server: the same code runs inside a WebView on origin `https://localhost`,
 * so every provider call becomes cross-origin and the WebView enforces CORS.
 * Most LLM gateways do not send `Access-Control-Allow-Origin` (they are meant to
 * be called server-side), so the request fails with an opaque "Failed to fetch"
 * even though the endpoint is reachable and the key is valid.
 *
 * CapacitorHttp performs the request in native Android code, outside the
 * WebView's origin model, so CORS does not apply — the same position the Node
 * server occupies in the web build. This wrapper returns a normal `Response`
 * so callers can keep using `res.ok`, `res.status`, `res.json()` and `res.text()`.
 *
 * Timeout semantics match the Node server: `timeoutMs` is the budget for the
 * whole request, and 0 (or a negative value) means "run until the provider
 * answers". An optional external `signal` can abort the request from outside
 * (e.g. the user pressing Stop on a running check); the WebView preview wires
 * it into the real fetch, and the native path races it against the request.
 *
 * Note: the native path buffers the whole body, so it is not suitable for
 * streaming responses. This app does not use streaming.
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core';

/** Header lookups must stay case-insensitive, as they are on a real Response. */
function normalizeHeaders(raw: Record<string, any> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (v != null) out[k] = String(v);
  }
  return out;
}

function toHeaderRecord(init?: HeadersInit): Record<string, string> {
  if (!init) return {};
  if (init instanceof Headers) return Object.fromEntries(init.entries());
  if (Array.isArray(init)) return Object.fromEntries(init);
  return { ...(init as Record<string, string>) };
}

function abortError(message: string): Error {
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

/**
 * Perform a request that must bypass the WebView's CORS enforcement.
 * Falls back to `window.fetch` when not running natively (browser preview).
 */
export async function nativeFetch(
  url: string,
  options: RequestInit & { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<Response> {
  const { timeoutMs = 10000, signal: externalSignal, ...rest } = options;
  const hasBudget = timeoutMs > 0;

  if (externalSignal?.aborted) throw abortError('Request cancelled');
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let rejectExternal: ((err: Error) => void) | null = null;
  const externalAbort = new Promise<never>((_, reject) => {
    rejectExternal = reject;
  });
  const onExternalAbort = () => rejectExternal?.(abortError('Request cancelled'));
  if (externalSignal) {
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  if (!Capacitor.isNativePlatform()) {
    const controller = new AbortController();
    const onOwnAbort = () => controller.abort();
    const onAny = () => controller.abort();
    if (hasBudget) timer = setTimeout(() => { timedOut = true; onOwnAbort(); }, timeoutMs);
    const onExternalOwn = () => onAny();
    if (externalSignal) {
      externalSignal.addEventListener('abort', onExternalOwn, { once: true });
    }
    try {
      return await Promise.race([
        fetch(url, { ...rest, signal: controller.signal }),
        externalAbort,
      ]);
    } catch (err) {
      if (timedOut) throw abortError(`Timed out after ${timeoutMs}ms`);
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
      externalSignal?.removeEventListener('abort', onExternalOwn);
    }
  }

  const method = (rest.method || 'GET').toUpperCase();
  const headers = toHeaderRecord(rest.headers);

  // CapacitorHttp takes a parsed value; our callers always send JSON strings.
  let data: any;
  if (typeof rest.body === 'string' && rest.body.length > 0) {
    try {
      data = JSON.parse(rest.body);
    } catch {
      data = rest.body;
    }
  }

  const nativeReq = CapacitorHttp.request({
    url,
    method,
    headers,
    data,
    connectTimeout: hasBudget ? timeoutMs : 0,
    readTimeout: hasBudget ? timeoutMs : 0,
    // Ask for text so error pages (HTML, plain text) survive intact; callers
    // that want JSON call res.json() themselves.
    responseType: 'text',
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    if (hasBudget) timer = setTimeout(() => { timedOut = true; reject(abortError(`Timed out after ${timeoutMs}ms`)); }, timeoutMs);
  });

  try {
    const res = await Promise.race<any>([nativeReq, timeoutPromise, externalAbort]);

    const responseHeaders = normalizeHeaders(res.headers);
    const bodyText =
      typeof res.data === 'string' ? res.data : res.data == null ? '' : JSON.stringify(res.data);

    // Status 204/205 must not carry a body, or the Response constructor throws.
    const body = res.status === 204 || res.status === 205 ? null : bodyText;

    return new Response(body, {
      status: res.status,
      // Response rejects a statusText containing non-token characters; leave it
      // empty and let callers rely on the status code.
      headers: responseHeaders,
    });
  } catch (err) {
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}
