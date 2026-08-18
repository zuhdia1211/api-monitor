/**
 * In-app replacement for the Express server.
 *
 * The React code calls `fetch('/api/...')` exactly as it does on the web. On
 * device there is no HTTP server, so `installApiShim()` intercepts those calls
 * and routes them here, where the same logic runs directly against SQLite.
 * Keeping the request/response shapes identical means no UI code changes.
 */
import {
  getTargets, saveTarget, deleteTarget, getCheckResults, getIncidents,
  clearAllData, getSettings, saveSettings,
} from './store';
import { nativeFetch } from './native-fetch';
import { executeCheck, checkOpenAiTarget, runCheckExclusive, isCheckInFlight, getInFlightTargetIds, cancelCheck, cancelAllChecks, getCheckProgress } from './checker';
import { testWebhookConfig } from './webhook';
import { PROVIDER_PRESETS, getPreset, chatCompletion, testModel } from './providers';
import {
  createSession, getSessions, getSession, deleteSession, addMessage,
  getActiveMessages, getLatestCompression, createCompression,
  updateSessionModel, updateSessionTitle, getSessionMessageCount,
} from './chat-store';
import { ApiTarget, SummaryMetrics } from '../types';

interface ApiResponse {
  status: number;
  body: any;
}

const ok = (body: any): ApiResponse => ({ status: 200, body });
const created = (body: any): ApiResponse => ({ status: 201, body });
const badRequest = (error: string): ApiResponse => ({ status: 400, body: { error } });
const notFound = (error: string): ApiResponse => ({ status: 404, body: { error } });

async function findTarget(id: string) {
  const targets = await getTargets();
  return targets.find((t) => t.id === id);
}

async function buildSummary(): Promise<SummaryMetrics> {
  const targets = await getTargets();
  const activeTargets = targets.filter((t) => t.enabled);

  let healthyCount = 0, degradedCount = 0, downCount = 0;
  let totalModelsDiscovered = 0, totalModelsOperational = 0, totalModelsFailing = 0;
  let sumLatency = 0, latencyCount = 0;

  for (const t of targets) {
    const last = t.lastCheckResult;
    if (!last) continue;

    if (last.overallStatus === 'healthy') healthyCount++;
    else if (last.overallStatus === 'degraded') degradedCount++;
    else if (last.overallStatus === 'down') downCount++;

    if (last.latencyMs) {
      sumLatency += last.latencyMs;
      latencyCount++;
    }

    if (last.modelResults) {
      totalModelsDiscovered += last.discoveredModelsCount || last.modelResults.length;
      for (const m of last.modelResults) {
        if (m.status === 'operational') totalModelsOperational++;
        else totalModelsFailing++;
      }
    }
  }

  const totalTested = healthyCount + degradedCount + downCount;

  return {
    totalTargets: targets.length,
    activeTargets: activeTargets.length,
    healthyCount,
    degradedCount,
    downCount,
    totalModelsDiscovered,
    totalModelsOperational,
    totalModelsFailing,
    overallUptimePercent: totalTested > 0 ? Math.round(((healthyCount + degradedCount) / totalTested) * 100) : 0,
    averageLatencyMs: latencyCount > 0 ? Math.round(sumLatency / latencyCount) : 0,
    lastGlobalCheckAt: new Date().toISOString(),
  };
}

/**
 * Route a single API call. `seg` holds the path split on '/', with the leading
 * 'api' already removed, e.g. ['targets', 'abc123', 'check'].
 */
