import * as SQLite from "expo-sqlite";
import {
  adherence,
  nextPrescription,
  recoveryState,
  scaleNutrients,
  type Exposure,
  type Proposal,
  type RecoverySignals,
  type RecoveryState,
} from "../../../src/domain";

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
  context_key: string | null;
};

export type ExerciseProfile = {
  contextKey: string;
  name: string;
  currentLoad: number;
  sets: number;
  minReps: number;
  maxReps: number;
  targetRir: number;
  assisted: boolean;
  loadOptions: number[];
  updatedAt: string;
};

export type ExerciseProgressionSnapshot = {
  profile: ExerciseProfile | null;
  proposal: Proposal | null;
  exposureCount: number;
};

export type WorkoutExercise = WorkoutExerciseRow & {
  sets: WorkoutSetRow[];
};

export type PlanKind = "training" | "rest" | "unplanned";

export type WeeklyPlanDay = {
  weekday: number;
  kind: PlanKind;
  title: string;
  description: string;
  photoUri: string | null;
};

export type CalendarPlanDay = {
  date: string;
  kind: PlanKind;
  title: string;
  description: string;
  photoUri: string | null;
  planned: number;
  completed: number;
};

export type PlanSnapshot = {
  activatedOn: string | null;
  week: WeeklyPlanDay[];
  calendar: CalendarPlanDay[];
  streak: {
    current: number;
    longest: number;
    planned: number;
    completed: number;
    percentage: number | null;
  };
};

export type RecoverySnapshot = {
  date: string;
  signals: RecoverySignals;
  state: RecoveryState;
};

export type NutritionMeal = "preworkout" | "breakfast" | "lunch" | "dinner" | "snack" | "other";

export type NutritionEntry = {
  id: string;
  date: string;
  meal: NutritionMeal;
  name: string;
  grams: number;
  source: "manual" | "barcode" | "photo";
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  barcode: string | null;
  brand: string | null;
  createdAt: string;
};

export type NutritionDaySnapshot = {
  date: string;
  entries: NutritionEntry[];
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  };
};

export type HydrationEntry = {
  id: string;
  date: string;
  milliliters: number;
  createdAt: string;
};

export type HydrationSnapshot = {
  date: string;
  entries: HydrationEntry[];
  totalMl: number;
};

export type TodaySnapshot = {
  activeWorkout: WorkoutRow | null;
  completedToday: number;
  pendingSync: number;
  todayPlan: CalendarPlanDay | null;
  streakCurrent: number;
  streakLongest: number;
  adherencePercentage: number | null;
  recoveryStatus: RecoveryState["status"];
  recoveryCompleteness: number;
  nutritionCalories: number;
  nutritionProtein: number;
  hydrationMl: number;
};

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function finiteOrNull(value: number | null) {
  return value === null || Number.isFinite(value);
}

export function exerciseContextKey(rawName: string) {
  const normalized = rawName.trim().replace(/\s+/g, " ").normalize("NFKC").toLocaleLowerCase("es");
  if (normalized.length < 2 || normalized.length > 80) throw new Error("Usa un nombre de ejercicio entre 2 y 80 caracteres.");
  return `exercise:${normalized}`;
}

function parseLoadOptions(json: string) {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed) || !parsed.every(value => typeof value === "number" && Number.isFinite(value) && value >= 0)) {
    throw new Error("Opciones de carga inválidas.");
  }
  return [...new Set(parsed)].sort((a, b) => a - b);
}

function profileFromRow(row: {
  context_key: string;
  name: string;
  current_load: number;
  prescribed_sets: number;
  min_reps: number;
  max_reps: number;
  target_rir: number;
  assisted: number;
  load_options_json: string;
  updated_at: string;
}): ExerciseProfile {
  return {
    contextKey: row.context_key,
    name: row.name,
    currentLoad: row.current_load,
    sets: row.prescribed_sets,
    minReps: row.min_reps,
    maxReps: row.max_reps,
    targetRir: row.target_rir,
    assisted: row.assisted === 1,
    loadOptions: parseLoadOptions(row.load_options_json),
    updatedAt: row.updated_at,
  };
}

function parseDate(date: string) {
  const stamp = Date.parse(date + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== date) {
    throw new Error("Fecha inválida.");
  }
  return new Date(stamp);
}

function addDays(date: string, amount: number) {
  const parsed = parseDate(date);
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}

function weekday(date: string) {
  return parseDate(date).getUTCDay();
}

