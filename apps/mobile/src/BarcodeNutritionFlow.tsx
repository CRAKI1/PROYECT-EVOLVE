import { useState } from "react";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { lookupBarcodeProduct, type BarcodeProductDraft } from "./foodApi";
import {
  saveBarcodeNutritionEntry,
  type NutritionDaySnapshot,
  type NutritionMeal,
} from "./database";

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

function shown(value: number | null) {
  return value === null ? "" : String(value);
}

export function BarcodeNutritionFlow({
  meal,
  onSaved,
}: {
  meal: NutritionMeal;
  onSaved: (snapshot: NutritionDaySnapshot) => Promise<void>;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [draft, setDraft] = useState<BarcodeProductDraft | null>(null);
  const [name, setName] = useState("");
  const [grams, setGrams] = useState("100");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [fiber, setFiber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openScanner() {
    try {
      setError(null);
      if (!permission?.granted) {
        const next = await requestPermission();
        if (!next.granted) {
          setError("La cámara es necesaria para escanear el código. Puedes seguir usando el registro manual.");
          return;
        }
      }
      setDraft(null);
      setLocked(false);
      setScannerOpen(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo abrir la cámara.");
    }
  }

  async function scanned(result: BarcodeScanningResult) {
    if (locked) return;
    setLocked(true);
    setScannerOpen(false);
    setBusy(true);
    setError(null);
    try {
      const next = await lookupBarcodeProduct(result.data);
      setDraft(next);
      setName(next.name);
      setGrams("100");
      setCalories(shown(next.per100.calories));
      setProtein(shown(next.per100.protein));
      setCarbs(shown(next.per100.carbs));
      setFat(shown(next.per100.fat));
      setFiber(shown(next.per100.fiber));
    } catch (cause) {
      setDraft(null);
      setError(cause instanceof Error ? cause.message : "No se pudo consultar el producto.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!draft) return;
    try {
      setBusy(true);
      setError(null);
      const snapshot = await saveBarcodeNutritionEntry({
        meal,
        barcode: draft.barcode,
        brand: draft.brand,
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
      setDraft(null);
      setLocked(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el producto.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>CÓDIGO DE BARRAS</Text>
          <Text style={styles.title}>Escanear producto</Text>
        </View>
        {!scannerOpen ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void openScanner()}
            style={[styles.scanButton, busy && styles.disabled]}
          >
            <Text style={styles.scanText}>Abrir cámara</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.help}>
        Los datos externos se muestran como borrador. Nada entra al historial hasta que confirmes cantidad y macros.
      </Text>

      {scannerOpen ? (
        <View style={styles.cameraWrap}>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}
            onBarcodeScanned={locked ? undefined : (result) => void scanned(result)}
          />
          <View style={styles.reticle} pointerEvents="none" />
          <Pressable onPress={() => setScannerOpen(false)} style={styles.cancelCamera}>
            <Text style={styles.cancelCameraText}>Cancelar</Text>
          </Pressable>
        </View>
      ) : null}

      {busy ? (
        <View style={styles.loading}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Consultando o guardando…</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {draft ? (
        <View style={styles.confirm}>
          <Text style={styles.source}>Open Food Facts · {draft.barcode}</Text>
          {draft.brand ? <Text style={styles.brand}>{draft.brand}</Text> : null}
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

          <Text style={styles.warning}>
            Revisa la etiqueta física si puedes. Open Food Facts es una base colaborativa y puede contener datos incompletos.
          </Text>

          <View style={styles.actions}>
            <Pressable
              onPress={() => {
                setDraft(null);
                setLocked(false);
              }}
              style={styles.secondary}
            >
              <Text style={styles.secondaryText}>Descartar</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={() => void confirm()}
              style={[styles.primary, busy && styles.disabled]}
            >
              <Text style={styles.primaryText}>Confirmar y guardar</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
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
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  kicker: { color: "#6DE0A8", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  title: { color: "#EAF3FC", fontSize: 17, fontWeight: "900", marginTop: 2 },
  help: { color: "#7E8A9A", fontSize: 11, lineHeight: 16 },
  scanButton: {
    minHeight: 38,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#2E8BFF",
    paddingHorizontal: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  scanText: { color: "#B8D8FF", fontSize: 10, fontWeight: "900" },
  cameraWrap: {
    height: 250,
    overflow: "hidden",
    borderRadius: 16,
    backgroundColor: "#05080D",
    position: "relative",
  },
  camera: { flex: 1 },
  reticle: {
    position: "absolute",
    left: "12%",
    right: "12%",
    top: "32%",
    bottom: "32%",
    borderWidth: 2,
    borderColor: "#EAF4FF",
    borderRadius: 12,
  },
  cancelCamera: {
    position: "absolute",
    bottom: 10,
    right: 10,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#101722DD",
  },
  cancelCameraText: { color: "#E8EEF6", fontSize: 10, fontWeight: "900" },
  loading: { flexDirection: "row", alignItems: "center", gap: 8 },
  loadingText: { color: "#8494A8", fontSize: 10 },
  error: { color: "#FFB5C0", fontSize: 11, lineHeight: 16 },
  confirm: { gap: 9 },
  source: { color: "#6E849B", fontSize: 9, fontWeight: "800" },
  brand: { color: "#AFCBEE", fontSize: 11, fontWeight: "800" },
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
  warning: { color: "#9D8E6F", fontSize: 10, lineHeight: 15 },
  actions: { flexDirection: "row", gap: 8 },
  secondary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { color: "#9FADBE", fontSize: 10, fontWeight: "900" },
  primary: {
    flex: 1.6,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: "#2E8BFF",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  disabled: { opacity: 0.45 },
});