async function route(
  method: string,
  seg: string[],
  query: URLSearchParams,
  body: any
): Promise<ApiResponse> {
  const [a, b, c] = seg;

  // ---- Targets -----------------------------------------------------------
  if (a === 'targets') {
    if (!b && method === 'GET') return ok(await getTargets());

    if (!b && method === 'POST') {
      if (!body?.name) return badRequest('Name is required');
      const preset = getPreset(body.provider);
      if (!body.url && !body.baseUrl && !preset.baseUrl) {
        return badRequest('Base URL is required for this provider');
      }

      const now = new Date().toISOString();
      const newTarget: ApiTarget = {
        id: body.id || `target-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: body.name,
        type: 'openai',
        provider: preset.id as ApiTarget['provider'],
        enabled: body.enabled !== undefined ? body.enabled : true,
        url: body.baseUrl || body.url || preset.baseUrl,
        baseUrl: body.baseUrl || body.url || preset.baseUrl,
        apiKey: body.apiKey,
        autoDiscoverModels: body.autoDiscoverModels !== undefined ? body.autoDiscoverModels : true,
        testPrompt: body.testPrompt || 'ping',
        maxTokens: Number(body.maxTokens) || 5,
        // Scheduling and budget are owned globally by the settings row
        // (Polling Interval + Check Timeout), so new targets defer to them.
        checkIntervalSeconds: 0,
        timeoutMs: 0,
        createdAt: now,
        updatedAt: now,
      };

      const saved = await saveTarget(newTarget);

      const settings = await getSettings();
      const globalAuto = (settings.autoRefreshInterval ?? 30) > 0;
      if (globalAuto) {
        runCheckExclusive(saved).catch(() => {});
      }

      return created(saved);
    }

    // check-all must be handled before the ':id' patterns below.
    if (b === 'check-all' && method === 'POST') {
      const targets = await getTargets();
      const activeTargets = targets.filter((t) => t.enabled);
      const alreadyRunning = activeTargets.filter((t) => isCheckInFlight(t.id));
      const toCheck = activeTargets.filter((t) => !isCheckInFlight(t.id));

      for (const t of toCheck) {
        runCheckExclusive(t).catch((err) => {
          console.error(`Run-all check failed for ${t.name}:`, err);
        });
      }

      return ok({
        startedCount: toCheck.length,
        skippedCount: alreadyRunning.length,
        totalActive: activeTargets.length,
      });
    }

    if (b && method === 'PUT' && !c) {
      const existing = await findTarget(b);
      if (!existing) return notFound('Target not found');
      const saved = await saveTarget({ ...existing, ...body, id: b, updatedAt: new Date().toISOString() });
      return ok(saved);
    }

    if (b && method === 'DELETE' && !c) {
      const success = await deleteTarget(b);
      return success ? ok({ success: true, id: b }) : notFound('Target not found');
    }

    if (b && c === 'check' && method === 'POST') {
      const target = await findTarget(b);
      if (!target) return notFound('Target not found');

      const alreadyRunning = isCheckInFlight(b);
      const checkResult = await runCheckExclusive(target);
      if (!checkResult) {
        // Either a check was already running, or this one was stopped mid-flight.
        return alreadyRunning
          ? { status: 409, body: { error: 'A check is already running for this target' } }
          : ok({ cancelled: true });
      }
      return ok(checkResult);
    }

    if (b && c === 'cancel' && method === 'POST') {
      return ok({ stopped: cancelCheck(b) });
    }

    if (b === 'cancel-all' && method === 'POST') {
      return ok({ stoppedCount: cancelAllChecks() });
    }

    if (b === 'in-flight' && method === 'GET') {
      return ok({ targetIds: getInFlightTargetIds() });
    }

    if (b === 'progress' && method === 'GET') {
      return ok(getCheckProgress(query.get('targetId') || undefined));
    }

    if (b && c === 'test-model' && method === 'POST') {
      const { modelId } = body || {};
      if (!modelId) return badRequest('modelId is required');
      const target = await findTarget(b);
      if (!target) return notFound('Target not found');
      try {
        return ok(await testModel(target, modelId));
      } catch (err: any) {
        // Mirror the server: a failed probe is a result, not an HTTP error.
        return ok({
          modelId, status: 'unreachable', latencyMs: 0, httpStatus: 0,
          errorMessage: err.message, testedAt: new Date().toISOString(),
        });
      }
    }

    if (b && c === 'chat' && method === 'POST') {
      const { modelId, messages, maxTokens } = body || {};
      if (!modelId || !messages) return badRequest('modelId and messages are required');
      const target = await findTarget(b);
      if (!target) return notFound('Target not found');

      const result = await chatCompletion(target, modelId, messages, maxTokens || 1024, 60000);
      return ok(
        result.ok
          ? {
              success: true,
              content: result.truncated ? '[reasoning model — output truncated by max_tokens]' : result.content,
              latencyMs: result.latencyMs,
              usage: result.usage || {},
              model: modelId,
            }
          : { success: false, error: result.error, latencyMs: result.latencyMs, model: modelId }
      );
    }
  }

  // ---- Providers & discovery --------------------------------------------
  if (a === 'providers' && method === 'GET') return ok(PROVIDER_PRESETS);

  if (a === 'openai' && b === 'discover' && method === 'POST') {
    const { baseUrl, apiKey, testPrompt, maxTokens, timeoutMs, provider } = body || {};
    const preset = getPreset(provider);
    const effectiveBaseUrl = baseUrl || preset.baseUrl;
    if (!effectiveBaseUrl) return badRequest('Base URL is required');

    const settings = await getSettings();
    const now = new Date().toISOString();
    const tempTarget: ApiTarget = {
      id: 'temp-discovery',
      name: 'Discovery Preview',
      type: 'openai',
      provider: preset.id as ApiTarget['provider'],
      enabled: true,
      url: effectiveBaseUrl,
      baseUrl: effectiveBaseUrl,
      apiKey: apiKey || '',
      testPrompt: testPrompt || 'ping',
      maxTokens: Number(maxTokens) || 5,
      timeoutMs: settings.requestTimeoutMs ?? 10000,
      checkIntervalSeconds: 0,
      createdAt: now,
      updatedAt: now,
    };
    return ok(await checkOpenAiTarget(tempTarget));
  }

  // ---- Logs, incidents, metrics -----------------------------------------
  if (a === 'logs' && method === 'GET') {
    const targetId = query.get('targetId') || undefined;
    return ok(await getCheckResults(targetId, Number(query.get('limit')) || 50));
  }

  if (a === 'incidents' && method === 'GET') {
    return ok(await getIncidents(Number(query.get('limit')) || 100));
  }

  if (a === 'metrics' && b === 'summary' && method === 'GET') return ok(await buildSummary());

  if (a === 'clear-all-data' && method === 'POST') {
    await clearAllData();
    return ok({ success: true, targets: [] });
  }

  // ---- WeizeRouter -------------------------------------------------------
  if (a === 'weizerouter' && b === 'usage' && method === 'GET') {
    const targetId = query.get('targetId') || undefined;
    let portalId: string | undefined;
    let baseUrl: string | undefined;

    if (targetId) {
      const target = await findTarget(targetId);
      portalId = target?.weizeRouterPortalId;
      baseUrl = target?.weizeRouterBaseUrl;
    }

    if (!portalId) {
      const settings = await getSettings();
      portalId = settings.weizeRouterPortalId;
      baseUrl = baseUrl || settings.weizeRouterBaseUrl;
    }

    if (!portalId) return badRequest('WeizeRouter Portal ID belum dikonfigurasi. Tambahkan di Settings.');
    const page = query.get('page') || '1';
    const pageSize = query.get('page_size') || '50';
    const resolvedBaseUrl = (baseUrl || 'https://weizerouter.web.id').replace(/\/+$/, '');
    const url = `${resolvedBaseUrl}/portal/data?id=${encodeURIComponent(portalId)}&page=${page}&page_size=${pageSize}`;
    try {
      const res = await nativeFetch(url, { timeoutMs: 15000 });
      if (!res.ok) return { status: res.status, body: { error: `WeizeRouter API returned ${res.status}` } };
      const data = await res.json();
      return ok(data);
    } catch (err: any) {
      return { status: 500, body: { error: err.message } };
    }
  }

  // ---- Settings ----------------------------------------------------------
  if (a === 'settings') {
    if (!b && method === 'GET') return ok(await getSettings());
    if (!b && method === 'POST') return ok(await saveSettings(body));
    if (b === 'test-webhook' && method === 'POST') return ok(await testWebhookConfig(body));
  }

  // ---- Chat sessions -----------------------------------------------------
  if (a === 'chat' && b === 'sessions') {
    const sessionId = seg[2];
    const sub = seg[3];

    if (!sessionId && method === 'GET') return ok(await getSessions(query.get('targetId') || undefined));

    if (!sessionId && method === 'POST') {
      const { targetId, targetName, modelId, title } = body || {};
      if (!targetId || !modelId) return badRequest('targetId and modelId are required');
      return created(await createSession(targetId, targetName || 'Unknown', modelId, title));
    }

    if (sessionId && !sub && method === 'GET') {
      const session = await getSession(sessionId);
      return session ? ok(session) : notFound('Session not found');
    }

    if (sessionId && !sub && method === 'DELETE') {
      return (await deleteSession(sessionId)) ? ok({ success: true }) : notFound('Session not found');
    }

    if (sessionId && sub === 'model' && method === 'PUT') {
      if (!body?.modelId) return badRequest('modelId is required');
      await updateSessionModel(sessionId, body.modelId);
      return ok({ success: true });
    }

    if (sessionId && sub === 'title' && method === 'PUT') {
      if (!body?.title) return badRequest('title is required');
      await updateSessionTitle(sessionId, body.title);
      return ok({ success: true });
    }

    if (sessionId && sub === 'messages' && method === 'POST') {
      const { content, targetId, modelId, maxTokens } = body || {};
      if (!content) return badRequest('content is required');

      if ((await getSessionMessageCount(sessionId)) >= 50) {
        return { status: 429, body: { error: 'Message limit reached (50). Please compress chat history first.' } };
      }

      await addMessage(sessionId, 'user', content);

      const target = await findTarget(targetId);
      if (!target) return notFound('Target not found');

      const activeMessages = await getActiveMessages(sessionId);
      const latestComp = await getLatestCompression(sessionId);

      const apiMessages: { role: string; content: string }[] = [];
      if (latestComp) {
        apiMessages.push({ role: 'system', content: `Previous conversation summary:\n${latestComp.summaryText}` });
      }
      for (const m of activeMessages) {
        if (m.role !== 'system') apiMessages.push({ role: m.role, content: m.content });
      }

      const result = await chatCompletion(target, modelId, apiMessages, maxTokens || 1024, 60000);

      if (result.ok) {
        const assistantMsg = await addMessage(
          sessionId, 'assistant', result.content || '[reasoning model — output truncated]',
          modelId, result.latencyMs, result.usage
        );
        return ok({ success: true, message: assistantMsg, messageCount: await getSessionMessageCount(sessionId) });
      }

      const errMessage = await addMessage(sessionId, 'assistant', `Error: ${result.error}`, modelId, result.latencyMs);
      return ok({
        success: false, error: result.error, message: errMessage,
        messageCount: await getSessionMessageCount(sessionId),
      });
    }

    if (sessionId && sub === 'compress' && method === 'POST') {
      const session = await getSession(sessionId);
      if (!session) return notFound('Session not found');

      const activeMessages = await getActiveMessages(sessionId);
      if (activeMessages.length < 4) return badRequest('Not enough messages to compress');

      const target = await findTarget(session.targetId);
      if (!target) return notFound('Target not found');

      const conversationText = activeMessages
        .filter((m) => m.role !== 'system')
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');

      const result = await chatCompletion(
        target,
        session.modelId,
        [
          {
            role: 'system',
            content:
              'You are a helpful assistant that summarizes conversations concisely. Preserve key facts, decisions, and context.',
          },
          { role: 'user', content: `Please summarize this conversation in a concise paragraph:\n\n${conversationText}` },
        ],
        500,
        60000
      );

      const summaryText = result.ok ? result.content || 'Summary generated.' : 'Failed to generate summary.';
      const compression = await createCompression(sessionId, summaryText, activeMessages.length);

      return ok({ success: true, compression, messageCount: await getSessionMessageCount(sessionId) });
    }
  }

  return notFound(`No route for ${method} /${['api', ...seg].join('/')}`);
}

/**
 * Replace window.fetch so '/api/...' requests are served locally. Any other
 * URL (the provider APIs the app monitors) passes through untouched.
 */
export function installApiShim() {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawUrl =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

    // Resolve against a dummy origin so relative paths parse consistently.
    const url = new URL(rawUrl, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return nativeFetch(input as any, init);

    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const seg = url.pathname.split('/').filter(Boolean).slice(1); // drop 'api'

    let body: any;
    const rawBody = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
    if (typeof rawBody === 'string' && rawBody.length > 0) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = undefined;
      }
    }

    try {
      const { status, body: payload } = await route(method, seg, url.searchParams, body);
      return new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err?.message || 'Internal error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
}