function mondayOfWeek(date: string) {
  const current = parseDate(date);
  const day = current.getUTCDay();
  const delta = day === 0 ? -6 : 1 - day;
  current.setUTCDate(current.getUTCDate() + delta);
  return current.toISOString().slice(0, 10);
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
          context_key TEXT,
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

        CREATE TABLE IF NOT EXISTS exercise_profiles (
          context_key TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          current_load REAL NOT NULL CHECK(current_load >= 0),
          prescribed_sets INTEGER NOT NULL CHECK(prescribed_sets > 0),
          min_reps INTEGER NOT NULL CHECK(min_reps > 0),
          max_reps INTEGER NOT NULL CHECK(max_reps >= min_reps),
          target_rir REAL NOT NULL CHECK(target_rir BETWEEN 0 AND 10),
          assisted INTEGER NOT NULL CHECK(assisted IN (0, 1)),
          load_options_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS weekly_plan_days (
          weekday INTEGER PRIMARY KEY NOT NULL CHECK(weekday BETWEEN 0 AND 6),
          kind TEXT NOT NULL CHECK(kind IN ('training', 'rest', 'unplanned')),
          title TEXT NOT NULL DEFAULT '',
          description TEXT NOT NULL DEFAULT '',
          photo_uri TEXT,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS plan_meta (
          id INTEGER PRIMARY KEY NOT NULL CHECK(id = 1),
          activated_on TEXT
        );

        CREATE TABLE IF NOT EXISTS plan_days (
          date TEXT PRIMARY KEY NOT NULL,
          kind TEXT NOT NULL CHECK(kind IN ('training', 'rest', 'unplanned')),
          title TEXT NOT NULL DEFAULT '',
          description TEXT NOT NULL DEFAULT '',
          photo_uri TEXT,
          planned INTEGER NOT NULL CHECK(planned IN (0, 1))
        );

        CREATE TABLE IF NOT EXISTS daily_signals (
          date TEXT PRIMARY KEY NOT NULL,
          sleep_minutes INTEGER,
          steps INTEGER,
          energy INTEGER CHECK(energy IS NULL OR (energy BETWEEN 1 AND 5)),
          soreness INTEGER CHECK(soreness IS NULL OR (soreness BETWEEN 1 AND 5))
        );

        CREATE TABLE IF NOT EXISTS nutrition_entries (
          id TEXT PRIMARY KEY NOT NULL,
          date TEXT NOT NULL,
          meal TEXT NOT NULL CHECK(meal IN ('preworkout', 'breakfast', 'lunch', 'dinner', 'snack', 'other')),
          name TEXT NOT NULL,
          grams REAL NOT NULL CHECK(grams > 0),
          source TEXT NOT NULL CHECK(source IN ('manual', 'barcode', 'photo')),
          calories REAL NOT NULL CHECK(calories >= 0),
          protein REAL NOT NULL CHECK(protein >= 0),
          carbs REAL NOT NULL CHECK(carbs >= 0),
          fat REAL NOT NULL CHECK(fat >= 0),
          fiber REAL,
          barcode TEXT,
          brand TEXT,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_nutrition_entries_date
          ON nutrition_entries(date, created_at);

        CREATE TABLE IF NOT EXISTS hydration_entries (
          id TEXT PRIMARY KEY NOT NULL,
          date TEXT NOT NULL,
          milliliters INTEGER NOT NULL CHECK(milliliters > 0 AND milliliters <= 5000),
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_hydration_entries_date
          ON hydration_entries(date, created_at);

        CREATE TABLE IF NOT EXISTS sync_outbox (
          id TEXT PRIMARY KEY NOT NULL,
          entity TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          operation TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);

      const exerciseColumns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(workout_exercises)");
      if (!exerciseColumns.some((column) => column.name === "context_key")) {
        await db.execAsync("ALTER TABLE workout_exercises ADD COLUMN context_key TEXT;");
      }

      const weeklyColumns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(weekly_plan_days)");
      if (!weeklyColumns.some((column) => column.name === "photo_uri")) {
        await db.execAsync("ALTER TABLE weekly_plan_days ADD COLUMN photo_uri TEXT;");
      }
      const planColumns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(plan_days)");
      if (!planColumns.some((column) => column.name === "photo_uri")) {
        await db.execAsync("ALTER TABLE plan_days ADD COLUMN photo_uri TEXT;");
      }

      const nutritionColumns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(nutrition_entries)");
      if (!nutritionColumns.some((column) => column.name === "barcode")) {
        await db.execAsync("ALTER TABLE nutrition_entries ADD COLUMN barcode TEXT;");
      }
      if (!nutritionColumns.some((column) => column.name === "brand")) {
        await db.execAsync("ALTER TABLE nutrition_entries ADD COLUMN brand TEXT;");
      }

      await db.runAsync("INSERT OR IGNORE INTO plan_meta (id, activated_on) VALUES (1, NULL)");
      const now = new Date().toISOString();
      for (let day = 0; day < 7; day += 1) {
        await db.runAsync(
          "INSERT OR IGNORE INTO weekly_plan_days (weekday, kind, title, description, updated_at) VALUES (?, 'unplanned', '', '', ?)",
          day,
          now,
        );
      }
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

async function ensurePlanDays(db: SQLite.SQLiteDatabase, today = localDate()) {
  const meta = await db.getFirstAsync<{ activated_on: string | null }>(
    "SELECT activated_on FROM plan_meta WHERE id = 1",
  );
  if (!meta?.activated_on) return;

  const week = await db.getAllAsync<WeeklyPlanDay>(
    "SELECT weekday, kind, title, description, photo_uri AS photoUri FROM weekly_plan_days",
  );
  const byWeekday = new Map(week.map((day) => [day.weekday, day]));
  const horizon = addDays(today, 42);

  for (let date = meta.activated_on; date <= horizon; date = addDays(date, 1)) {
    const template = byWeekday.get(weekday(date));
    if (!template) throw new Error("Plan semanal incompleto.");
    await db.runAsync(
      "INSERT OR IGNORE INTO plan_days (date, kind, title, description, photo_uri, planned) VALUES (?, ?, ?, ?, ?, ?)",
      date,
      template.kind,
      template.title,
      template.description,
      template.photoUri,
      template.kind === "training" ? 1 : 0,
    );
  }
}

async function planMetrics(db: SQLite.SQLiteDatabase, today = localDate()) {
  await ensurePlanDays(db, today);
  const meta = await db.getFirstAsync<{ activated_on: string | null }>(
    "SELECT activated_on FROM plan_meta WHERE id = 1",
  );

  if (!meta?.activated_on) {
    return {
      activatedOn: null,
      current: 0,
      longest: 0,
      planned: 0,
      completed: 0,
      percentage: null as number | null,
    };
  }

  const rows = await db.getAllAsync<CalendarPlanDay>(`
    SELECT
      p.date,
      p.kind,
      p.title,
      p.description,
      p.photo_uri AS photoUri,
      p.planned,
      CASE WHEN p.kind = 'training' AND EXISTS (
        SELECT 1 FROM workouts w
        WHERE w.date = p.date AND w.status = 'completed'
      ) THEN 1 ELSE 0 END AS completed
    FROM plan_days p
    WHERE p.date >= ? AND p.date < ?
    ORDER BY p.date ASC
  `, meta.activated_on, today);

  const streak = adherence(
    rows.map((row) => ({
      date: row.date,
      kind: row.kind,
      planned: row.planned,
      completed: row.completed,
    })),
    today,
  );

  return {
    activatedOn: meta.activated_on,
    ...streak,
  };
}

export async function loadPlanSnapshot(today = localDate()): Promise<PlanSnapshot> {
  const db = await database();
  await ensurePlanDays(db, today);

  const week = await db.getAllAsync<WeeklyPlanDay>(`
    SELECT weekday, kind, title, description, photo_uri AS photoUri
    FROM weekly_plan_days
    ORDER BY CASE weekday WHEN 0 THEN 7 ELSE weekday END ASC
  `);

  const start = mondayOfWeek(today);
  const end = addDays(start, 6);
  const calendar = await db.getAllAsync<CalendarPlanDay>(`
    SELECT
      p.date,
      p.kind,
      p.title,
      p.description,
      p.photo_uri AS photoUri,
      p.planned,
      CASE WHEN p.kind = 'training' AND EXISTS (
        SELECT 1 FROM workouts w
        WHERE w.date = p.date AND w.status = 'completed'
      ) THEN 1 ELSE 0 END AS completed
    FROM plan_days p
    WHERE p.date BETWEEN ? AND ?
    ORDER BY p.date ASC
  `, start, end);

  const metrics = await planMetrics(db, today);
  return {
    activatedOn: metrics.activatedOn,
    week,
    calendar,
    streak: {
      current: metrics.current,
      longest: metrics.longest,
      planned: metrics.planned,
      completed: metrics.completed,
      percentage: metrics.percentage,
    },
  };
}

export async function saveWeeklyPlanDay(
  weekdayValue: number,
  kind: PlanKind,
  rawTitle: string,
  rawDescription: string,
  photoUri: string | null = null,
  today = localDate(),
) {
  if (!Number.isInteger(weekdayValue) || weekdayValue < 0 || weekdayValue > 6) throw new Error("Día inválido.");
  if (!["training", "rest", "unplanned"].includes(kind)) throw new Error("Tipo de día inválido.");

  const title = rawTitle.trim().replace(/\s+/g, " ");
  const description = rawDescription.trim();
  if (kind === "training" && (title.length < 2 || title.length > 80)) {
    throw new Error("Pon un nombre de 2 a 80 caracteres para el entrenamiento.");
  }
  if (description.length > 400) throw new Error("La descripción no puede superar 400 caracteres.");
  if (photoUri !== null && !photoUri.startsWith("file://")) throw new Error("La imagen del plan debe ser local.");

  const db = await database();
  const updatedAt = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "UPDATE weekly_plan_days SET kind = ?, title = ?, description = ?, photo_uri = ?, updated_at = ? WHERE weekday = ?",
      kind,
      kind === "training" ? title : "",
      description,
      photoUri,
      updatedAt,
      weekdayValue,
    );

    const meta = await db.getFirstAsync<{ activated_on: string | null }>(
      "SELECT activated_on FROM plan_meta WHERE id = 1",
    );
    if (!meta?.activated_on && kind !== "unplanned") {
      await db.runAsync("UPDATE plan_meta SET activated_on = ? WHERE id = 1", today);
    }

    const startedToday = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM workouts WHERE date = ? LIMIT 1",
      today,
    );
    const effectiveFrom = startedToday ? addDays(today, 1) : today;
    await db.runAsync("DELETE FROM plan_days WHERE date >= ?", effectiveFrom);
    await queue(db, "weekly_plan_day", String(weekdayValue), "upsert", {
      weekday: weekdayValue,
      kind,
      title: kind === "training" ? title : "",
      description,
      photoUri,
      effectiveFrom,
    });
  });

  await ensurePlanDays(db, today);
}

export async function loadRecovery(date = localDate()): Promise<RecoverySnapshot> {
  parseDate(date);
  const db = await database();
  const row = await db.getFirstAsync<{
    sleep_minutes: number | null;
    steps: number | null;
    energy: number | null;
    soreness: number | null;
  }>(
    "SELECT sleep_minutes, steps, energy, soreness FROM daily_signals WHERE date = ?",
    date,
  );
  const signals: RecoverySignals = {
    sleepMinutes: row?.sleep_minutes ?? null,
    steps: row?.steps ?? null,
    energy: row?.energy ?? null,
    soreness: row?.soreness ?? null,
  };
  return { date, signals, state: recoveryState(signals) };
}

export async function saveRecovery(
  signals: RecoverySignals,
  date = localDate(),
): Promise<RecoverySnapshot> {
  parseDate(date);
  const state = recoveryState(signals);
  const db = await database();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO daily_signals (date, sleep_minutes, steps, energy, soreness)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET
         sleep_minutes = excluded.sleep_minutes,
         steps = excluded.steps,
         energy = excluded.energy,
         soreness = excluded.soreness`,
      date,
      signals.sleepMinutes,
      signals.steps,
      signals.energy,
      signals.soreness,
    );
    await queue(db, "daily_signal", date, "upsert", {
      date,
      ...signals,
      recoveryState: state.status,
      policyVersion: state.policyVersion,
    });
  });
  return { date, signals, state };
}

function nutritionEntryFromRow(row: {
  id: string;
  date: string;
  meal: NutritionMeal;
  name: string;
  grams: number;
  source: "manual" | "barcode" | "photo";
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  barcode: string | null;
  brand: string | null;
  created_at: string;
}): NutritionEntry {
  return {
    id: row.id,
    date: row.date,
    meal: row.meal,
    name: row.name,
    grams: row.grams,
    source: row.source,
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    fiber: row.fiber,
    barcode: row.barcode,
    brand: row.brand,
    createdAt: row.created_at,
  };
}

export async function loadNutritionDay(date = localDate()): Promise<NutritionDaySnapshot> {
  parseDate(date);
  const db = await database();
  const rows = await db.getAllAsync<{
    id: string;
    date: string;
    meal: NutritionMeal;
    name: string;
    grams: number;
    source: "manual" | "barcode" | "photo";
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number | null;
    barcode: string | null;
    brand: string | null;
    created_at: string;
  }>(
    "SELECT id, date, meal, name, grams, source, calories, protein, carbs, fat, fiber, barcode, brand, created_at FROM nutrition_entries WHERE date = ? ORDER BY created_at DESC",
    date,
  );
  const entries = rows.map(nutritionEntryFromRow);
  const totals = entries.reduce(
    (acc, entry) => ({
      calories: acc.calories + entry.calories,
      protein: acc.protein + entry.protein,
      carbs: acc.carbs + entry.carbs,
      fat: acc.fat + entry.fat,
      fiber: acc.fiber + (entry.fiber ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
  return { date, entries, totals };
}

export async function saveManualNutritionEntry(input: {
  meal: NutritionMeal;
  name: string;
  grams: number;
  per100: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number | null;
  };
}, date = localDate()) {
  parseDate(date);
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 100) throw new Error("Usa un nombre de alimento entre 2 y 100 caracteres.");
  if (!["preworkout", "breakfast", "lunch", "dinner", "snack", "other"].includes(input.meal)) throw new Error("Comida inválida.");
  if (!Number.isFinite(input.grams) || input.grams <= 0 || input.grams > 10000) throw new Error("Cantidad inválida.");

  const scaled = scaleNutrients(
    {
      calories: input.per100.calories,
      protein: input.per100.protein,
      carbs: input.per100.carbs,
      fat: input.per100.fat,
      fiber: input.per100.fiber,
    },
    input.grams,
    100,
  );
  const calories = scaled.calories;
  const protein = scaled.protein;
  const carbs = scaled.carbs;
  const fat = scaled.fat;
  const fiber = scaled.fiber ?? null;
  if (calories == null || protein == null || carbs == null || fat == null) throw new Error("Macros incompletos.");

  const db = await database();
  const entryId = id("nutrition");
  const createdAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO nutrition_entries (
        id, date, meal, name, grams, source, calories, protein, carbs, fat, fiber, created_at
      ) VALUES (?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?)`,
      entryId,
      date,
      input.meal,
      name,
      input.grams,
      calories,
      protein,
      carbs,
      fat,
      fiber,
      createdAt,
    );
    await queue(db, "nutrition_entry", entryId, "upsert", {
      id: entryId,
      date,
      meal: input.meal,
      name,
      grams: input.grams,
      source: "manual",
      calories,
      protein,
      carbs,
      fat,
      fiber,
      createdAt,
    });
  });
  return loadNutritionDay(date);
}


