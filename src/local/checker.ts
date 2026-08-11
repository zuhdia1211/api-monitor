import {
  ApiTarget,
  HealthCheckResult,
  ModelTestResult,
  OverallStatus,
  IncidentLog,
  CheckProgress,
} from '../types';
import { saveCheckResult, saveIncident, getTargets, getSettings } from './store';
import { sendWebhookAlert } from './webhook';
import { listModels, testModel, resolveBaseUrl, formatBudget } from './providers';

/** Thrown when a user explicitly stops a running check. */
export class CheckCancelledError extends Error {
  constructor() {
    super('Check cancelled by user');
    this.name = 'CheckCancelledError';
  }
}

/**
 * Live per-model progress for checks that are still running.
 *
 * The final HealthCheckResult only lands in the DB once every model has been
 * probed, which made a 40-model endpoint look frozen for minutes. This holds
 * the partial results so the UI can render each model the moment it settles.
 */
const progressByTarget = new Map<string, CheckProgress>();

/** Snapshot of in-progress checks. Returns only targets mid-check. */
export function getCheckProgress(targetId?: string): CheckProgress[] {
  if (targetId) {
    const one = progressByTarget.get(targetId);
    return one ? [one] : [];
  }
  return [...progressByTarget.values()];
}

/** Targets with a check currently in flight. Prevents overlapping checks. */
const inFlight = new Map<string, AbortController>();

export function isCheckInFlight(targetId: string): boolean {
  return inFlight.has(targetId);
}

/** Ids of every target currently being checked — powers the UI's Stop buttons. */
export function getInFlightTargetIds(): string[] {
  return [...inFlight.keys()];
}

/** Aborts a running check. Returns false when nothing was running. */
export function cancelCheck(targetId: string): boolean {
  const controller = inFlight.get(targetId);
  if (!controller) return false;
  controller.abort();
  return true;
}

/** Aborts every running check at once. Returns how many were stopped. */
export function cancelAllChecks(): number {
  const controllers = [...inFlight.values()];
  for (const controller of controllers) controller.abort();
  return controllers.length;
}

/**
 * How many model probes may be open at once. Truly unbounded parallelism
 * against a 200-model gateway invites rate limiting — and a 429 would be
 * recorded as a model failure that says more about our burst than about the
 * model. This cap keeps the check effectively concurrent while staying a
 * polite client.
 */
const MAX_PARALLEL_PROBES = 8;

/** Placeholder shown while a model's own request is still open. */
function pendingResult(modelId: string): ModelTestResult {
  return {
    modelId,
    status: 'testing',
    latencyMs: 0,
    httpStatus: 0,
    testedAt: new Date().toISOString(),
  };
}

/** A model whose probe was cut short because the user pressed Stop. */
function cancelledResult(modelId: string): ModelTestResult {
  return {
    modelId,
    status: 'error',
    latencyMs: 0,
    httpStatus: 0,
    errorMessage: 'Check cancelled before this model was tested',
    testedAt: new Date().toISOString(),
  };
}

/**
 * Runs `worker` over every model with at most `limit` in flight, resolving in
 * input order. Results are handed to the caller as they land rather than at the
 * end, which is what lets each row in the UI settle on its own.
 */
async function probeAll(
  modelIds: string[],
  limit: number,
  worker: (modelId: string, index: number) => Promise<ModelTestResult>
): Promise<ModelTestResult[]> {
  const results = new Array<ModelTestResult>(modelIds.length);
  let cursor = 0;

  const runner = async () => {
    while (cursor < modelIds.length) {
      const index = cursor++;
      results[index] = await worker(modelIds[index], index);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, modelIds.length) }, runner)
  );
  return results;
}

