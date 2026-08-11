/**
 * Chat session storage for the Android build — async port of server/chat-store.ts.
 */
import { run, all, get } from './db';
import { ChatSession, ChatMessage, ChatCompression } from '../types';

function genId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

function rowToSession(row: any): ChatSession {
  return {
    id: row.id,
    title: row.title || '',
    modelId: row.model_id,
    targetId: row.target_id,
    targetName: row.target_name,
    messageCount: row.message_count || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMessage(row: any): ChatMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    modelId: row.model_id || undefined,
    latencyMs: row.latency_ms ?? undefined,
    usage: row.usage_json ? JSON.parse(row.usage_json) : undefined,
    createdAt: row.created_at,
  };
}

function rowToCompression(row: any): ChatCompression {
  return {
    id: row.id,
    sessionId: row.session_id,
    summaryText: row.summary_text,
    messagesCompressed: row.messages_compressed,
    createdAt: row.created_at,
  };
}

export async function createSession(
  targetId: string,
  targetName: string,
  modelId: string,
  title?: string
): Promise<ChatSession> {
  const id = genId('chat');
  const now = new Date().toISOString();
  const sessionTitle = title || `Chat ${new Date().toLocaleString()}`;

  await run(
    `INSERT INTO chat_sessions (id, title, model_id, target_id, target_name, message_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    [id, sessionTitle, modelId, targetId, targetName, now, now]
  );

  return { id, title: sessionTitle, modelId, targetId, targetName, messageCount: 0, createdAt: now, updatedAt: now };
}

export async function getSessions(targetId?: string): Promise<ChatSession[]> {
  const rows = targetId
    ? await all('SELECT * FROM chat_sessions WHERE target_id = ? ORDER BY updated_at DESC', [targetId])
    : await all('SELECT * FROM chat_sessions ORDER BY updated_at DESC');
  return rows.map(rowToSession);
}

export async function getSession(
  sessionId: string
): Promise<(ChatSession & { messages: ChatMessage[]; compressions: ChatCompression[] }) | null> {
  const row = await get('SELECT * FROM chat_sessions WHERE id = ?', [sessionId]);
  if (!row) return null;

  const msgRows = await all('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC', [sessionId]);
  const compRows = await all('SELECT * FROM chat_compressions WHERE session_id = ? ORDER BY created_at ASC', [sessionId]);

  return {
    ...rowToSession(row),
    messages: msgRows.map(rowToMessage),
    compressions: compRows.map(rowToCompression),
  };
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  await run('DELETE FROM chat_messages WHERE session_id = ?', [sessionId]);
  await run('DELETE FROM chat_compressions WHERE session_id = ?', [sessionId]);
  const changes = await run('DELETE FROM chat_sessions WHERE id = ?', [sessionId]);
  return changes > 0;
}

export async function addMessage(
  sessionId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  modelId?: string,
  latencyMs?: number,
  usage?: any
): Promise<ChatMessage> {
  const id = genId('msg');
  const now = new Date().toISOString();

  await run(
    `INSERT INTO chat_messages (id, session_id, role, content, model_id, latency_ms, usage_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, sessionId, role, content, modelId || null, latencyMs ?? null, usage ? JSON.stringify(usage) : null, now]
  );

  await run('UPDATE chat_sessions SET message_count = message_count + 1, updated_at = ? WHERE id = ?', [now, sessionId]);

  return { id, sessionId, role, content, modelId, latencyMs, usage, createdAt: now };
}

/** Messages after the most recent compression boundary — what the model still sees. */
export async function getActiveMessages(sessionId: string): Promise<ChatMessage[]> {
  const lastCompression = await get(
    'SELECT compressed_before_id FROM chat_compressions WHERE session_id = ? ORDER BY created_at DESC LIMIT 1',
    [sessionId]
  );

  let rows: any[];
  if (lastCompression?.compressed_before_id) {
    const boundaryMsg = await get('SELECT created_at FROM chat_messages WHERE id = ?', [
      lastCompression.compressed_before_id,
    ]);
    rows = boundaryMsg
      ? await all('SELECT * FROM chat_messages WHERE session_id = ? AND created_at > ? ORDER BY created_at ASC', [
          sessionId,
          boundaryMsg.created_at,
        ])
      : await all('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC', [sessionId]);
  } else {
    rows = await all('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC', [sessionId]);
  }

  return rows.map(rowToMessage);
}

export async function getLatestCompression(sessionId: string): Promise<ChatCompression | null> {
  const row = await get('SELECT * FROM chat_compressions WHERE session_id = ? ORDER BY created_at DESC LIMIT 1', [
    sessionId,
  ]);
  return row ? rowToCompression(row) : null;
}

export async function createCompression(
  sessionId: string,
  summaryText: string,
  messagesCompressed: number
): Promise<ChatCompression> {
  const id = genId('comp');
  const now = new Date().toISOString();

  const lastMsg = await get('SELECT id FROM chat_messages WHERE session_id = ? ORDER BY created_at DESC LIMIT 1', [
    sessionId,
  ]);

  await run(
    `INSERT INTO chat_compressions (id, session_id, summary_text, messages_compressed, compressed_before_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, sessionId, summaryText, messagesCompressed, lastMsg?.id || null, now]
  );

  await run('UPDATE chat_sessions SET message_count = 0, updated_at = ? WHERE id = ?', [now, sessionId]);

  return { id, sessionId, summaryText, messagesCompressed, createdAt: now };
}

export async function updateSessionModel(sessionId: string, modelId: string): Promise<void> {
  await run('UPDATE chat_sessions SET model_id = ?, updated_at = ? WHERE id = ?', [
    modelId,
    new Date().toISOString(),
    sessionId,
  ]);
}

export async function updateSessionTitle(sessionId: string, title: string): Promise<void> {
  await run('UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?', [
    title,
    new Date().toISOString(),
    sessionId,
  ]);
}

export async function getSessionMessageCount(sessionId: string): Promise<number> {
  const row = await get('SELECT message_count FROM chat_sessions WHERE id = ?', [sessionId]);
  return row?.message_count || 0;
}
