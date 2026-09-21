import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  loadRecovery,
  saveRecovery,
  type RecoverySnapshot,
} from "./database";

const statusCopy: Record<RecoverySnapshot["state"]["status"], { title: string; body: string }> = {
  unknown: {
    title: "Señales incompletas",
    body: "Registra energía y dolor muscular para obtener un resumen subjetivo del día.",
  },
  caution: {
    title: "Cautela",
    body: "Reportaste energía baja o dolor muscular alto. Úsalo como contexto, no como diagnóstico ni orden de entrenamiento.",
  },
  neutral: {
    title: "Intermedio",
    body: "Tus señales subjetivas no son claramente favorables ni de cautela.",
  },
  positive: {
    title: "Señales favorables",
    body: "Reportaste energía alta y dolor muscular bajo. Esto no sustituye cómo te sientes durante el calentamiento.",
  },
};

export function RecoveryPanel({ onChanged }: { onChanged: () => Promise<void> }) {
  const [snapshot, setSnapshot] = useState<RecoverySnapshot | null>(null);
  const [sleepHours, setSleepHours] = useState("");
  const [steps, setSteps] = useState("");
  const [energy, setEnergy] = useState<number | null>(null);
  const [soreness, setSoreness] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const next = await loadRecovery();
      setSnapshot(next);
      setSleepHours(next.signals.sleepMinutes === null ? "" : String(next.signals.sleepMinutes / 60));
      setSteps(next.signals.steps === null ? "" : String(next.signals.steps));
      setEnergy(next.signals.energy);
      setSoreness(next.signals.soreness);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar recuperación.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function save() {
    try {
      setSaving(true);
      setError(null);
      const normalizedSleep = sleepHours.trim().replace(",", ".");
      const sleepValue = normalizedSleep === "" ? null : Number(normalizedSleep);
      const stepValue = steps.trim() === "" ? null : Number(steps.trim());

      if (sleepValue !== null && (!Number.isFinite(sleepValue) || sleepValue < 0 || sleepValue > 24)) {
        throw new Error("Las horas de sueño deben estar entre 0 y 24.");
      }
      if (stepValue !== null && (!Number.isInteger(stepValue) || stepValue < 0)) {
        throw new Error("Los pasos deben ser un número entero positivo.");
      }

      const next = await saveRecovery({
        sleepMinutes: sleepValue === null ? null : Math.round(sleepValue * 60),
        steps: stepValue,
        energy,
        soreness,
      });
      setSnapshot(next);
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar recuperación.");
    } finally {
      setSaving(false);
    }
  }

  const copy = statusCopy[snapshot?.state.status ?? "unknown"];

  return (
    <View style={styles.wrap}>
      <View>
        <Text style={styles.eyebrow}>RECUPERACIÓN</Text>
        <Text style={styles.hero}>Registra señales. No inventes certeza.</Text>
      </View>

      <View style={styles.stateCard}>
        <View style={styles.stateHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.stateKicker}>ESTADO SUBJETIVO</Text>
            <Text style={styles.stateTitle}>{copy.title}</Text>
          </View>
          <Text style={styles.completeness}>{Math.round(snapshot?.state.completeness ?? 0)}%</Text>
        </View>
        <Text style={styles.stateBody}>{copy.body}</Text>
        <Text style={styles.policy}>Heurística local · subjective-recovery-v1</Text>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sueño y pasos</Text>
        <Text style={styles.caption}>Se guardan como contexto. No determinan por sí solos el estado subjetivo.</Text>

        <View style={styles.fieldRow}>
          <View style={styles.field}>
            <Text style={styles.label}>Sueño · horas</Text>
            <TextInput
              value={sleepHours}
              onChangeText={setSleepHours}
              keyboardType="decimal-pad"
              placeholder="Ej. 8"
              placeholderTextColor="#566273"
              style={styles.input}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Pasos</Text>
            <TextInput
              value={steps}
              onChangeText={setSteps}
              keyboardType="number-pad"
              placeholder="Ej. 8500"
              placeholderTextColor="#566273"
              style={styles.input}
            />
          </View>
        </View>
      </View>

      <ScaleCard
        title="Energía"
        detail="1 = muy baja · 5 = muy alta"
        value={energy}
        onChange={setEnergy}
      />

      <ScaleCard
        title="Dolor muscular"
        detail="1 = muy bajo · 5 = muy alto"
        value={soreness}
        onChange={setSoreness}
      />

      <Pressable
        accessibilityRole="button"
        disabled={saving}
        onPress={() => void save()}
        style={({ pressed }) => [
          styles.saveButton,
          pressed && styles.pressed,
          saving && styles.disabled,
        ]}
      >
        <Text style={styles.saveText}>{saving ? "Guardando…" : "Guardar recuperación"}</Text>
      </Pressable>

      <Text style={styles.disclaimer}>
        Este resumen no es una evaluación médica y no decide si debes entrenar. Dolor agudo, lesión o síntomas relevantes requieren una decisión separada.
      </Text>
    </View>
  );
}

