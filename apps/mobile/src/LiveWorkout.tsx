import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  addExercise,
  addSet,
  loadWorkoutExercises,
  saveSet,
  type WorkoutExercise,
  type WorkoutSetRow,
} from "./database";

export function LiveWorkout({
  workoutId,
  busy,
  onChanged,
  onFinish,
}: {
  workoutId: string;
  busy: boolean;
  onChanged: () => Promise<void>;
  onFinish: () => Promise<void>;
}) {
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setExercises(await loadWorkoutExercises(workoutId));
  }, [workoutId]);

  useEffect(() => {
    void refresh().catch((cause) => {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar la sesión.");
    });
  }, [refresh]);

  async function run(action: () => Promise<unknown>) {
    try {
      setSaving(true);
      setError(null);
      await action();
      await refresh();
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el cambio.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <View>
        <Text style={styles.eyebrow}>LIVE WORKOUT</Text>
        <Text style={styles.hero}>Registra solo lo que realmente hiciste.</Text>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Añadir ejercicio</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Ej. sentadilla, remo, press…"
          placeholderTextColor="#5F6B7A"
          maxLength={80}
          style={styles.nameInput}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (!name.trim()) return;
            void run(async () => {
              await addExercise(workoutId, name);
              setName("");
            });
          }}
        />
        <ActionButton
          label="Añadir ejercicio"
          disabled={saving || !name.trim()}
          onPress={() =>
            run(async () => {
              await addExercise(workoutId, name);
              setName("");
            })
          }
        />
      </View>

      {exercises.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Todavía no hay ejercicios</Text>
          <Text style={styles.muted}>
            Añade el primero arriba. No se precargan datos personales ni cargas inventadas.
          </Text>
        </View>
      ) : null}

      {exercises.map((exercise) => (
        <View key={exercise.id} style={styles.card}>
          <View style={styles.exerciseHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.exerciseIndex}>EJERCICIO {exercise.order_index}</Text>
              <Text style={styles.exerciseName}>{exercise.name}</Text>
            </View>
            <Text style={styles.setCount}>{exercise.sets.filter((set) => set.completed === 1).length}/{exercise.sets.length}</Text>
          </View>

          <View style={styles.columns}>
            <Text style={[styles.columnText, styles.setColumn]}>#</Text>
            <Text style={styles.columnText}>kg</Text>
            <Text style={styles.columnText}>reps</Text>
            <Text style={styles.columnText}>RIR</Text>
            <Text style={[styles.columnText, styles.saveColumn]}>estado</Text>
          </View>

          {exercise.sets.map((set) => (
            <SetEditor
              key={set.id}
              set={set}
              disabled={saving}
              onSave={(values) => run(() => saveSet(workoutId, set.id, values))}
            />
          ))}

          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={() => run(() => addSet(workoutId, exercise.id))}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryButtonText}>+ Añadir serie</Text>
          </Pressable>
        </View>
      ))}

      <View style={styles.finishCard}>
        <Text style={styles.finishTitle}>Cerrar sesión</Text>
        <Text style={styles.muted}>
          Las series incompletas se conservan como incompletas; después el motor de progresión podrá distinguirlas y no tratarlas como evidencia completa.
        </Text>
        <ActionButton label="Finalizar entrenamiento" disabled={busy || saving} onPress={onFinish} />
      </View>
    </View>
  );
}

