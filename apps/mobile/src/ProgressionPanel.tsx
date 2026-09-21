import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  adoptProgressionLoad,
  loadExerciseProgression,
  saveExerciseProfile,
  type ExerciseProgressionSnapshot,
} from "./database";

const reasonCopy: Record<string, string> = {
  insufficient_data: "Aún no hay sesiones comparables.",
  incomplete_session: "La sesión reciente quedó incompleta.",
  load_not_comparable: "La carga registrada no coincide con la carga actual del perfil.",
  missing_rir: "Falta RIR en la sesión reciente.",
  below_prescribed_range_or_reserve: "Quedaste por debajo del rango o del RIR objetivo.",
  confirm_range_at_target_reserve: "Falta confirmar el techo del rango en otra exposición comparable.",
  two_comparable_exposures_at_ceiling: "Dos exposiciones comparables alcanzaron el techo del rango.",
  no_available_increment: "No hay un siguiente incremento configurado.",
  incomplete_record: "Hay una sesión histórica sin carga o repeticiones completas.",
};

export function ProgressionPanel({
  contextKey,
  exerciseName,
  onChanged,
}: {
  contextKey: string | null;
  exerciseName: string;
  onChanged: () => Promise<void>;
}) {
  const [snapshot, setSnapshot] = useState<ExerciseProgressionSnapshot | null>(null);
  const [editing, setEditing] = useState(false);
  const [load, setLoad] = useState("");
  const [sets, setSets] = useState("");
  const [minReps, setMinReps] = useState("");
  const [maxReps, setMaxReps] = useState("");
  const [targetRir, setTargetRir] = useState("");
  const [options, setOptions] = useState("");
  const [assisted, setAssisted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!contextKey) return;
    const next = await loadExerciseProgression(contextKey);
    setSnapshot(next);
    if (next.profile) {
      setLoad(String(next.profile.currentLoad));
      setSets(String(next.profile.sets));
      setMinReps(String(next.profile.minReps));
      setMaxReps(String(next.profile.maxReps));
      setTargetRir(String(next.profile.targetRir));
      setOptions(next.profile.loadOptions.join(", "));
      setAssisted(next.profile.assisted);
    }
  }, [contextKey]);

  useEffect(() => {
    void refresh().catch((cause) => {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar la progresión.");
    });
  }, [refresh]);

  if (!contextKey) {
    return (
      <View style={styles.notice}>
        <Text style={styles.noticeText}>Este ejercicio es anterior al sistema de progresión. Añádelo de nuevo en una sesión futura para darle un contexto estable.</Text>
      </View>
    );
  }

  async function save() {
    try {
      setBusy(true);
      setError(null);
      const loadValue = Number(load.trim().replace(",", "."));
      const setsValue = Number(sets.trim());
      const minValue = Number(minReps.trim());
      const maxValue = Number(maxReps.trim());
      const rirValue = Number(targetRir.trim().replace(",", "."));
      const loadOptions = options
        .split(/[;,\s]+/)
        .map(value => value.trim().replace(",", "."))
        .filter(Boolean)
        .map(Number);

      const next = await saveExerciseProfile({
        contextKey,
        name: exerciseName,
        currentLoad: loadValue,
        sets: setsValue,
        minReps: minValue,
        maxReps: maxValue,
        targetRir: rirValue,
        assisted,
        loadOptions,
      });
      setSnapshot(next);
      setEditing(false);
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la progresión.");
    } finally {
      setBusy(false);
    }
  }

  async function adopt(loadValue: number) {
    try {
      setBusy(true);
      setError(null);
      const next = await adoptProgressionLoad(contextKey, loadValue);
      setSnapshot(next);
      setLoad(String(loadValue));
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo adoptar la nueva carga.");
    } finally {
      setBusy(false);
    }
  }

  if (!snapshot?.profile || editing) {
    return (
      <View style={styles.editor}>
        <View style={styles.editorHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>PROGRESIÓN</Text>
            <Text style={styles.title}>{snapshot?.profile ? "Editar parámetros" : "Configurar ejercicio"}</Text>
          </View>
          {snapshot?.profile ? (
            <Pressable onPress={() => setEditing(false)} style={styles.smallButton}>
              <Text style={styles.smallButtonText}>Cancelar</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.help}>
          No se inventan incrementos. Escribe las cargas que realmente puedes seleccionar en este ejercicio.
        </Text>

        <View style={styles.twoColumns}>
          <Field label={assisted ? "Asistencia actual" : "Carga actual"} value={load} onChange={setLoad} decimal />
          <Field label="Series" value={sets} onChange={setSets} />
        </View>
        <View style={styles.threeColumns}>
          <Field label="Reps min" value={minReps} onChange={setMinReps} />
          <Field label="Reps max" value={maxReps} onChange={setMaxReps} />
          <Field label="RIR objetivo" value={targetRir} onChange={setTargetRir} decimal />
        </View>

        <Text style={styles.fieldLabel}>Cargas disponibles · separadas por espacio, coma o punto y coma</Text>
        <TextInput
          value={options}
          onChangeText={setOptions}
          keyboardType="numbers-and-punctuation"
          placeholder="Ej. 15 17.5 20 22.5 25"
          placeholderTextColor="#566273"
          style={styles.wideInput}
        />

        <Pressable
          accessibilityRole="button"
          onPress={() => setAssisted(value => !value)}
          style={[styles.toggle, assisted && styles.toggleActive]}
        >
          <Text style={[styles.toggleText, assisted && styles.toggleTextActive]}>
            {assisted ? "✓ Ejercicio asistido" : "Ejercicio asistido"}
          </Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void save()}
          style={[styles.saveButton, busy && styles.disabled]}
        >
          <Text style={styles.saveText}>{busy ? "Guardando…" : "Guardar progresión"}</Text>
        </Pressable>
      </View>
    );
  }

  const proposal = snapshot.proposal;
  const actionLabel =
    proposal?.action === "increase"
      ? `Subir a ${proposal.load} kg`
      : proposal?.action === "reduce"
        ? `Bajar a ${proposal.load} kg`
        : proposal?.action === "review"
          ? "Revisar"
          : `Mantener ${proposal?.load ?? snapshot.profile.currentLoad} kg`;

  return (
    <View style={styles.summary}>
      <View style={styles.editorHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>PROGRESIÓN · {snapshot.exposureCount} EXPOSICIONES</Text>
          <Text style={styles.title}>{actionLabel}</Text>
        </View>
        <Pressable onPress={() => setEditing(true)} style={styles.smallButton}>
          <Text style={styles.smallButtonText}>Editar</Text>
        </Pressable>
      </View>

      <Text style={styles.help}>
        {proposal?.reasons.map(reason => reasonCopy[reason] ?? reason).join(" · ") ?? "Sin propuesta todavía."}
      </Text>

      <View style={styles.prescription}>
        <Text style={styles.prescriptionText}>{snapshot.profile.sets} series</Text>
        <Text style={styles.prescriptionText}>{snapshot.profile.minReps}–{snapshot.profile.maxReps} reps</Text>
        <Text style={styles.prescriptionText}>RIR {snapshot.profile.targetRir}</Text>
      </View>

      {proposal && (proposal.action === "increase" || proposal.action === "reduce") && proposal.load !== snapshot.profile.currentLoad ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void adopt(proposal.load)}
          style={[styles.adoptButton, busy && styles.disabled]}
        >
          <Text style={styles.adoptText}>Usar {proposal.load} kg como nueva carga</Text>
        </Pressable>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  decimal,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  decimal?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={decimal ? "decimal-pad" : "number-pad"}
        placeholder="—"
        placeholderTextColor="#566273"
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#283445",
    backgroundColor: "#0D131C",
  },
  noticeText: { color: "#718094", fontSize: 11, lineHeight: 16 },
  editor: {
    borderRadius: 17,
    padding: 14,
    borderWidth: 1,
    borderColor: "#24405D",
    backgroundColor: "#0C1621",
    gap: 10,
  },
  summary: {
    borderRadius: 17,
    padding: 14,
    borderWidth: 1,
    borderColor: "#243446",
    backgroundColor: "#0D141E",
    gap: 10,
  },
  editorHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  kicker: { color: "#6DE0A8", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  title: { color: "#EDF4FC", fontSize: 17, fontWeight: "900", marginTop: 2 },
  help: { color: "#7E8A9A", fontSize: 11, lineHeight: 16 },
  twoColumns: { flexDirection: "row", gap: 8 },
  threeColumns: { flexDirection: "row", gap: 8 },
  field: { flex: 1, gap: 5 },
  fieldLabel: { color: "#748397", fontSize: 9, fontWeight: "800" },
  input: {
    minHeight: 42,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#263142",
    backgroundColor: "#09111A",
    color: "#F4F7FB",
    textAlign: "center",
    fontWeight: "800",
    paddingHorizontal: 6,
  },
  wideInput: {
    minHeight: 44,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#263142",
    backgroundColor: "#09111A",
    color: "#F4F7FB",
    paddingHorizontal: 11,
    fontSize: 12,
  },
  toggle: {
    minHeight: 40,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#2A3749",
    alignItems: "center",
    justifyContent: "center",
  },
  toggleActive: { borderColor: "#2E8BFF", backgroundColor: "#172B43" },
  toggleText: { color: "#7E8A9A", fontSize: 11, fontWeight: "900" },
  toggleTextActive: { color: "#DCEEFF" },
  saveButton: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: "#2E8BFF",
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  smallButton: {
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2D3B4F",
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  smallButtonText: { color: "#A7B9CE", fontSize: 10, fontWeight: "900" },
  prescription: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  prescriptionText: {
    color: "#B9CCE3",
    fontSize: 10,
    fontWeight: "800",
    backgroundColor: "#17202D",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  adoptButton: {
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: "#173326",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  adoptText: { color: "#AEEACB", fontSize: 11, fontWeight: "900" },
  error: { color: "#FFB5C0", fontSize: 11, lineHeight: 16 },
  disabled: { opacity: 0.45 },
});
