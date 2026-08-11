import { IncidentLog, AppSettings, WebhookTestResult } from '../types';
import { getSettings } from './store';
import { nativeFetch } from './native-fetch';

// Alert cooldown tracking: Map<targetId, lastAlertTimestampMs>
const lastAlertSentTime = new Map<string, number>();

export async function sendWebhookAlert(incident: IncidentLog): Promise<boolean> {
  try {
    const settings = await getSettings();

    if (!settings.enableAlerts) {
      return false;
    }

    // Check cooldown per target (default 10 mins)
    const cooldownMs = (settings.alertCooldownMinutes || 10) * 60 * 1000;
    const now = Date.now();
    const lastTime = lastAlertSentTime.get(incident.targetId) || 0;

    if (now - lastTime < cooldownMs) {
      console.log(`Alert throttled for target ${incident.targetName} (cooldown active)`);
      return false;
    }

    let success = false;

    // 1. Dispatch Webhook if configured
    if (settings.webhookUrl && settings.webhookUrl.trim() !== '') {
      const webhookOk = await triggerWebhook(settings.webhookUrl, settings.webhookFormat || 'generic', incident);
      if (webhookOk) success = true;
    }

    // 2. Dispatch Telegram Bot alert if configured
    if (settings.telegramBotToken && settings.telegramChatId) {
      const telegramOk = await triggerTelegramAlert(settings.telegramBotToken, settings.telegramChatId, incident);
      if (telegramOk) success = true;
    }

    if (success) {
      lastAlertSentTime.set(incident.targetId, now);
    }

    return success;
  } catch (err) {
    console.error('Error dispatching webhook alert:', err);
    return false;
  }
}

export async function testWebhookConfig(settings: AppSettings): Promise<WebhookTestResult> {
  const dummyIncident: IncidentLog = {
    id: `test-${Date.now()}`,
    targetId: 'test-target',
    targetName: 'Test Target Service',
    targetType: 'openai',
    timestamp: new Date().toISOString(),
    severity: 'warning',
    title: 'TEST ALERT: API Monitoring Webhook Test',
    details: 'This is a test notification from your API Monitoring Dashboard to verify webhook integration.',
  };

  const results: string[] = [];
  let overallSuccess = false;

  if (settings.webhookUrl && settings.webhookUrl.trim() !== '') {
    const ok = await triggerWebhook(settings.webhookUrl, settings.webhookFormat || 'generic', dummyIncident);
    if (ok) {
      results.push('Webhook endpoint responded successfully');
      overallSuccess = true;
    } else {
      results.push('Failed to send payload to Webhook URL');
    }
  }

  if (settings.telegramBotToken && settings.telegramChatId) {
    const ok = await triggerTelegramAlert(settings.telegramBotToken, settings.telegramChatId, dummyIncident);
    if (ok) {
      results.push('Telegram message delivered successfully');
      overallSuccess = true;
    } else {
      results.push('Failed to send Telegram message');
    }
  }

  if (!settings.webhookUrl && (!settings.telegramBotToken || !settings.telegramChatId)) {
    return {
      success: false,
      message: 'No Webhook URL or Telegram credentials provided',
    };
  }

  return {
    success: overallSuccess,
    message: results.join(' | '),
  };
}

async function triggerWebhook(url: string, format: string, incident: IncidentLog): Promise<boolean> {
  try {
    let bodyData: any;

    if (format === 'slack') {
      bodyData = {
        text: `🚨 *[${incident.severity.toUpperCase()}] ${incident.title}*\n*Target:* ${incident.targetName} (${incident.targetType})\n*Details:* ${incident.details}\n*Time:* ${incident.timestamp}`,
      };
    } else if (format === 'discord') {
      bodyData = {
        content: `🚨 **[${incident.severity.toUpperCase()}] ${incident.title}**\n> **Target:** ${incident.targetName}\n> **Details:** ${incident.details}\n> **Time:** ${incident.timestamp}`,
      };
    } else {
      // Generic JSON payload
      bodyData = {
        event: 'incident_created',
        severity: incident.severity,
        target: {
          id: incident.targetId,
          name: incident.targetName,
          type: incident.targetType,
        },
        incident: {
          id: incident.id,
          title: incident.title,
          details: incident.details,
          modelId: incident.modelId,
          timestamp: incident.timestamp,
        },
      };
    }

    // Native HTTP: webhook endpoints are cross-origin from the WebView and
    // generally send no CORS headers. See src/local/native-fetch.ts.
    const res = await nativeFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyData),
      timeoutMs: 8000,
    });

    return res.ok;

  } catch (err: any) {
    console.error('Webhook fetch error:', err.message);
    return false;
  }
}

async function triggerTelegramAlert(token: string, chatId: string, incident: IncidentLog): Promise<boolean> {
  try {
    const messageText = `🚨 *[${incident.severity.toUpperCase()}] ${incident.title}*\n\n📌 *Target:* ${incident.targetName} (${incident.targetType})\n💡 *Details:* ${incident.details}\n⏰ *Time:* ${incident.timestamp}`;
    const telegramUrl = `https://api.telegram.org/bot${token.trim()}/sendMessage`;

    const res = await nativeFetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId.trim(),
        text: messageText,
        parse_mode: 'Markdown',
      }),
      timeoutMs: 8000,
    });

    return res.ok;

  } catch (err: any) {
    console.error('Telegram API error:', err.message);
    return false;
  }
}
