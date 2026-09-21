export type SetResult = { load: number; reps: number; rir: number | null; completed: boolean };
export type Prescription = { contextKey: string; load: number; sets: number; minReps: number; maxReps: number; targetRir: number; assisted: boolean };
export type Exposure = { id: string; contextKey: string; sets: SetResult[] };
export type Proposal = { action: "increase" | "hold" | "reduce" | "review"; load: number; reasons: string[]; evidence: string[]; confidence: "low" | "moderate"; policyVersion: string };
const finite = (n: number) => Number.isFinite(n);
function check(ok: boolean, message: string): asserts ok { if (!ok) throw new Error(message); }
export function nextPrescription(p: Prescription, sessions: Exposure[], options: number[], pain = false): Proposal {
  check(finite(p.load) && p.load >= 0, "Invalid load");
  check(Number.isInteger(p.sets) && p.sets > 0, "Invalid set count");
  check(Number.isInteger(p.minReps) && Number.isInteger(p.maxReps) && p.minReps > 0 && p.maxReps >= p.minReps, "Invalid rep range");
  check(finite(p.targetRir) && p.targetRir >= 0 && p.targetRir <= 10, "Invalid RIR");
  check(options.every(n => finite(n) && n >= 0), "Invalid load options");
  const result = (action: Proposal["action"], load: number, reasons: string[], evidence: string[] = []): Proposal =>
    ({ action, load, reasons, evidence, confidence: evidence.length >= 2 ? "moderate" : "low", policyVersion: "double-progression-v1" });
  if (pain) return result("review", p.load, ["pain_reported"]);
  check(new Set(sessions.map(s => s.id)).size === sessions.length, "Duplicate session");
  const comparable = sessions.filter(s => s.contextKey === p.contextKey);
  const recent = comparable.slice(-2);
  if (!recent.length) return result("hold", p.load, ["insufficient_data"]);
  for (const s of recent) for (const x of s.sets) {
    check(finite(x.load) && x.load >= 0 && Number.isInteger(x.reps) && x.reps >= 0, "Invalid set");
    check(x.rir === null || (finite(x.rir) && x.rir >= 0 && x.rir <= 10), "Invalid set RIR");
  }
  const evidence = recent.map(s => s.id);
  const last = recent[recent.length - 1];
  if (last.sets.length !== p.sets || last.sets.some(s => !s.completed))
    return result("hold", p.load, ["incomplete_session"], evidence);
  if (last.sets.some(s => s.load !== p.load))
    return result("hold", p.load, ["load_not_comparable"], evidence);
  if (last.sets.some(s => s.rir === null))
    return result("hold", p.load, ["missing_rir"], evidence);
  const loads = [...new Set(options)].sort((a,b) => a-b);
  const easier = p.assisted ? loads.find(n => n > p.load) : loads.filter(n => n < p.load).at(-1);
  if (last.sets.some(s => s.reps < p.minReps || s.rir! < p.targetRir))
    return result(easier === undefined ? "review" : "reduce", easier ?? p.load, ["below_prescribed_range_or_reserve"], evidence);
  const mastered = recent.length === 2 && recent.every(s => s.sets.length === p.sets &&
    s.sets.every(x => x.completed && x.load === p.load && x.reps >= p.maxReps && x.rir !== null && x.rir >= p.targetRir));
  if (!mastered) return result("hold", p.load, ["confirm_range_at_target_reserve"], evidence);
  const harder = p.assisted ? loads.filter(n => n < p.load).at(-1) : loads.find(n => n > p.load);
  return result(harder === undefined ? "hold" : "increase", harder ?? p.load, [harder === undefined ? "no_available_increment" : "two_comparable_exposures_at_ceiling"], evidence);
}
export type PlanDay = { date: string; kind: "rest" | "training" | "unplanned"; planned: number; completed: number; excused?: boolean };
function dayNumber(date: string) {
  check(/^\d{4}-\d{2}-\d{2}$/.test(date), "Invalid date");
  const stamp = Date.parse(date + "T00:00:00Z");
  check(finite(stamp) && new Date(stamp).toISOString().slice(0,10) === date, "Invalid date");
  return stamp / 86400000;
}
export function adherence(days: PlanDay[], today: string) {
  const cutoff = dayNumber(today);
  check(new Set(days.map(d => d.date)).size === days.length, "Duplicate day");
  let current = 0, longest = 0, planned = 0, completed = 0;
  const sorted = [...days].sort((a,b) => a.date.localeCompare(b.date));
  let prior: number | undefined;
  for (const d of sorted) {
    const n = dayNumber(d.date);
    check(Number.isInteger(d.planned) && Number.isInteger(d.completed) && d.planned >= 0 && d.completed >= 0 && d.completed <= d.planned, "Invalid counts");
    if (n >= cutoff) continue;
    if (prior !== undefined) check(n === prior + 1, "Incomplete calendar coverage");
    prior = n;
    if (d.kind === "unplanned" || d.excused) continue;
    if (d.kind === "rest") { check(d.planned === 0, "Rest has planned sessions"); current++; }
    else {
      check(d.planned > 0, "Training needs sessions");
      planned += d.planned; completed += d.completed;
      current = d.completed === d.planned ? current + 1 : 0;
    }
    longest = Math.max(longest, current);
  }
  check(prior === undefined || prior === cutoff - 1, "Calendar does not cover yesterday");
  return { current, longest, planned, completed, percentage: planned ? completed / planned * 100 : null };
}
export function toKg(value: number, unit: "kg" | "lb"): number {
  check(finite(value) && value >= 0, "Invalid weight");
  check(unit === "kg" || unit === "lb", "Invalid unit");
  return unit === "lb" ? value * 0.45359237 : value;
}
export function scaleNutrients(nutrients: Record<string, number | null>, consumedGrams: number, referenceGrams: number) {
  check(finite(consumedGrams) && consumedGrams >= 0 && finite(referenceGrams) && referenceGrams > 0, "Invalid portion");
  return Object.fromEntries(Object.entries(nutrients).map(([k,v]) => {
    check(v === null || (finite(v) && v >= 0), "Invalid nutrient");
    return [k, v === null ? null : v * consumedGrams / referenceGrams];
  }));
}
export function agePolicy(age: number | null) {
  check(age === null || (Number.isInteger(age) && age >= 0 && age <= 120), "Invalid age");
  const protectedMode = age === null || age < 18;
  return { protectedMode, automatedCalorieRestriction: false, aiAppearanceAssessment: !protectedMode, appearanceRewards: false };
}
