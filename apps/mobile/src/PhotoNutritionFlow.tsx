import { useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  savePhotoNutritionEntry,
  type NutritionDaySnapshot,
  type NutritionMeal,
} from "./database";
import {
  pickAndStoreNutritionImage,
  removeStoredNutritionImage,
} from "./media";

function parseRequired(value: string) {
  const number = Number(value.trim().replace(",", "."));
  return Number.isFinite(number) && number >= 0 ? number : Number.NaN;
}

function parseOptional(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : Number.NaN;
}

export function PhotoNutritionFlow({
  meal,
  onSaved,
}: {
  meal: NutritionMeal;
  onSaved: (snapshot: NutritionDaySnapshot) => Promise<void>;
}) {
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [name, setName] = useState("Comida fotografiada");
  const [grams, setGrams] = useState("100");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [fiber, setFiber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(source: "camera" | "library") {
    try {
      setBusy(true);
      setError(null);
      const next = await pickAndStoreNutritionImage(source);
      if (!next) return;
      if (photoUri) removeStoredNutritionImage(photoUri);
      setPhotoUri(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo obtener la foto.");
    } finally {
      setBusy(false);
    }
  }

  function discard() {
    if (photoUri) removeStoredNutritionImage(photoUri);
    setPhotoUri(null);
    setError(null);
  }

  async function save() {
    if (!photoUri) return;
    try {
      setBusy(true);
      setError(null);
      const snapshot = await savePhotoNutritionEntry({
        meal,
        photoUri,
        name,
        grams: parseRequired(grams),
        per100: {
          calories: parseRequired(calories),
          protein: parseRequired(protein),
          carbs: parseRequired(carbs),
          fat: parseRequired(fat),
          fiber: parseOptional(fiber),
        },
      });
      await onSaved(snapshot);
      setPhotoUri(null);
      setName("Comida fotografiada");
      setGrams("100");
      setCalories("");
      setProtein("");
      setCarbs("");
      setFat("");
      setFiber("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la comida.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>FOTO DE COMIDA</Text>
      <Text style={styles.title}>Foto como evidencia</Text>
      <Text style={styles.help}>
        El análisis automático todavía no está conectado. La foto se guarda privada y tú confirmas los datos antes de que entren al historial.
      </Text>

      <View style={styles.actions}>
        <Pressable disabled={busy} onPress={() => void choose("camera")} style={styles.actionButton}>
          <Text style={styles.actionText}>Tomar foto</Text>
        </Pressable>
        <Pressable disabled={busy} onPress={() => void choose("library")} style={styles.actionButton}>
          <Text style={styles.actionText}>Galería</Text>
        </Pressable>
      </View>

      {photoUri ? (
        <View style={styles.draft}>
          <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
          <TextInput value={name} onChangeText={setName} maxLength={100} style={styles.nameInput} />
          <View style={styles.two}>
            <Field label="Cantidad · g" value={grams} onChange={setGrams} />
            <Field label="kcal / 100 g" value={calories} onChange={setCalories} />
          </View>
          <View style={styles.three}>
            <Field label="Proteína" value={protein} onChange={setProtein} />
            <Field label="Carbos" value={carbs} onChange={setCarbs} />
            <Field label="Grasa" value={fat} onChange={setFat} />
          </View>
          <Field label="Fibra / 100 g · opcional" value={fiber} onChange={setFiber} />

          <View style={styles.confirmRow}>
            <Pressable disabled={busy} onPress={discard} style={styles.discardButton}>
              <Text style={styles.discardText}>Descartar</Text>
            </Pressable>
            <Pressable disabled={busy} onPress={() => void save()} style={[styles.saveButton, busy && styles.disabled]}>
              <Text style={styles.saveText}>{busy ? "Guardando…" : "Confirmar y guardar"}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
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
        placeholder="—"
        placeholderTextColor="#566273"
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: "#0D1721",
    borderWidth: 1,
    borderColor: "#1C3650",
    gap: 10,
  },
  kicker: { color: "#6DE0A8", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  title: { color: "#EAF3FC", fontSize: 17, fontWeight: "900" },
  help: { color: "#7E8A9A", fontSize: 11, lineHeight: 16 },
  actions: { flexDirection: "row", gap: 8 },
  actionButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2E8BFF",
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: { color: "#B8D8FF", fontSize: 11, fontWeight: "900" },
  draft: { gap: 9 },
  photo: { width: "100%", height: 190, borderRadius: 15, backgroundColor: "#080D14" },
  nameInput: {
    minHeight: 44,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#2A3B50",
    backgroundColor: "#09111A",
    color: "#F4F7FB",
    paddingHorizontal: 11,
    fontSize: 13,
    fontWeight: "800",
  },
  two: { flexDirection: "row", gap: 8 },
  three: { flexDirection: "row", gap: 8 },
  field: { flex: 1, gap: 5 },
  label: { color: "#748397", fontSize: 9, fontWeight: "800" },
  input: {
    minHeight: 42,
    minWidth: 0,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#263142",
    backgroundColor: "#09111A",
    color: "#F4F7FB",
    textAlign: "center",
    fontWeight: "800",
    paddingHorizontal: 5,
  },
  confirmRow: { flexDirection: "row", gap: 8 },
  discardButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#3A4657",
    alignItems: "center",
    justifyContent: "center",
  },
  discardText: { color: "#9AA8B9", fontSize: 10, fontWeight: "900" },
  saveButton: {
    flex: 1.7,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: "#2E8BFF",
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  error: { color: "#FFB5C0", fontSize: 11, lineHeight: 16 },
  disabled: { opacity: 0.45 },
});
