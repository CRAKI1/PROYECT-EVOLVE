import * as SQLite from "expo-sqlite";

export type WorkoutRow = {
  id: string;
  date: string;
  title: string;
  status: "active" | "completed";
  started_at: string;
  completed_at: string | null;
};

export type WorkoutSetRow = {
  id: string;
  workout_id: string;
  exercise_key: string;
  set_index: number;
  load_kg: number | null;
  reps: number | null;
  rir: number | null;
  completed: 0 | 1;
};

export type WorkoutExerciseRow = {
  id: string;
  workout_id: string;
  name: string;
  order_index: number;
};

export type WorkoutExercise = WorkoutExerciseRow & {
  sets: WorkoutSetRow[];
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

function finiteOrNull(value: number | null) {
  return value === null || Number.isFinite(value);
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

        CREATE TABLE IF NOT EXISTS workout_exercises (
          id TEXT PRIMARY KEY NOT NULL,
          workout_id TEXT NOT NULL,
          name TEXT NOT NULL,
          order_index INTEGER NOT NULL,
          FOREIGN KEY(workout_id) REFERENCES workouts(id) ON DELETE CASCADE,
          UNIQUE(workout_id, order_index)
        );

        CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout
          ON workout_exercises(workout_id, order_index);

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

        CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise
          ON workout_sets(workout_id, exercise_key, set_index);

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

export async function loadWorkoutExercises(workoutId: string): Promise<WorkoutExercise[]> {
  const db = await database();
  const exercises = await db.getAllAsync<WorkoutExerciseRow>(
    "SELECT id, workout_id, name, order_index FROM workout_exercises WHERE workout_id = ? ORDER BY order_index ASC",
    workoutId,
  );
  const sets = await db.getAllAsync<WorkoutSetRow>(
    "SELECT id, workout_id, exercise_key, set_index, load_kg, reps, rir, completed FROM workout_sets WHERE workout_id = ? ORDER BY exercise_key ASC, set_index ASC",
    workoutId,
  );

  return exercises.map((exercise) => ({
    ...exercise,
    sets: sets.filter((set) => set.exercise_key === exercise.id),
  }));
}

export async function addExercise(workoutId: string, rawName: string) {
  const db = await database();
  const name = rawName.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) throw new Error("Usa un nombre de ejercicio entre 2 y 80 caracteres.");

  const active = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM workouts WHERE id = ? AND status = 'active'",
    workoutId,
  );
  if (!active) throw new Error("El entrenamiento ya no está activo.");

  const order = await db.getFirstAsync<{ next_order: number }>(
    "SELECT COALESCE(MAX(order_index), 0) + 1 AS next_order FROM workout_exercises WHERE workout_id = ?",
    workoutId,
  );

  const exerciseId = id("exercise");
  const setId = id("set");
  const orderIndex = order?.next_order ?? 1;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "INSERT INTO workout_exercises (id, workout_id, name, order_index) VALUES (?, ?, ?, ?)",
      exerciseId,
      workoutId,
      name,
      orderIndex,
    );
    await db.runAsync(
      "INSERT INTO workout_sets (id, workout_id, exercise_key, set_index, completed) VALUES (?, ?, ?, 1, 0)",
      setId,
      workoutId,
      exerciseId,
    );
    await queue(db, "workout_exercise", exerciseId, "upsert", {
      id: exerciseId,
      workoutId,
      name,
      orderIndex,
    });
  });

  return exerciseId;
}

export async function addSet(workoutId: string, exerciseId: string) {
  const db = await database();
  const exercise = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM workout_exercises WHERE id = ? AND workout_id = ?",
    exerciseId,
    workoutId,
  );
  if (!exercise) throw new Error("Ejercicio no encontrado.");

  const next = await db.getFirstAsync<{ next_index: number }>(
    "SELECT COALESCE(MAX(set_index), 0) + 1 AS next_index FROM workout_sets WHERE workout_id = ? AND exercise_key = ?",
    workoutId,
    exerciseId,
  );
  const setIndex = next?.next_index ?? 1;
  const setId = id("set");

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "INSERT INTO workout_sets (id, workout_id, exercise_key, set_index, completed) VALUES (?, ?, ?, ?, 0)",
      setId,
      workoutId,
      exerciseId,
      setIndex,
    );
    await queue(db, "workout_set", setId, "upsert", {
      id: setId,
      workoutId,
      exerciseId,
      setIndex,
      completed: false,
    });
  });

  return setId;
}

export async function saveSet(
  workoutId: string,
  setId: string,
  values: { loadKg: number | null; reps: number; rir: number | null },
) {
  if (!finiteOrNull(values.loadKg) || (values.loadKg ?? 0) < 0) throw new Error("Carga inválida.");
  if (!Number.isInteger(values.reps) || values.reps < 0 || values.reps > 200) throw new Error("Repeticiones inválidas.");
  if (!finiteOrNull(values.rir) || (values.rir !== null && (values.rir < 0 || values.rir > 10))) throw new Error("RIR debe estar entre 0 y 10.");

  const db = await database();
  const result = await db.runAsync(
    "UPDATE workout_sets SET load_kg = ?, reps = ?, rir = ?, completed = 1 WHERE id = ? AND workout_id = ?",
    values.loadKg,
    values.reps,
    values.rir,
    setId,
    workoutId,
  );
  if (result.changes !== 1) throw new Error("Serie no encontrada.");

  await queue(db, "workout_set", setId, "upsert", {
    id: setId,
    workoutId,
    loadKg: values.loadKg,
    reps: values.reps,
    rir: values.rir,
    completed: true,
  });
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