// Provider-agnostic auto-discovery & multi-model automated testing
export async function checkOpenAiTarget(
  target: ApiTarget,
  cancelSignal?: AbortSignal
): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const resultId = `check-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const timestamp = new Date().toISOString();

  if (!resolveBaseUrl(target)) {
    return {
      id: resultId,
      targetId: target.id,
      timestamp,
      overallStatus: 'down',
      latencyMs: Date.now() - startTime,
      httpStatus: 0,
      discoveredModelsCount: 0,
      modelResults: [],
      errorMessage: 'No base URL configured for this target',
    };
  }

  // The budget applies to each model on its own rather than to the check as a
  // whole. It is owned solely by the header (Check Timeout); a per-target copy
  // used to shadow it and report stale timeouts the user never asked for.
  const settings = await getSettings();
  const globalTimeoutMs = settings.requestTimeoutMs ?? 10000;
  const effectiveTarget: ApiTarget = {
    ...target,
    timeoutMs: globalTimeoutMs,
  };
  const perModelTimeoutMs = globalTimeoutMs;

  // Only an explicit Stop aborts requests now; there is no global timer.
  const cancelled = () => cancelSignal?.aborted === true;

  // Step 1: Discover models (deduplicated — some providers return the same id twice)
  const discovery = await listModels(effectiveTarget, cancelSignal);
  if (cancelled()) throw new CheckCancelledError();
  discovery.models = [...new Set(discovery.models)];

  if (discovery.models.length === 0) {
    return {
      id: resultId,
      targetId: target.id,
      timestamp,
      overallStatus: 'down',
      latencyMs: Date.now() - startTime,
      httpStatus: discovery.httpStatus,
      discoveredModelsCount: 0,
      modelResults: [],
      errorMessage:
        discovery.error || 'No models returned from the provider model listing endpoint',
    };
  }

  // Step 2: Probe every discovered model, several at a time. The progress map
  // is seeded up front with a `testing` placeholder per model so the UI can
  // paint the complete matrix immediately, then each entry is swapped in the
  // moment that model's own request settles.
  const progress: CheckProgress = {
    targetId: target.id,
    phase: 'testing',
    startedAt: timestamp,
    totalModels: discovery.models.length,
    completedModels: 0,
    currentModelIds: [],
    modelResults: discovery.models.map(pendingResult),
    perModelTimeoutMs,
  };
  progressByTarget.set(target.id, progress);

  const publish = (index: number, result: ModelTestResult) => {
    progress.modelResults[index] = result;
    progress.completedModels += 1;
    progress.currentModelIds = progress.currentModelIds.filter((id) => id !== result.modelId);
  };

  const modelResults = await probeAll(
    discovery.models,
    MAX_PARALLEL_PROBES,
    async (modelId, index) => {
      // Stop skips the remaining models rather than reporting them as broken.
      if (cancelled()) {
        const result = cancelledResult(modelId);
        publish(index, result);
        return result;
      }

      // Stamp the moment this model's own request opened so the UI can show a
      // live elapsed timer instead of a static placeholder.
      progress.currentModelIds = [...progress.currentModelIds, modelId];
      progress.modelResults[index] = {
        ...pendingResult(modelId),
        startedAt: new Date().toISOString(),
      };

      const result = await testModel(effectiveTarget, modelId, cancelSignal, perModelTimeoutMs);
      publish(index, result);
      return result;
    }
  );

  if (cancelled()) throw new CheckCancelledError();

  progress.currentModelIds = [];
  progress.phase = 'done';

  // Step 3: Roll the per-model results up into an overall status
  const totalModels = modelResults.length;
  const operationalCount = modelResults.filter((m) => m.status === 'operational').length;
  const timedOutCount = modelResults.filter((m) => m.status === 'timeout').length;
  const totalLatency = modelResults.reduce((sum, m) => sum + m.latencyMs, 0);
  const avgModelLatency =
    totalModels > 0 ? Math.round(totalLatency / totalModels) : Date.now() - startTime;

  let overallStatus: OverallStatus = 'healthy';
  let overallError: string | undefined;

  if (operationalCount === 0) {
    overallStatus = 'down';
    overallError = `All ${totalModels} discovered models failed execution tests`;
  } else if (operationalCount < totalModels) {
    overallStatus = 'degraded';
    const failedList = modelResults
      .filter((m) => m.status !== 'operational')
      .map((m) => m.modelId)
      .join(', ');
    overallError = `${totalModels - operationalCount} of ${totalModels} models failed: [${failedList}]`;
  }

  // Call out timeouts explicitly — they usually mean the budget is too tight
  // for a reasoning model rather than that the endpoint is actually broken.
  if (timedOutCount > 0) {
    overallError = `${overallError} — ${timedOutCount} timed out after ${formatBudget(
      perModelTimeoutMs
    )} each`;
  }

  return {
    id: resultId,
    targetId: target.id,
    timestamp,
    overallStatus,
    latencyMs: avgModelLatency,
    httpStatus: 200,
    discoveredModelsCount: totalModels,
    modelResults,
    errorMessage: overallError,
  };
}

export async function executeCheck(
  target: ApiTarget,
  cancelSignal?: AbortSignal
): Promise<HealthCheckResult> {
  const checkResult = await checkOpenAiTarget(target, cancelSignal);

  // Save check result
  await saveCheckResult(checkResult);

  // Generate Incident log if status is degraded/down or if errors detected
  if (checkResult.overallStatus !== 'healthy') {
    const severity = checkResult.overallStatus === 'down' ? 'critical' : 'warning';
    const incident: IncidentLog = {
      id: `inc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      targetId: target.id,
      targetName: target.name,
      targetType: target.type,
      timestamp: checkResult.timestamp,
      severity,
      title: `${target.name} is ${checkResult.overallStatus.toUpperCase()}`,
      details: checkResult.errorMessage || `Endpoint failed health check with HTTP status ${checkResult.httpStatus}`,
    };
    await saveIncident(incident);
    sendWebhookAlert(incident).catch(() => {});
  }

  // Log individual model failures
  if (checkResult.modelResults) {
    for (const m of checkResult.modelResults) {
      if (m.status !== 'operational') {
        const incident: IncidentLog = {
          id: `inc-mod-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          targetId: target.id,
          targetName: target.name,
          targetType: target.type,
          timestamp: m.testedAt,
          severity: 'warning',
          title: `Model Failure: ${m.modelId}`,
          details: `Model ${m.modelId} on ${target.name} returned status "${m.status}": ${m.errorMessage || 'Unknown error'}`,
          modelId: m.modelId,
        };
        await saveIncident(incident);
        sendWebhookAlert(incident).catch(() => {});
      }
    }
  }

  return checkResult;
}

/**
 * Runs a check while guaranteeing only one runs per target at a time.
 * Returns null if a check was already running, or if this one was cancelled —
 * a cancelled check is deliberately not persisted so it can't be mistaken for
 * a real outage.
 */
export async function runCheckExclusive(target: ApiTarget): Promise<HealthCheckResult | null> {
  if (inFlight.has(target.id)) return null;
  const controller = new AbortController();
  inFlight.set(target.id, controller);
  try {
    return await executeCheck(target, controller.signal);
  } catch (err) {
    if (err instanceof CheckCancelledError) return null;
    throw err;
  } finally {
    inFlight.delete(target.id);
    progressByTarget.delete(target.id);
  }
}

// Scheduler to trigger automated periodic checks
let schedulerTimer: ReturnType<typeof setInterval> | null = null;

export function startBackgroundScheduler() {
  if (schedulerTimer) return;

  // Check every 15 seconds if any target needs periodic update
  schedulerTimer = setInterval(async () => {
    try {
      const settings = await getSettings();

      // The header's Polling Interval is the only schedule. "Manual only" (0)
      // keeps the scheduler completely idle so no background traffic is
      // generated until the user asks for a check.
      const pollIntervalSeconds = settings.autoRefreshInterval ?? 30;
      if (pollIntervalSeconds <= 0) return;

      const intervalMs = pollIntervalSeconds * 1000;
      const targets = await getTargets();
      const now = Date.now();

      for (const target of targets) {
        if (!target.enabled) continue;

        // Skip anything still being checked from a previous tick.
        if (inFlight.has(target.id)) continue;

        const lastCheckTime = target.lastCheckedAt ? new Date(target.lastCheckedAt).getTime() : 0;

        if (now - lastCheckTime >= intervalMs) {
          // Execute check asynchronously in background
          runCheckExclusive(target).catch((err) => {
            console.error(`Background check failed for ${target.name}:`, err);
          });
        }
      }
    } catch (err) {
      console.error('Scheduler error:', err);
    }
  }, 15000);

  console.log('API Monitoring Scheduler started successfully');
}

export function stopBackgroundScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log('API Monitoring Scheduler stopped');
  }
}
