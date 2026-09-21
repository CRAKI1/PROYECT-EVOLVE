import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  deleteNutritionEntry,
  loadNutritionDay,
  saveManualNutritionEntry,
  type NutritionDaySnapshot,
  type NutritionMeal,
} from "./database";
import { BarcodeNutritionFlow } from "./BarcodeNutritionFlow";

const meals: Array<{ id: NutritionMeal; label: string }> = [
  { id: "preworkout", label: "Pre" },
  { id: "breakfast", label: "Desayuno" },
  { id: "lunch", label: "Almuerzo" },
  { id: "dinner", label: "Cena" },
  { id: "snack", label: "Snack" },
  { id: "other", label: "Otro" },
];

const mealLabels = Object.fromEntries(meals.map(item => [item.id, item.label])) as Record<NutritionMeal, string>;

function parseNumber(value: string, required = true) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized && !required) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : Number.NaN;
}

export function NutritionPanel({ onChanged }: { onChanged: () => Promise<void> }) {
  const [snapshot, setSnapshot] = useState<NutritionDaySnapshot | null>(null);
  const [meal, setMeal] = useState<NutritionMeal>("lunch");
  const [name, setName] = useState("");
  const [grams, setGrams] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [fiber, setFiber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setSnapshot(await loadNutritionDay());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar nutrición.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function save() {
    try {
      setBusy(true);
      setError(null);
      const next = await saveManualNutritionEntry({
        meal,
        name,
        grams: parseNumber(grams)!,
        per100: {
          calories: parseNumber(calories)!,
          protein: parseNumber(protein)!,
          carbs: parseNumber(carbs)!,
          fat: parseNumber(fat)!,
          fiber: parseNumber(fiber, false),
        },
      });
      setSnapshot(next);
      setName("");
      setGrams("");
      setCalories("");
      setProtein("");
      setCarbs("");
      setFat("");
      setFiber("");
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el alimento.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(entryId: string) {
    try {
      setBusy(true);
      setError(null);
      setSnapshot(await deleteNutritionEntry(entryId));
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo borrar el registro.");
    } finally {
      setBusy(false);
    }
  }

  const totals = snapshot?.totals ?? { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

  return (
    <View style={styles.wrap}>
      <View>
        <Text style={styles.eyebrow}>NUTRICIÓN</Text>
        <Text style={styles.hero}>Registra primero. Evalúa después.</Text>
      </View>

      <View style={styles.totals}>
        <Total label="kcal" value={Math.round(totals.calories)} />
        <Total label="proteína" value={round1(totals.protein)} suffix="g" />
        <Total label="carbos" value={round1(totals.carbs)} suffix="g" />
        <Total label="grasa" value={round1(totals.fat)} suffix="g" />
      </View>

      <Text style={styles.neutralNote}>
        Estos son totales registrados, no una meta ni una recomendación de restricción.
      </Text>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Registro manual</Text>
        <Text style={styles.caption}>Introduce la etiqueta nutricional por 100 g y la cantidad que consumiste.</Text>

        <View style={styles.mealRow}>
          {meals.map(item => (
            <Pressable
              key={item.id}
              onPress={() => setMeal(item.id)}
              style={[styles.mealButton, meal === item.id && styles.mealButtonActive]}
            >
              <Text style={[styles.mealText, meal === item.id && styles.mealTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Alimento o producto"
          placeholderTextColor="#566273"
          maxLength={100}
          style={styles.wideInput}
        />

        <View style={styles.twoColumns}>
          <Field label="Cantidad · g" value={grams} onChange={setGrams} />
          <Field label="kcal / 100 g" value={calories} onChange={setCalories} />
        </View>
        <View style={styles.threeColumns}>
          <Field label="Proteína" value={protein} onChange={setProtein} />
          <Field label="Carbos" value={carbs} onChange={setCarbs} />
          <Field label="Grasa" value={fat} onChange={setFat} />
        </View>
        <Field label="Fibra / 100 g · opcional" value={fiber} onChange={setFiber} />

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void save()}
          style={[styles.saveButton, busy && styles.disabled]}
        >
          <Text style={styles.saveText}>{busy ? "Guardando…" : "Añadir al día"}</Text>
        </Pressable>
      </View>

      <BarcodeNutritionFlow
        meal={meal}
        onSaved={async (next) => {
          setSnapshot(next);
          await onChanged();
        }}
      />

      <View style={styles.futureCard}>
        <Text style={styles.futureTitle}>Foto de comida</Text>
        <Text style={styles.caption}>
          Siguiente adaptador: foto con estimación y confirmación manual antes de guardar.
        </Text>
      </View>

      <View style={styles.list}>
        <Text style={styles.listTitle}>Hoy · {snapshot?.entries.length ?? 0} registros</Text>
        {(snapshot?.entries ?? []).map(entry => (
          <View key={entry.id} style={styles.entry}>
            <View style={{ flex: 1 }}>
              <Text style={styles.entryMeal}>{mealLabels[entry.meal]}</Text>
              <Text style={styles.entryName}>{entry.name}</Text>
              <Text style={styles.entryMeta}>
                {round1(entry.grams)} g · {Math.round(entry.calories)} kcal · P {round1(entry.protein)} · C {round1(entry.carbs)} · G {round1(entry.fat)}
                {entry.source === "barcode" && entry.barcode ? ` · código ${entry.barcode}` : ""}
              </Text>
            </View>
            <Pressable
              disabled={busy}
              onPress={() => void remove(entry.id)}
              style={styles.deleteButton}
            >
              <Text style={styles.deleteText}>Borrar</Text>
            </Pressable>
          </View>
        ))}
        {!snapshot?.entries.length ? <Text style={styles.empty}>Todavía no hay alimentos registrados hoy.</Text> : null}
      </View>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor="#566273"
        style={styles.input}
      />
    </View>
  );
}

function Total({
  label,
  value,
  suffix = "",
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <View style={styles.totalCard}>
      <Text style={styles.totalValue}>{value}{suffix}</Text>
      <Text style={styles.totalLabel}>{label}</Text>
    </View>
  );
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  eyebrow: { color: "#2E8BFF", fontSize: 11, fontWeight: "900", letterSpacing: 1.6 },
  hero: { color: "#F4F7FB", fontSize: 28, lineHeight: 34, fontWeight: "900", marginTop: 6 },
  totals: { flexDirection: "row", gap: 7 },
  totalCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 78,
    borderRadius: 16,
    backgroundColor: "#111722",
    borderWidth: 1,
    borderColor: "#1C2532",
    padding: 10,
    justifyContent: "space-between",
  },
  totalValue: { color: "#F4F7FB", fontSize: 16, fontWeight: "900" },
  totalLabel: { color: "#728094", fontSize: 9, fontWeight: "800" },
  neutralNote: { color: "#718094", fontSize: 10, lineHeight: 15, paddingHorizontal: 3 },
  card: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: "#111722",
    borderWidth: 1,
    borderColor: "#1C2532",
    gap: 11,
  },
  cardTitle: { color: "#F4F7FB", fontSize: 18, fontWeight: "900" },
  caption: { color: "#7E8A9A", fontSize: 11, lineHeight: 16 },
  mealRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  mealButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#293649",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  mealButtonActive: { borderColor: "#2E8BFF", backgroundColor: "#172B43" },
  mealText: { color: "#7E8A9A", fontSize: 10, fontWeight: "800" },
  mealTextActive: { color: "#E5F1FF" },
  wideInput: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#263142",
    backgroundColor: "#0C121B",
    color: "#F4F7FB",
    paddingHorizontal: 12,
    fontSize: 13,
  },
  twoColumns: { flexDirection: "row", gap: 8 },
  threeColumns: { flexDirection: "row", gap: 8 },
  field: { flex: 1, gap: 5 },
  label: { color: "#748397", fontSize: 9, fontWeight: "800" },
  input: {
    minHeight: 42,
    minWidth: 0,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#263142",
    backgroundColor: "#0C121B",
    color: "#F4F7FB",
    textAlign: "center",
    fontWeight: "800",
    paddingHorizontal: 5,
  },
  saveButton: {
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: "#2E8BFF",
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  futureCard: {
    borderRadius: 17,
    padding: 14,
    backgroundColor: "#0D1721",
    borderWidth: 1,
    borderColor: "#1C3650",
    gap: 5,
  },
  futureTitle: { color: "#B8D8FF", fontSize: 13, fontWeight: "900" },
  list: { gap: 8 },
  listTitle: { color: "#A9B8CA", fontSize: 12, fontWeight: "900" },
  entry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    padding: 13,
    backgroundColor: "#0E141D",
    borderWidth: 1,
    borderColor: "#1C2532",
  },
  entryMeal: { color: "#6DE0A8", fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  entryName: { color: "#F4F7FB", fontSize: 14, fontWeight: "900", marginTop: 2 },
  entryMeta: { color: "#778598", fontSize: 10, lineHeight: 15, marginTop: 3 },
  deleteButton: {
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#4B2A32",
    paddingHorizontal: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteText: { color: "#E5A8B5", fontSize: 9, fontWeight: "900" },
  empty: { color: "#657284", fontSize: 11, lineHeight: 17 },
  errorBox: {
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#2A171B",
    borderWidth: 1,
    borderColor: "#61313A",
  },
  errorText: { color: "#FFB5C0", fontSize: 12, lineHeight: 18 },
  disabled: { opacity: 0.45 },
});