function ScaleCard({
  title,
  detail,
  value,
  onChange,
}: {
  title: string;
  detail: string;
  value: number | null;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.caption}>{detail}</Text>
      <View style={styles.scaleRow}>
        {[1, 2, 3, 4, 5].map((item) => (
          <Pressable
            key={item}
            accessibilityRole="button"
            onPress={() => onChange(item)}
            style={({ pressed }) => [
              styles.scaleButton,
              value === item && styles.scaleButtonActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.scaleText, value === item && styles.scaleTextActive]}>{item}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  eyebrow: { color: "#2E8BFF", fontSize: 11, fontWeight: "900", letterSpacing: 1.6 },
  hero: { color: "#F4F7FB", fontSize: 28, lineHeight: 34, fontWeight: "900", marginTop: 6 },
  stateCard: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: "#0D1721",
    borderWidth: 1,
    borderColor: "#1C3650",
    gap: 8,
  },
  stateHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  stateKicker: { color: "#6E849B", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  stateTitle: { color: "#E6F1FF", fontSize: 22, fontWeight: "900", marginTop: 2 },
  completeness: { color: "#B8D8FF", fontSize: 20, fontWeight: "900" },
  stateBody: { color: "#91A3B8", fontSize: 13, lineHeight: 19 },
  policy: { color: "#647488", fontSize: 10, fontWeight: "700" },
  card: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: "#111722",
    borderWidth: 1,
    borderColor: "#1C2532",
    gap: 10,
  },
  cardTitle: { color: "#F4F7FB", fontSize: 17, fontWeight: "900" },
  caption: { color: "#7E8A9A", fontSize: 11, lineHeight: 16 },
  fieldRow: { flexDirection: "row", gap: 10 },
  field: { flex: 1, gap: 6 },
  label: { color: "#8D9AAA", fontSize: 10, fontWeight: "800" },
  input: {
    minHeight: 46,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#263142",
    backgroundColor: "#0C121B",
    color: "#F4F7FB",
    paddingHorizontal: 13,
    fontSize: 14,
    fontWeight: "800",
  },
  scaleRow: { flexDirection: "row", gap: 7 },
  scaleButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#293649",
    alignItems: "center",
    justifyContent: "center",
  },
  scaleButtonActive: { backgroundColor: "#1B3150", borderColor: "#2E8BFF" },
  scaleText: { color: "#7E8A9A", fontSize: 14, fontWeight: "900" },
  scaleTextActive: { color: "#EAF4FF" },
  saveButton: {
    minHeight: 50,
    borderRadius: 15,
    backgroundColor: "#2E8BFF",
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  disclaimer: { color: "#687688", fontSize: 10, lineHeight: 15, paddingHorizontal: 4 },
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
