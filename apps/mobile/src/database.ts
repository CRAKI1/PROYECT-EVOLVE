import * as SQLite from "expo-sqlite";

export type WorkoutRow = {
  id: string;
  date: string;
  title: string;
  status: "active" | "completed";
  started_at: string;
  completed_at: string | null;
};

export type TodaySnapshot = {
  activeWorkout: WorkoutRow | null;
  completedToday: number;
  pendingSync: number;
};

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function localDate(now = new Date()) {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

async function database() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync("project-evolve.db").then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS workouts (
          id TEXT PRIMARY KEY NOT NULL,
          date TEXT NOT NULL,
          title TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('active', 'completed')),
          started_at TEXT NOT NULL,
          completed_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_workouts_date_status
          ON workouts(date, status);

        CREATE TABLE IF NOT EXISTS workout_sets (
          id TEXT PRIMARY KEY NOT NULL,
          workout_id TEXT NOT NULL,
          exercise_key TEXT NOT NULL,
          set_index INTEGER NOT NULL,
          load_kg REAL,
          reps INTEGER,
          rir REAL,
          completed INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY(workout_id) REFERENCES workouts(id) ON DELETE CASCADE,
          UNIQUE(workout_id, exercise_key, set_index)
        );

        CREATE TABLE IF NOT EXISTS daily_signals (
          date TEXT PRIMARY KEY NOT NULL,
          sleep_minutes INTEGER,
          steps INTEGER,
          energy INTEGER CHECK(energy IS NULL OR (energy BETWEEN 1 AND 5)),
          soreness INTEGER CHECK(soreness IS NULL OR (soreness BETWEEN 1 AND 5))
        );

        CREATE TABLE IF NOT EXISTS sync_outbox (
          id TEXT PRIMARY KEY NOT NULL,
          entity TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          operation TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
      return db;
    });
  }
  return databasePromise;
}

async function queue(
  db: SQLite.SQLiteDatabase,
  entity: string,
  entityId: string,
  operation: string,
  payload: unknown,
) {
  const createdAt = new Date().toISOString();
  await db.runAsync(
    "INSERT INTO sync_outbox (id, entity, entity_id, operation, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    id("outbox"),
    entity,
    entityId,
    operation,
    JSON.stringify(payload),
    createdAt,
  );
}

export async function loadToday(date = localDate()): Promise<TodaySnapshot> {
  const db = await database();
  const activeWorkout = await db.getFirstAsync<WorkoutRow>(
    "SELECT id, date, title, status, started_at, completed_at FROM workouts WHERE date = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1",
    date,
  );
  const completed = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM workouts WHERE date = ? AND status = 'completed'",
    date,
  );
  const outbox = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM sync_outbox",
  );

  return {
    activeWorkout: activeWorkout ?? null,
    completedToday: completed?.count ?? 0,
    pendingSync: outbox?.count ?? 0,
  };
}

export async function createQuickWorkout(date = localDate()) {
  const db = await database();
  const alreadyActive = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM workouts WHERE date = ? AND status = 'active' LIMIT 1",
    date,
  );
  if (alreadyActive) return alreadyActive.id;

  const workoutId = id("workout");
  const startedAt = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "INSERT INTO workouts (id, date, title, status, started_at, completed_at) VALUES (?, ?, ?, 'active', ?, NULL)",
      workoutId,
      date,
      "Sesión libre",
      startedAt,
    );
    await queue(db, "workout", workoutId, "upsert", {
      id: workoutId,
      date,
      title: "Sesión libre",
      status: "active",
      startedAt,
    });
  });

  return workoutId;
}

export async function completeWorkout(workoutId: string) {
  const db = await database();
  const completedAt = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      "UPDATE workouts SET status = 'completed', completed_at = ? WHERE id = ? AND status = 'active'",
      completedAt,
      workoutId,
    );
    if (result.changes !== 1) throw new Error("Active workout not found");
    await queue(db, "workout", workoutId, "upsert", {
      id: workoutId,
      status: "completed",
      completedAt,
    });
  });
}