function SetEditor({
  set,
  disabled,
  onSave,
}: {
  set: WorkoutSetRow;
  disabled: boolean;
  onSave: (values: { loadKg: number | null; reps: number; rir: number | null }) => Promise<void>;
}) {
  const [load, setLoad] = useState(set.load_kg === null ? "" : String(set.load_kg));
  const [reps, setReps] = useState(set.reps === null ? "" : String(set.reps));
  const [rir, setRir] = useState(set.rir === null ? "" : String(set.rir));

  useEffect(() => {
    setLoad(set.load_kg === null ? "" : String(set.load_kg));
    setReps(set.reps === null ? "" : String(set.reps));
    setRir(set.rir === null ? "" : String(set.rir));
  }, [set.load_kg, set.reps, set.rir]);

  const parseOptional = (value: string) => {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) return null;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : Number.NaN;
  };

  async function submit() {
    const parsedReps = Number(reps.trim());
    await onSave({
      loadKg: parseOptional(load),
      reps: parsedReps,
      rir: parseOptional(rir),
    });
  }

  return (
    <View style={styles.setRow}>
      <Text style={[styles.setNumber, styles.setColumn]}>{set.set_index}</Text>
      <TextInput
        value={load}
        onChangeText={setLoad}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor="#4D5867"
        style={styles.numberInput}
      />
      <TextInput
        value={reps}
        onChangeText={setReps}
        keyboardType="number-pad"
        placeholder="0"
        placeholderTextColor="#4D5867"
        style={styles.numberInput}
      />
      <TextInput
        value={rir}
        onChangeText={setRir}
        keyboardType="decimal-pad"
        placeholder="—"
        placeholderTextColor="#4D5867"
        style={styles.numberInput}
      />
      <Pressable
        accessibilityRole="button"
        disabled={disabled || reps.trim() === ""}
        onPress={() => void submit()}
        style={({ pressed }) => [
          styles.setSave,
          set.completed === 1 && styles.setSaved,
          pressed && styles.pressed,
          (disabled || reps.trim() === "") && styles.disabled,
        ]}
      >
        <Text style={styles.setSaveText}>{set.completed === 1 ? "✓" : "Guardar"}</Text>
      </Pressable>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => void onPress()}
      style={({ pressed }) => [
        styles.primaryButton,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  eyebrow: { color: "#2E8BFF", fontSize: 11, fontWeight: "900", letterSpacing: 1.6 },
  hero: { color: "#F4F7FB", fontSize: 28, lineHeight: 34, fontWeight: "900", marginTop: 6 },
  card: {
    backgroundColor: "#111722",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1C2532",
    gap: 12,
  },
  cardTitle: { color: "#F4F7FB", fontSize: 18, fontWeight: "900" },
  nameInput: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#263142",
    backgroundColor: "#0C121B",
    color: "#F4F7FB",
    paddingHorizontal: 14,
    fontSize: 15,
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: "#2E8BFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  secondaryButton: {
    minHeight: 42,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#2A3749",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: { color: "#AFCBEE", fontSize: 13, fontWeight: "800" },
  exerciseHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  exerciseIndex: { color: "#6DE0A8", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  exerciseName: { color: "#F4F7FB", fontSize: 19, fontWeight: "900", marginTop: 2 },
  setCount: { color: "#7E8A9A", fontSize: 12, fontWeight: "800" },
  columns: { flexDirection: "row", alignItems: "center", gap: 6 },
  columnText: { flex: 1, color: "#657284", fontSize: 9, fontWeight: "800", textAlign: "center" },
  setColumn: { flex: 0.45 },
  saveColumn: { flex: 1.25 },
  setRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  setNumber: { color: "#8C98A8", fontWeight: "900", textAlign: "center" },
  numberInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 42,
    backgroundColor: "#0B1018",
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#222D3C",
    color: "#F4F7FB",
    textAlign: "center",
    fontWeight: "800",
    paddingHorizontal: 4,
  },
  setSave: {
    flex: 1.25,
    minHeight: 42,
    borderRadius: 11,
    backgroundColor: "#1B2735",
    alignItems: "center",
    justifyContent: "center",
  },
  setSaved: { backgroundColor: "#173326" },
  setSaveText: { color: "#DDE8F5", fontSize: 11, fontWeight: "900" },
  finishCard: {
    backgroundColor: "#0E141D",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#1C2532",
    gap: 12,
  },
  finishTitle: { color: "#F4F7FB", fontSize: 18, fontWeight: "900" },
  empty: {
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#283445",
    gap: 5,
  },
  emptyTitle: { color: "#D8E0EB", fontWeight: "900" },
  muted: { color: "#7E8A9A", fontSize: 12, lineHeight: 18 },
  errorBox: {
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#2A171B",
    borderWidth: 1,
    borderColor: "#61313A",
  },
  errorText: { color: "#FFB5C0", fontSize: 12, lineHeight: 18 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },
});
