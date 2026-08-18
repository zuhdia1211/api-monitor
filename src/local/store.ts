/**
 * Data access for the Android build.
 *
 * This mirrors server/store.ts from the web project, but every call is async
 * because Capacitor's SQLite bridge is promise-based. The row shapes and the
 * SQL are intentionally identical so both builds behave the same way.
 */
import { run, all, get } from './db';
import { ApiTarget, HealthCheckResult, IncidentLog, AppSettings } from '../types';

const DEFAULT_SETTINGS: AppSettings = {
  enableAlerts: true,
  webhookUrl: '',
  webhookFormat: 'generic',
  telegramBotToken: '',
  telegramChatId: '',
  alertCooldownMinutes: 10,
  autoRefreshInterval: 30,
  requestTimeoutMs: 10000,
};

/** Fallback used whenever a target has no explicit timeout. 0 means unlimited. */
export const DEFAULT_TIMEOUT_MS = 10000;

function rowToTarget(row: any): ApiTarget {
  return {
    id: row.id,
    name: row.name,
    type: row.type || 'openai',
    provider: row.provider || 'openai-compatible',
    enabled: Boolean(row.enabled),
    url: row.url || row.base_url || '',
    baseUrl: row.base_url || row.url || '',
    apiKey: row.api_key || undefined,
    autoDiscoverModels: Boolean(row.auto_discover_models),
    testPrompt: row.test_prompt || 'ping',
    maxTokens: row.max_tokens || 5,
    checkIntervalSeconds: row.check_interval_seconds ?? 60,
    // 0 is a valid value meaning "unlimited", so only fall back on NULL.
    timeoutMs: row.timeout_ms ?? 10000,
    lastCheckResult: row.last_check_result_json ? JSON.parse(row.last_check_result_json) : undefined,
    lastCheckedAt: row.last_checked_at || undefined,
    uptimePercent: row.uptime_percent ?? undefined,
    avgLatencyMs: row.avg_latency_ms ?? undefined,
    weizeRouterPortalId: row.weizerouter_portal_id || undefined,
    weizeRouterBaseUrl: row.weizerouter_base_url || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToCheck(row: any): HealthCheckResult {
  return {
    id: row.id,
    targetId: row.target_id,
    timestamp: row.timestamp,
    overallStatus: row.overall_status,
    latencyMs: row.latency_ms,
    httpStatus: row.http_status,
    discoveredModelsCount: row.discovered_models_count ?? undefined,
    modelResults: row.model_results_json ? JSON.parse(row.model_results_json) : undefined,
    errorMessage: row.error_message || undefined,
  };
}

function rowToIncident(row: any): IncidentLog {
  return {
    id: row.id,
    targetId: row.target_id,
    targetName: row.target_name,
    targetType: row.target_type || 'openai',
    timestamp: row.timestamp,
    severity: row.severity,
    title: row.title,
    details: row.details || '',
    modelId: row.model_id || undefined,
  };
}

export async function getTargets(): Promise<ApiTarget[]> {
  const rows = await all('SELECT * FROM targets ORDER BY name ASC');
  return rows.map(rowToTarget);
}

export async function saveTarget(target: ApiTarget): Promise<ApiTarget> {
  const now = new Date().toISOString();
  target.updatedAt = now;

  await run(
    `INSERT OR REPLACE INTO targets (id, name, type, provider, enabled, base_url, url, api_key,
      auto_discover_models, test_prompt, max_tokens, check_interval_seconds, timeout_ms,
      last_check_result_json, last_checked_at, uptime_percent, avg_latency_ms,
      weizerouter_portal_id, weizerouter_base_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      target.id, target.name, target.type || 'openai',
      target.provider || 'openai-compatible', target.enabled ? 1 : 0,
      target.baseUrl || target.url || '', target.url || target.baseUrl || '',
      target.apiKey || null, target.autoDiscoverModels ? 1 : 0,
      target.testPrompt || 'ping', target.maxTokens || 5,
      target.checkIntervalSeconds ?? 60, target.timeoutMs ?? 10000,
      target.lastCheckResult ? JSON.stringify(target.lastCheckResult) : null,
      target.lastCheckedAt || null, target.uptimePercent ?? null, target.avgLatencyMs ?? null,
      target.weizeRouterPortalId || null, target.weizeRouterBaseUrl || null,
      target.createdAt || now, target.updatedAt,
    ]
  );

  return target;
}

export async function deleteTarget(id: string): Promise<boolean> {
  const changes = await run('DELETE FROM targets WHERE id = ?', [id]);
  if (changes > 0) {
    await run('DELETE FROM checks WHERE target_id = ?', [id]);
    await run('DELETE FROM incidents WHERE target_id = ?', [id]);
    await run(
      'DELETE FROM chat_messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE target_id = ?)',
      [id]
    );
    await run(
      'DELETE FROM chat_compressions WHERE session_id IN (SELECT id FROM chat_sessions WHERE target_id = ?)',
      [id]
    );
    await run('DELETE FROM chat_sessions WHERE target_id = ?', [id]);
    return true;
  }
  return false;
}

export async function saveCheckResult(result: HealthCheckResult): Promise<void> {
  await run(
    `INSERT OR REPLACE INTO checks (id, target_id, timestamp, overall_status, latency_ms, http_status,
      discovered_models_count, model_results_json, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      result.id, result.targetId, result.timestamp, result.overallStatus,
      result.latencyMs, result.httpStatus,
      result.discoveredModelsCount ?? null,
      result.modelResults ? JSON.stringify(result.modelResults) : null,
      result.errorMessage || null,
    ]
  );

  // Keep history bounded so the on-device database stays small.
  const countRow = await get('SELECT COUNT(*) AS c FROM checks WHERE target_id = ?', [result.targetId]);
  if ((countRow?.c ?? 0) > 1000) {
    await run(
      `DELETE FROM checks WHERE id IN (
         SELECT id FROM checks WHERE target_id = ? ORDER BY timestamp DESC LIMIT -1 OFFSET 1000
       )`,
      [result.targetId]
    );
  }

  const stats = await get(
    `SELECT COUNT(*) AS total,
       SUM(CASE WHEN overall_status IN ('healthy','degraded') THEN 1 ELSE 0 END) AS healthy,
       AVG(latency_ms) AS avg_lat
     FROM checks WHERE target_id = ?`,
    [result.targetId]
  );

  const total = stats?.total ?? 0;
  const uptimePercent = total > 0 ? Math.round(((stats?.healthy ?? 0) / total) * 100) : 0;
  const avgLatencyMs = stats?.avg_lat ? Math.round(stats.avg_lat) : 0;

  await run(
    `UPDATE targets SET last_check_result_json = ?, last_checked_at = ?,
       uptime_percent = ?, avg_latency_ms = ?, updated_at = ?
     WHERE id = ?`,
    [
      JSON.stringify(result), result.timestamp, uptimePercent, avgLatencyMs,
      new Date().toISOString(), result.targetId,
    ]
  );
}

export async function getCheckResults(targetId?: string, limit = 50): Promise<HealthCheckResult[]> {
  const rows = targetId
    ? await all('SELECT * FROM checks WHERE target_id = ? ORDER BY timestamp DESC LIMIT ?', [targetId, limit])
    : await all('SELECT * FROM checks ORDER BY timestamp DESC LIMIT ?', [limit]);
  return rows.map(rowToCheck);
}

export async function saveIncident(incident: IncidentLog): Promise<void> {
  await run(
    `INSERT OR IGNORE INTO incidents (id, target_id, target_name, target_type, timestamp,
       severity, title, details, model_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      incident.id, incident.targetId, incident.targetName, incident.targetType || 'openai',
      incident.timestamp, incident.severity, incident.title, incident.details,
      incident.modelId || null,
    ]
  );

  const countRow = await get('SELECT COUNT(*) AS c FROM incidents');
  if ((countRow?.c ?? 0) > 2000) {
    await run(
      `DELETE FROM incidents WHERE id IN (
         SELECT id FROM incidents ORDER BY timestamp DESC LIMIT -1 OFFSET 2000
       )`
    );
  }
}

export async function getIncidents(limit = 100): Promise<IncidentLog[]> {
  const rows = await all('SELECT * FROM incidents ORDER BY timestamp DESC LIMIT ?', [limit]);
  return rows.map(rowToIncident);
}

export async function getSettings(): Promise<AppSettings> {
  const row = await get('SELECT * FROM settings WHERE id = 1');
  if (!row) return DEFAULT_SETTINGS;
  return {
    enableAlerts: Boolean(row.enable_alerts),
    webhookUrl: row.webhook_url || '',
    webhookFormat: (row.webhook_format || 'generic') as any,
    telegramBotToken: row.telegram_bot_token || '',
    telegramChatId: row.telegram_chat_id || '',
    alertCooldownMinutes: row.alert_cooldown_minutes || 10,
    autoRefreshInterval: row.auto_refresh_interval ?? 30,
    requestTimeoutMs: row.request_timeout_ms ?? 10000,
    weizeRouterPortalId: row.weizerouter_portal_id || '',
    weizeRouterBaseUrl: row.weizerouter_base_url || '',
    updateCheckUrl: row.update_check_url || '',
  };
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  await run(
    `UPDATE settings SET enable_alerts = ?, webhook_url = ?, webhook_format = ?,
       telegram_bot_token = ?, telegram_chat_id = ?, alert_cooldown_minutes = ?,
       auto_refresh_interval = ?, request_timeout_ms = ?, weizerouter_portal_id = ?,
       weizerouter_base_url = ?, update_check_url = ?
     WHERE id = 1`,
    [
      settings.enableAlerts ? 1 : 0, settings.webhookUrl || '',
      settings.webhookFormat || 'generic', settings.telegramBotToken || '',
      settings.telegramChatId || '', settings.alertCooldownMinutes || 10,
      settings.autoRefreshInterval ?? 30, settings.requestTimeoutMs ?? 10000,
      settings.weizeRouterPortalId || '',
      settings.weizeRouterBaseUrl || '',
      settings.updateCheckUrl || '',
    ]
  );
  return getSettings();
}

export async function clearAllData(): Promise<void> {
  await run('DELETE FROM chat_messages');
  await run('DELETE FROM chat_compressions');
  await run('DELETE FROM chat_sessions');
  await run('DELETE FROM checks');
  await run('DELETE FROM incidents');
  await run('DELETE FROM targets');
}
