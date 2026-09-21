import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  addHydration,
  deleteHydration,
  loadHydration,
  type HydrationSnapshot,
} from "./database";

const presets = [250, 350, 500, 750];

export function HydrationTracker({ onChanged }: { onChanged: () => Promise<void> }) {
  const [snapshot, setSnapshot] = useState<HydrationSnapshot | null>(null);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setSnapshot(await loadHydration());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar hidratación.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function add(amount: number) {
    try {
      setBusy(true);
      setError(null);
      setSnapshot(await addHydration(amount));
      setCustom("");
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el agua.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(entryId: string) {
    try {
      setBusy(true);
      setError(null);
      setSnapshot(await deleteHydration(entryId));
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo borrar el registro.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>HIDRATACIÓN</Text>
          <Text style={styles.total}>{snapshot?.totalMl ?? 0} ml</Text>
        </View>
        <Text style={styles.count}>{snapshot?.entries.length ?? 0} registros</Text>
      </View>

      <Text style={styles.help}>
        Se muestra lo que registras; no se asigna una meta automática.
      </Text>

      <View style={styles.presets}>
        {presets.map((amount) => (
          <Pressable
            key={amount}
            disabled={busy}
            onPress={() => void add(amount)}
            style={[styles.preset, busy && styles.disabled]}
          >
            <Text style={styles.presetText}>+{amount}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.customRow}>
        <TextInput
          value={custom}
          onChangeText={setCustom}
          keyboardType="number-pad"
          placeholder="ml"
          placeholderTextColor="#566273"
          style={styles.input}
        />
        <Pressable
          disabled={busy || !custom.trim()}
          onPress={() => void add(Number(custom.trim()))}
          style={[styles.addButton, (busy || !custom.trim()) && styles.disabled]}
        >
          <Text style={styles.addText}>Añadir</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {(snapshot?.entries ?? []).slice(0, 5).map((entry) => (
        <View key={entry.id} style={styles.entry}>
          <Text style={styles.entryText}>{entry.milliliters} ml</Text>
          <Text style={styles.time}>
            {new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit" }).format(new Date(entry.createdAt))}
          </Text>
          <Pressable disabled={busy} onPress={() => void remove(entry.id)} style={styles.deleteButton}>
            <Text style={styles.deleteText}>Borrar</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: "#111722",
    borderWidth: 1,
    borderColor: "#1C2532",
    gap: 10,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  kicker: { color: "#6DE0A8", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  total: { color: "#F4F7FB", fontSize: 22, fontWeight: "900", marginTop: 2 },
  count: { color: "#738196", fontSize: 10, fontWeight: "800" },
  help: { color: "#7E8A9A", fontSize: 11, lineHeight: 16 },
  presets: { flexDirection: "row", gap: 7 },
  preset: {
    flex: 1,
    minHeight: 40,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#2A3A4F",
    alignItems: "center",
    justifyContent: "center",
  },
  presetText: { color: "#B8D8FF", fontSize: 11, fontWeight: "900" },
  customRow: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    minHeight: 42,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#263142",
    backgroundColor: "#0C121B",
    color: "#F4F7FB",
    paddingHorizontal: 11,
    fontWeight: "800",
  },
  addButton: {
    minWidth: 92,
    borderRadius: 11,
    backgroundColor: "#1B3150",
    alignItems: "center",
    justifyContent: "center",
  },
  addText: { color: "#E6F1FF", fontSize: 11, fontWeight: "900" },
  entry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#1C2532",
    paddingTop: 8,
  },
  entryText: { flex: 1, color: "#DDE7F3", fontSize: 12, fontWeight: "900" },
  time: { color: "#6E7C8E", fontSize: 9 },
  deleteButton: { paddingHorizontal: 8, paddingVertical: 5 },
  deleteText: { color: "#D89DA9", fontSize: 9, fontWeight: "900" },
  error: { color: "#FFB5C0", fontSize: 11, lineHeight: 16 },
  disabled: { opacity: 0.45 },
});