export async function saveBarcodeNutritionEntry(input: {
  meal: NutritionMeal;
  barcode: string;
  brand: string | null;
  name: string;
  grams: number;
  per100: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number | null;
  };
}, date = localDate()) {
  parseDate(date);
  const barcode = input.barcode.trim();
  const name = input.name.trim().replace(/\s+/g, " ");
  const brand = input.brand?.trim().replace(/\s+/g, " ") || null;
  if (!/^\d{6,14}$/.test(barcode)) throw new Error("Código de barras inválido.");
  if (name.length < 2 || name.length > 100) throw new Error("Usa un nombre de alimento entre 2 y 100 caracteres.");
  if (!["preworkout", "breakfast", "lunch", "dinner", "snack", "other"].includes(input.meal)) throw new Error("Comida inválida.");
  if (!Number.isFinite(input.grams) || input.grams <= 0 || input.grams > 10000) throw new Error("Cantidad inválida.");

  const scaled = scaleNutrients(
    {
      calories: input.per100.calories,
      protein: input.per100.protein,
      carbs: input.per100.carbs,
      fat: input.per100.fat,
      fiber: input.per100.fiber,
    },
    input.grams,
    100,
  );
  const calories = scaled.calories;
  const protein = scaled.protein;
  const carbs = scaled.carbs;
  const fat = scaled.fat;
  const fiber = scaled.fiber ?? null;
  if (calories == null || protein == null || carbs == null || fat == null) throw new Error("Completa los macros antes de confirmar.");

  const db = await database();
  const entryId = id("nutrition");
  const createdAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO nutrition_entries (
        id, date, meal, name, grams, source, calories, protein, carbs, fat, fiber, barcode, brand, created_at
      ) VALUES (?, ?, ?, ?, ?, 'barcode', ?, ?, ?, ?, ?, ?, ?, ?)`,
      entryId,
      date,
      input.meal,
      name,
      input.grams,
      calories,
      protein,
      carbs,
      fat,
      fiber,
      barcode,
      brand,
      createdAt,
    );
    await queue(db, "nutrition_entry", entryId, "upsert", {
      id: entryId,
      date,
      meal: input.meal,
      name,
      grams: input.grams,
      source: "barcode",
      barcode,
      brand,
      calories,
      protein,
      carbs,
      fat,
      fiber,
      createdAt,
    });
  });
  return loadNutritionDay(date);
}

export async function deleteNutritionEntry(entryId: string) {
  const db = await database();
  const existing = await db.getFirstAsync<{ id: string; date: string }>(
    "SELECT id, date FROM nutrition_entries WHERE id = ?",
    entryId,
  );
  if (!existing) throw new Error("Registro nutricional no encontrado.");
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM nutrition_entries WHERE id = ?", entryId);
    await queue(db, "nutrition_entry", entryId, "delete", { id: entryId, date: existing.date });
  });
  return loadNutritionDay(existing.date);
}

export async function loadHydration(date = localDate()): Promise<HydrationSnapshot> {
  parseDate(date);
  const db = await database();
  const rows = await db.getAllAsync<{
    id: string;
    date: string;
    milliliters: number;
    created_at: string;
  }>(
    "SELECT id, date, milliliters, created_at FROM hydration_entries WHERE date = ? ORDER BY created_at DESC",
    date,
  );
  const entries = rows.map((row) => ({
    id: row.id,
    date: row.date,
    milliliters: row.milliliters,
    createdAt: row.created_at,
  }));
  return {
    date,
    entries,
    totalMl: entries.reduce((sum, entry) => sum + entry.milliliters, 0),
  };
}

export async function addHydration(milliliters: number, date = localDate()) {
  parseDate(date);
  if (!Number.isInteger(milliliters) || milliliters <= 0 || milliliters > 5000) {
    throw new Error("La cantidad debe ser un número entero entre 1 y 5000 ml.");
  }
  const db = await database();
  const entryId = id("water");
  const createdAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "INSERT INTO hydration_entries (id, date, milliliters, created_at) VALUES (?, ?, ?, ?)",
      entryId,
      date,
      milliliters,
      createdAt,
    );
    await queue(db, "hydration_entry", entryId, "upsert", {
      id: entryId,
      date,
      milliliters,
      createdAt,
    });
  });
  return loadHydration(date);
}

export async function deleteHydration(entryId: string) {
  const db = await database();
  const existing = await db.getFirstAsync<{ date: string }>(
    "SELECT date FROM hydration_entries WHERE id = ?",
    entryId,
  );
  if (!existing) throw new Error("Registro de hidratación no encontrado.");
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM hydration_entries WHERE id = ?", entryId);
    await queue(db, "hydration_entry", entryId, "delete", { id: entryId, date: existing.date });
  });
  return loadHydration(existing.date);
}

export async function loadToday(date = localDate()): Promise<TodaySnapshot> {
  const db = await database();
  await ensurePlanDays(db, date);

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
  const todayPlan = await db.getFirstAsync<CalendarPlanDay>(`
    SELECT
      p.date,
      p.kind,
      p.title,
      p.description,
      p.photo_uri AS photoUri,
      p.planned,
      CASE WHEN p.kind = 'training' AND EXISTS (
        SELECT 1 FROM workouts w
        WHERE w.date = p.date AND w.status = 'completed'
      ) THEN 1 ELSE 0 END AS completed
    FROM plan_days p
    WHERE p.date = ?
  `, date);
  const metrics = await planMetrics(db, date);
  const recoveryRow = await db.getFirstAsync<{
    sleep_minutes: number | null;
    steps: number | null;
    energy: number | null;
    soreness: number | null;
  }>(
    "SELECT sleep_minutes, steps, energy, soreness FROM daily_signals WHERE date = ?",
    date,
  );
  const recovery = recoveryState({
    sleepMinutes: recoveryRow?.sleep_minutes ?? null,
    steps: recoveryRow?.steps ?? null,
    energy: recoveryRow?.energy ?? null,
    soreness: recoveryRow?.soreness ?? null,
  });
  const nutritionTotals = await db.getFirstAsync<{ calories: number | null; protein: number | null }>(
    "SELECT SUM(calories) AS calories, SUM(protein) AS protein FROM nutrition_entries WHERE date = ?",
    date,
  );
  const hydrationTotal = await db.getFirstAsync<{ total_ml: number | null }>(
    "SELECT SUM(milliliters) AS total_ml FROM hydration_entries WHERE date = ?",
    date,
  );

  return {
    activeWorkout: activeWorkout ?? null,
    completedToday: completed?.count ?? 0,
    pendingSync: outbox?.count ?? 0,
    todayPlan: todayPlan ?? null,
    streakCurrent: metrics.current,
    streakLongest: metrics.longest,
    adherencePercentage: metrics.percentage,
    recoveryStatus: recovery.status,
    recoveryCompleteness: recovery.completeness,
    nutritionCalories: nutritionTotals?.calories ?? 0,
    nutritionProtein: nutritionTotals?.protein ?? 0,
    hydrationMl: hydrationTotal?.total_ml ?? 0,
  };
}

export async function createQuickWorkout(date = localDate()) {
  const db = await database();
  await ensurePlanDays(db, date);

  const alreadyActive = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM workouts WHERE date = ? AND status = 'active' LIMIT 1",
    date,
  );
  if (alreadyActive) return alreadyActive.id;

  const planned = await db.getFirstAsync<{ kind: PlanKind; title: string }>(
    "SELECT kind, title FROM plan_days WHERE date = ?",
    date,
  );
  const title = planned?.kind === "training" && planned.title ? planned.title : "Sesión libre";
  const workoutId = id("workout");
  const startedAt = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "INSERT INTO workouts (id, date, title, status, started_at, completed_at) VALUES (?, ?, ?, 'active', ?, NULL)",
      workoutId,
      date,
      title,
      startedAt,
    );
    await queue(db, "workout", workoutId, "upsert", {
      id: workoutId,
      date,
      title,
      status: "active",
      startedAt,
    });
  });

  return workoutId;
}

export async function loadExerciseProgression(contextKey: string): Promise<ExerciseProgressionSnapshot> {
  const db = await database();
  const row = await db.getFirstAsync<{
    context_key: string;
    name: string;
    current_load: number;
    prescribed_sets: number;
    min_reps: number;
    max_reps: number;
    target_rir: number;
    assisted: number;
    load_options_json: string;
    updated_at: string;
  }>(
    "SELECT context_key, name, current_load, prescribed_sets, min_reps, max_reps, target_rir, assisted, load_options_json, updated_at FROM exercise_profiles WHERE context_key = ?",
    contextKey,
  );

  if (!row) return { profile: null, proposal: null, exposureCount: 0 };
  const profile = profileFromRow(row);

  const setRows = await db.getAllAsync<{
    workout_id: string;
    started_at: string;
    set_index: number;
    load_kg: number | null;
    reps: number | null;
    rir: number | null;
    completed: number;
  }>(`
    SELECT
      w.id AS workout_id,
      w.started_at,
      s.set_index,
      s.load_kg,
      s.reps,
      s.rir,
      s.completed
    FROM workout_exercises e
    JOIN workouts w ON w.id = e.workout_id
    JOIN workout_sets s ON s.workout_id = e.workout_id AND s.exercise_key = e.id
    WHERE e.context_key = ? AND w.status = 'completed'
    ORDER BY w.started_at ASC, s.set_index ASC
  `, contextKey);

  const grouped = new Map<string, typeof setRows>();
  for (const set of setRows) {
    const current = grouped.get(set.workout_id) ?? [];
    current.push(set);
    grouped.set(set.workout_id, current);
  }
  const sessions = [...grouped.entries()];
  const recent = sessions.slice(-2);
  const evidence = recent.map(([workoutId]) => workoutId);

  if (recent.some(([, sets]) => sets.some(set => set.load_kg === null || set.reps === null))) {
    return {
      profile,
      exposureCount: sessions.length,
      proposal: {
        action: "hold",
        load: profile.currentLoad,
        reasons: ["incomplete_record"],
        evidence,
        confidence: evidence.length >= 2 ? "moderate" : "low",
        policyVersion: "double-progression-v1",
      },
    };
  }

  const exposures: Exposure[] = sessions.map(([workoutId, sets]) => ({
    id: workoutId,
    contextKey,
    sets: sets.map(set => ({
      load: set.load_kg!,
      reps: set.reps!,
      rir: set.rir,
      completed: set.completed === 1,
    })),
  }));

  return {
    profile,
    exposureCount: sessions.length,
    proposal: nextPrescription(
      {
        contextKey,
        load: profile.currentLoad,
        sets: profile.sets,
        minReps: profile.minReps,
        maxReps: profile.maxReps,
        targetRir: profile.targetRir,
        assisted: profile.assisted,
      },
      exposures,
      profile.loadOptions,
    ),
  };
}

export async function saveExerciseProfile(input: {
  contextKey: string;
  name: string;
  currentLoad: number;
  sets: number;
  minReps: number;
  maxReps: number;
  targetRir: number;
  assisted: boolean;
  loadOptions: number[];
}) {
  const expectedKey = exerciseContextKey(input.name);
  if (expectedKey !== input.contextKey) throw new Error("El contexto del ejercicio cambió; vuelve a añadirlo con el nuevo nombre.");
  if (!Number.isFinite(input.currentLoad) || input.currentLoad < 0) throw new Error("Carga actual inválida.");
  if (!Number.isInteger(input.sets) || input.sets < 1 || input.sets > 20) throw new Error("Número de series inválido.");
  if (!Number.isInteger(input.minReps) || !Number.isInteger(input.maxReps) || input.minReps < 1 || input.maxReps < input.minReps || input.maxReps > 100) {
    throw new Error("Rango de repeticiones inválido.");
  }
  if (!Number.isFinite(input.targetRir) || input.targetRir < 0 || input.targetRir > 10) throw new Error("RIR objetivo inválido.");

  const loadOptions = [...new Set(input.loadOptions)].sort((a, b) => a - b);
  if (!loadOptions.length || loadOptions.some(value => !Number.isFinite(value) || value < 0)) throw new Error("Añade las cargas disponibles.");
  if (!loadOptions.includes(input.currentLoad)) throw new Error("La carga actual debe estar dentro de las cargas disponibles.");

  // Reuse domain validation before persisting a profile.
  nextPrescription(
    {
      contextKey: input.contextKey,
      load: input.currentLoad,
      sets: input.sets,
      minReps: input.minReps,
      maxReps: input.maxReps,
      targetRir: input.targetRir,
      assisted: input.assisted,
    },
    [],
    loadOptions,
  );

  const db = await database();
  const updatedAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO exercise_profiles (
        context_key, name, current_load, prescribed_sets, min_reps, max_reps,
        target_rir, assisted, load_options_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(context_key) DO UPDATE SET
        name = excluded.name,
        current_load = excluded.current_load,
        prescribed_sets = excluded.prescribed_sets,
        min_reps = excluded.min_reps,
        max_reps = excluded.max_reps,
        target_rir = excluded.target_rir,
        assisted = excluded.assisted,
        load_options_json = excluded.load_options_json,
        updated_at = excluded.updated_at`,
      input.contextKey,
      input.name,
      input.currentLoad,
      input.sets,
      input.minReps,
      input.maxReps,
      input.targetRir,
      input.assisted ? 1 : 0,
      JSON.stringify(loadOptions),
      updatedAt,
    );
    await queue(db, "exercise_profile", input.contextKey, "upsert", {
      ...input,
      loadOptions,
      updatedAt,
    });
  });

  return loadExerciseProgression(input.contextKey);
}

