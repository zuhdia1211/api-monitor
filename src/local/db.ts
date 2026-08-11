/**
 * SQLite access layer for the Android (Capacitor) build.
 *
 * The web build talks to better-sqlite3 through an Express server. On device
 * there is no server, so we use @capacitor-community/sqlite, which stores a
 * real SQLite file in the app's private storage. Data therefore survives app
 * restarts exactly like the desktop version.
 *
 * Capacitor's SQLite API is promise-based, so every helper here is async.
 */
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';

const DB_NAME = 'monitor';

const sqlite = new SQLiteConnection(CapacitorSQLite);
let db: SQLiteDBConnection | null = null;
let initPromise: Promise<SQLiteDBConnection> | null = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS targets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'openai',
    provider TEXT NOT NULL DEFAULT 'openai-compatible',
    enabled INTEGER NOT NULL DEFAULT 1,
    base_url TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    api_key TEXT,
    auto_discover_models INTEGER DEFAULT 1,
    test_prompt TEXT DEFAULT 'ping',
    max_tokens INTEGER DEFAULT 5,
    check_interval_seconds INTEGER DEFAULT 60,
    timeout_ms INTEGER DEFAULT 10000,
    last_check_result_json TEXT,
    last_checked_at TEXT,
    uptime_percent REAL,
    avg_latency_ms REAL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS checks (
    id TEXT PRIMARY KEY,
    target_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    overall_status TEXT NOT NULL,
    latency_ms INTEGER,
    http_status INTEGER,
    discovered_models_count INTEGER,
    model_results_json TEXT,
    error_message TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_checks_target_time ON checks(target_id, timestamp DESC);

  CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    target_id TEXT NOT NULL,
    target_name TEXT NOT NULL,
    target_type TEXT NOT NULL DEFAULT 'openai',
    timestamp TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    details TEXT,
    model_id TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_incidents_time ON incidents(timestamp DESC);

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enable_alerts INTEGER DEFAULT 1,
    webhook_url TEXT DEFAULT '',
    webhook_format TEXT DEFAULT 'generic',
    telegram_bot_token TEXT DEFAULT '',
    telegram_chat_id TEXT DEFAULT '',
    alert_cooldown_minutes INTEGER DEFAULT 10,
    auto_refresh_interval INTEGER DEFAULT 30,
    request_timeout_ms INTEGER DEFAULT 10000
  );

  CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    model_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    target_name TEXT NOT NULL,
    message_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);

  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    model_id TEXT,
    latency_ms INTEGER,
    usage_json TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at ASC);

  CREATE TABLE IF NOT EXISTS chat_compressions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    summary_text TEXT NOT NULL,
    messages_compressed INTEGER NOT NULL,
    compressed_before_id TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_chat_compressions_session ON chat_compressions(session_id);
`;

/**
 * On the web the plugin needs a WASM-backed store (jeep-sqlite) plus an
 * explicit save step. On Android the native layer handles persistence.
 */
async function initWebStore() {
  if (Capacitor.getPlatform() !== 'web') return;
  const jeepEl = document.querySelector('jeep-sqlite');
  if (!jeepEl) {
    const el = document.createElement('jeep-sqlite');
    document.body.appendChild(el);
    await customElements.whenDefined('jeep-sqlite');
  }
  await sqlite.initWebStore();
}

export async function getDb(): Promise<SQLiteDBConnection> {
  if (db) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Wait for the native bridge to be ready before touching the plugin.
    if (Capacitor.isNativePlatform()) {
      // The plugin may not be available immediately after app launch.
      let attempts = 0;
      let lastErr: unknown;
      while (attempts < 20) {
        try {
          await sqlite.echo('ping');
          break;
        } catch (err) {
          lastErr = err;
          attempts++;
          await new Promise((r) => setTimeout(r, 150));
        }
      }
      if (attempts >= 20) {
        const detail = lastErr instanceof Error ? `: ${lastErr.message}` : '';
        throw new Error(`CapacitorSQLitePlugin not ready after 3 s${detail}`);
      }
    }

    await initWebStore();

    // Reuse the connection if a previous session left one registered.
    const isConn = (await sqlite.isConnection(DB_NAME, false)).result;
    const conn = isConn
      ? await sqlite.retrieveConnection(DB_NAME, false)
      : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);

    await conn.open();
    await conn.execute(SCHEMA);
    await migrate(conn);

    const existing = await conn.query('SELECT COUNT(*) AS c FROM settings');
    if ((existing.values?.[0]?.c ?? 0) === 0) {
      await conn.run('INSERT INTO settings (id) VALUES (1)');
    }

    db = conn;
    return conn;
  })();

  return initPromise;
}

/** Add columns introduced after a user's database was first created. */
async function migrate(conn: SQLiteDBConnection) {
  const ensureColumn = async (table: string, column: string, definition: string) => {
    const info = await conn.query(`PRAGMA table_info(${table})`);
    const has = (info.values || []).some((c: any) => c.name === column);
    if (!has) {
      await conn.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };

  await ensureColumn('targets', 'provider', `TEXT NOT NULL DEFAULT 'openai-compatible'`);
  await ensureColumn('settings', 'auto_refresh_interval', 'INTEGER DEFAULT 30');
  await ensureColumn('settings', 'request_timeout_ms', 'INTEGER DEFAULT 10000');
  await ensureColumn('settings', 'weizerouter_portal_id', `TEXT DEFAULT ''`);
  await ensureColumn('settings', 'update_check_url', `TEXT DEFAULT ''`);
}

/** Run a write statement. Values are bound as parameters, never interpolated. */
export async function run(sql: string, params: any[] = []): Promise<number> {
  const conn = await getDb();
  const res = await conn.run(sql, params, false);
  await persist();
  return res.changes?.changes ?? 0;
}

/** Run a read query and return all rows. */
export async function all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const conn = await getDb();
  const res = await conn.query(sql, params);
  return (res.values || []) as T[];
}

/** Run a read query and return the first row, if any. */
export async function get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  const rows = await all<T>(sql, params);
  return rows[0];
}

/** The web build keeps the database in IndexedDB and must be flushed. */
async function persist() {
  if (Capacitor.getPlatform() !== 'web') return;
  try {
    await sqlite.saveToStore(DB_NAME);
  } catch {
    // Non-fatal: an unsaved web store only affects the browser preview.
  }
}

export async function closeDb() {
  if (!db) return;
  await db.close();
  await sqlite.closeConnection(DB_NAME, false);
  db = null;
  initPromise = null;
}
