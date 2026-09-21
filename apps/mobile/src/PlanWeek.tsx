import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  loadPlanSnapshot,
  localDate,
  saveWeeklyPlanDay,
  type CalendarPlanDay,
  type PlanKind,
  type PlanSnapshot,
  type WeeklyPlanDay,
} from "./database";

const labels: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  0: "Domingo",
};

export function PlanWeek({ onChanged }: { onChanged: () => Promise<void> }) {
  const [snapshot, setSnapshot] = useState<PlanSnapshot | null>(null);
  const [savingWeekday, setSavingWeekday] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setSnapshot(await loadPlanSnapshot());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar el plan.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const calendarByWeekday = useMemo(() => {
    const map = new Map<number, CalendarPlanDay>();
    for (const day of snapshot?.calendar ?? []) {
      const parsed = new Date(day.date + "T00:00:00Z");
      map.set(parsed.getUTCDay(), day);
    }
    return map;
  }, [snapshot?.calendar]);

  async function save(day: WeeklyPlanDay) {
    try {
      setSavingWeekday(day.weekday);
      setError(null);
      await saveWeeklyPlanDay(day.weekday, day.kind, day.title, day.description);
      await refresh();
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el día.");
    } finally {
      setSavingWeekday(null);
    }
  }

  return (
    <View style={styles.wrap}>
      <View>
        <Text style={styles.eyebrow}>PLAN SEMANAL</Text>
        <Text style={styles.hero}>Tu semana define la racha. El descanso cuenta, faltar no.</Text>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.metrics}>
        <Metric label="Racha" value={String(snapshot?.streak.current ?? 0)} suffix="d" />
        <Metric label="Mejor" value={String(snapshot?.streak.longest ?? 0)} suffix="d" />
        <Metric
          label="Adherencia"
          value={
            snapshot?.streak.percentage === null || snapshot?.streak.percentage === undefined
              ? "—"
              : String(Math.round(snapshot.streak.percentage))
          }
          suffix={snapshot?.streak.percentage === null || snapshot?.streak.percentage === undefined ? "" : "%"}
        />
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>
          {snapshot?.activatedOn ? "Plan activo" : "Aún no has activado un plan"}
        </Text>
        <Text style={styles.infoBody}>
          {snapshot?.activatedOn
            ? `Historial activo desde ${formatShortDate(snapshot.activatedOn)}. Cambiar el plan no modifica los días que ya pasaron.`
            : "Configura al menos un día de entrenamiento o descanso. La racha empezará desde ese momento, sin castigarte por días anteriores."}
        </Text>
      </View>

      {(snapshot?.week ?? []).map((day) => (
        <DayEditor
          key={day.weekday}
          day={day}
          calendar={calendarByWeekday.get(day.weekday) ?? null}
          saving={savingWeekday === day.weekday}
          onSave={save}
        />
      ))}
    </View>
  );
}

function DayEditor({
  day,
  calendar,
  saving,
  onSave,
}: {
  day: WeeklyPlanDay;
  calendar: CalendarPlanDay | null;
  saving: boolean;
  onSave: (day: WeeklyPlanDay) => Promise<void>;
}) {
  const [kind, setKind] = useState<PlanKind>(day.kind);
  const [title, setTitle] = useState(day.title);
  const [description, setDescription] = useState(day.description);

  useEffect(() => {
    setKind(day.kind);
    setTitle(day.title);
    setDescription(day.description);
  }, [day.description, day.kind, day.title]);

  const dirty = kind !== day.kind || title !== day.title || description !== day.description;
  const status = calendarStatus(calendar);

  return (
    <View style={styles.dayCard}>
      <View style={styles.dayHeader}>
        <View>
          <Text style={styles.dayName}>{labels[day.weekday]}</Text>
          <Text style={styles.dayDate}>
            {calendar ? formatShortDate(calendar.date) : "Se materializa al activar el plan"}
          </Text>
        </View>
        <View style={[styles.statusBadge, status.tone === "good" && styles.statusGood, status.tone === "bad" && styles.statusBad]}>
          <Text style={styles.statusText}>{status.label}</Text>
        </View>
      </View>

      <View style={styles.kindRow}>
        <KindButton label="Entreno" active={kind === "training"} onPress={() => setKind("training")} />
        <KindButton label="Descanso" active={kind === "rest"} onPress={() => setKind("rest")} />
        <KindButton label="Libre" active={kind === "unplanned"} onPress={() => setKind("unplanned")} />
      </View>

      {kind === "training" ? (
        <TextInput
          value={title}
          onChangeText={setTitle}
          maxLength={80}
          placeholder="Nombre: Pierna, Upper A, Fútbol…"
          placeholderTextColor="#5F6B7A"
          style={styles.input}
        />
      ) : null}

      <TextInput
        value={description}
        onChangeText={setDescription}
        maxLength={400}
        multiline
        placeholder={
          kind === "training"
            ? "Descripción opcional: objetivo, notas, carga esperada…"
            : kind === "rest"
              ? "Descripción opcional: recuperación, movilidad, sueño…"
              : "Nota opcional"
        }
        placeholderTextColor="#5F6B7A"
        style={[styles.input, styles.descriptionInput]}
      />

      <Pressable
        accessibilityRole="button"
        disabled={saving || !dirty}
        onPress={() => void onSave({ ...day, kind, title, description })}
        style={({ pressed }) => [
          styles.saveButton,
          pressed && styles.pressed,
          (saving || !dirty) && styles.disabled,
        ]}
      >
        <Text style={styles.saveText}>{saving ? "Guardando…" : dirty ? "Guardar cambios" : "Guardado"}</Text>
      </Pressable>
    </View>
  );
}

function KindButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.kindButton,
        active && styles.kindButtonActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.kindText, active && styles.kindTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Metric({ label, value, suffix }: { label: string; value: string; suffix: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>
        {value}
        <Text style={styles.metricSuffix}>{suffix}</Text>
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function calendarStatus(day: CalendarPlanDay | null): { label: string; tone: "neutral" | "good" | "bad" } {
  if (!day) return { label: "Sin historial", tone: "neutral" };
  if (day.kind === "unplanned") return { label: "Libre", tone: "neutral" };
  if (day.kind === "rest") return { label: "Descanso", tone: "good" };
  if (day.completed > 0) return { label: "Hecho", tone: "good" };
  if (day.date < localDate()) return { label: "Fallado", tone: "bad" };
  return { label: "Pendiente", tone: "neutral" };
}

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
  }).format(new Date(date + "T12:00:00Z"));
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  eyebrow: { color: "#2E8BFF", fontSize: 11, fontWeight: "900", letterSpacing: 1.6 },
  hero: { color: "#F4F7FB", fontSize: 28, lineHeight: 34, fontWeight: "900", marginTop: 6 },
  metrics: { flexDirection: "row", gap: 10 },
  metricCard: {
    flex: 1,
    minHeight: 86,
    backgroundColor: "#111722",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#1C2532",
    padding: 14,
    justifyContent: "space-between",
  },
  metricValue: { color: "#F4F7FB", fontSize: 22, fontWeight: "900" },
  metricSuffix: { color: "#7E8A9A", fontSize: 12 },
  metricLabel: { color: "#7E8A9A", fontSize: 10, fontWeight: "800" },
  infoCard: {
    backgroundColor: "#0D1721",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#1C3650",
    padding: 16,
    gap: 5,
  },
  infoTitle: { color: "#B8D8FF", fontSize: 14, fontWeight: "900" },
  infoBody: { color: "#8496AA", fontSize: 12, lineHeight: 18 },
  dayCard: {
    backgroundColor: "#111722",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#1C2532",
    padding: 16,
    gap: 12,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  dayName: { color: "#F4F7FB", fontSize: 18, fontWeight: "900" },
  dayDate: { color: "#697688", fontSize: 10, marginTop: 3 },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#1A2230",
  },
  statusGood: { backgroundColor: "#173326" },
  statusBad: { backgroundColor: "#381B22" },
  statusText: { color: "#DCE5F0", fontSize: 10, fontWeight: "900" },
  kindRow: { flexDirection: "row", gap: 7 },
  kindButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#283445",
    alignItems: "center",
    justifyContent: "center",
  },
  kindButtonActive: { backgroundColor: "#1B3150", borderColor: "#2E8BFF" },
  kindText: { color: "#758296", fontSize: 11, fontWeight: "800" },
  kindTextActive: { color: "#E9F3FF" },
  input: {
    minHeight: 46,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#263142",
    backgroundColor: "#0C121B",
    color: "#F4F7FB",
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 13,
  },
  descriptionInput: { minHeight: 72, textAlignVertical: "top" },
  saveButton: {
    minHeight: 44,
    borderRadius: 13,
    backgroundColor: "#2E8BFF",
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.38 },
  errorBox: {
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#2A171B",
    borderWidth: 1,
    borderColor: "#61313A",
  },
  errorText: { color: "#FFB5C0", fontSize: 12, lineHeight: 18 },
});