export async function adoptProgressionLoad(contextKey: string, load: number) {
  const snapshot = await loadExerciseProgression(contextKey);
  if (!snapshot.profile) throw new Error("Configura primero la progresión.");
  if (!snapshot.profile.loadOptions.includes(load)) throw new Error("Esa carga no está disponible en el perfil.");

  return saveExerciseProfile({
    ...snapshot.profile,
    currentLoad: load,
  });
}

export async function loadWorkoutExercises(workoutId: string): Promise<WorkoutExercise[]> {
  const db = await database();
  const exercises = await db.getAllAsync<WorkoutExerciseRow>(
    "SELECT id, workout_id, name, order_index, context_key FROM workout_exercises WHERE workout_id = ? ORDER BY order_index ASC",
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
  const contextKey = exerciseContextKey(name);

  const active = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM workouts WHERE id = ? AND status = 'active'",
    workoutId,
  );
  if (!active) throw new Error("El entrenamiento ya no está activo.");

  const duplicate = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM workout_exercises WHERE workout_id = ? AND context_key = ? LIMIT 1",
    workoutId,
    contextKey,
  );
  if (duplicate) throw new Error("Ese ejercicio ya está añadido en esta sesión.");

  const order = await db.getFirstAsync<{ next_order: number }>(
    "SELECT COALESCE(MAX(order_index), 0) + 1 AS next_order FROM workout_exercises WHERE workout_id = ?",
    workoutId,
  );

  const exerciseId = id("exercise");
  const orderIndex = order?.next_order ?? 1;
  const profile = await db.getFirstAsync<{ current_load: number; prescribed_sets: number }>(
    "SELECT current_load, prescribed_sets FROM exercise_profiles WHERE context_key = ?",
    contextKey,
  );
  const plannedSets = profile?.prescribed_sets ?? 1;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "INSERT INTO workout_exercises (id, workout_id, name, order_index, context_key) VALUES (?, ?, ?, ?, ?)",
      exerciseId,
      workoutId,
      name,
      orderIndex,
      contextKey,
    );
    for (let setIndex = 1; setIndex <= plannedSets; setIndex += 1) {
      await db.runAsync(
        "INSERT INTO workout_sets (id, workout_id, exercise_key, set_index, load_kg, completed) VALUES (?, ?, ?, ?, ?, 0)",
        id("set"),
        workoutId,
        exerciseId,
        setIndex,
        profile?.current_load ?? null,
      );
    }
    await queue(db, "workout_exercise", exerciseId, "upsert", {
      id: exerciseId,
      workoutId,
      name,
      orderIndex,
      contextKey,
    });
  });

  return exerciseId;
}

export async function addSet(workoutId: string, exerciseId: string) {
  const db = await database();
  const exercise = await db.getFirstAsync<{ id: string; context_key: string | null }>(
    "SELECT id, context_key FROM workout_exercises WHERE id = ? AND workout_id = ?",
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
  const profile = exercise.context_key
    ? await db.getFirstAsync<{ current_load: number }>(
        "SELECT current_load FROM exercise_profiles WHERE context_key = ?",
        exercise.context_key,
      )
    : null;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "INSERT INTO workout_sets (id, workout_id, exercise_key, set_index, load_kg, completed) VALUES (?, ?, ?, ?, ?, 0)",
      setId,
      workoutId,
      exerciseId,
      setIndex,
      profile?.current_load ?? null,
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
