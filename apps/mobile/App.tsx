import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  completeWorkout,
  createQuickWorkout,
  loadToday,
  localDate,
  type TodaySnapshot,
} from "./src/database";

type Tab = "today" | "training" | "nutrition" | "recovery" | "progress";

const emptySnapshot: TodaySnapshot = {
  activeWorkout: null,
  completedToday: 0,
  pendingSync: 0,
};

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "today", label: "Hoy" },
  { id: "training", label: "Entreno" },
  { id: "nutrition", label: "Nutrición" },
  { id: "recovery", label: "Recuperación" },
  { id: "progress", label: "Progreso" },
];

function dateLabel() {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

export default function App() {
  const [tab, setTab] = useState<Tab>("today");
  const [snapshot, setSnapshot] = useState<TodaySnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setSnapshot(await loadToday());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo abrir la base local.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function startWorkout() {
    try {
      setBusy(true);
      setError(null);
      await createQuickWorkout();
      await refresh();
      setTab("training");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo iniciar el entrenamiento.");
    } finally {
      setBusy(false);
    }
  }

  async function finishWorkout() {
    if (!snapshot.activeWorkout) return;
    try {
      setBusy(true);
      setError(null);
      await completeWorkout(snapshot.activeWorkout.id);
      await refresh();
      setTab("today");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cerrar el entrenamiento.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0D12" />
      <View style={styles.shell}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>PROJECT EVOLVE</Text>
            <Text style={styles.date}>{dateLabel()}</Text>
          </View>
          <View style={styles.levelBadge}>
            <Text style={styles.levelLabel}>LOCAL</Text>
            <Text style={styles.levelValue}>v0.2</Text>
          </View>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
            <Text style={styles.muted}>Preparando tu base privada local…</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {tab === "today" ? (
              <>
                <Text style={styles.eyebrow}>ESTADO DE HOY</Text>
                <Text style={styles.hero}>Tu sistema empieza por datos reales, no por estimaciones.</Text>

                <View style={styles.statsRow}>
                  <StatCard label="Sesiones" value={String(snapshot.completedToday)} />
                  <StatCard label="Pendientes sync" value={String(snapshot.pendingSync)} />
                  <StatCard label="Fecha local" value={localDate().slice(5)} />
                </View>

                <Card>
                  <Text style={styles.cardKicker}>ENTRENAMIENTO</Text>
                  <Text style={styles.cardTitle}>
                    {snapshot.activeWorkout ? snapshot.activeWorkout.title : "Sin sesión activa"}
                  </Text>
                  <Text style={styles.cardBody}>
                    {snapshot.activeWorkout
                      ? "La sesión está guardada en SQLite y seguirá disponible aunque cierres la app."
                      : "Inicia una sesión libre. En el siguiente bloque añadiremos ejercicios, series, carga, repeticiones y RIR."}
                  </Text>
                  <PrimaryButton
                    label={snapshot.activeWorkout ? "Continuar sesión" : "Iniciar sesión"}
                    onPress={snapshot.activeWorkout ? () => setTab("training") : startWorkout}
                    disabled={busy}
                  />
                </Card>

                <View style={styles.grid}>
                  <MiniCard title="Nutrición" body="Registro manual, código de barras y foto con confirmación." />
                  <MiniCard title="Recuperación" body="Sueño, pasos, energía y carga reciente." />
                  <MiniCard title="Coach" body="IA contextual sobre hechos versionados, no sobre memoria inventada." />
                  <MiniCard title="Avatar" body="Capa 3D posterior, separada de las métricas de salud." />
                </View>
              </>
            ) : null}

            {tab === "training" ? (
              <>
                <Text style={styles.eyebrow}>LIVE WORKOUT</Text>
                <Text style={styles.hero}>
                  {snapshot.activeWorkout ? snapshot.activeWorkout.title : "No hay una sesión activa."}
                </Text>
                <Card>
                  <Text style={styles.cardTitle}>
                    {snapshot.activeWorkout ? "Sesión en curso" : "Empieza cuando estés lista"}
                  </Text>
                  <Text style={styles.cardBody}>
                    {snapshot.activeWorkout
                      ? "Persistencia offline activa. Todavía no se generan progresiones hasta tener series comparables completas."
                      : "El registro no crea una racha falsa ni una recomendación sin evidencia."}
                  </Text>
                  {snapshot.activeWorkout ? (
                    <PrimaryButton label="Finalizar sesión" onPress={finishWorkout} disabled={busy} />
                  ) : (
                    <PrimaryButton label="Iniciar sesión" onPress={startWorkout} disabled={busy} />
                  )}
                </Card>
              </>
            ) : null}

            {tab === "nutrition" ? <ModulePlaceholder title="Nutrición" detail="Base lista para porciones, macros, alimentos, recetas y confirmación de escaneos." /> : null}
            {tab === "recovery" ? <ModulePlaceholder title="Recuperación" detail="Base lista para sueño, pasos, energía, soreness y readiness determinista." /> : null}
            {tab === "progress" ? <ModulePlaceholder title="Progreso" detail="Aquí vivirán PRs, tendencias, adherencia, metas y revisiones semanales." /> : null}
          </ScrollView>
        )}

        <View style={styles.nav}>
          {tabs.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => setTab(item.id)}
              style={[styles.navItem, tab === item.id && styles.navItemActive]}
            >
              <Text style={[styles.navText, tab === item.id && styles.navTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        pressed && styles.primaryButtonPressed,
        disabled && styles.primaryButtonDisabled,
      ]}
    >
      <Text style={styles.primaryButtonText}>{disabled ? "Guardando…" : label}</Text>
    </Pressable>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MiniCard({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.miniCard}>
      <Text style={styles.miniTitle}>{title}</Text>
      <Text style={styles.miniBody}>{body}</Text>
    </View>
  );
}

function ModulePlaceholder({ title, detail }: { title: string; detail: string }) {
  return (
    <>
      <Text style={styles.eyebrow}>MÓDULO</Text>
      <Text style={styles.hero}>{title}</Text>
      <Card>
        <Text style={styles.cardTitle}>Estructura preparada</Text>
        <Text style={styles.cardBody}>{detail}</Text>
        <Text style={styles.muted}>No se muestran datos inventados mientras el módulo todavía no tenga registros locales.</Text>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0A0D12" },
  shell: { flex: 1, backgroundColor: "#0A0D12" },
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#222A36",
  },
  brand: { color: "#F4F7FB", fontSize: 14, fontWeight: "900", letterSpacing: 1.8 },
  date: { color: "#7E8A9A", fontSize: 12, marginTop: 5, textTransform: "capitalize" },
  levelBadge: {
    minWidth: 64,
    borderWidth: 1,
    borderColor: "#2E8BFF",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: "center",
  },
  levelLabel: { color: "#7E8A9A", fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  levelValue: { color: "#F4F7FB", fontSize: 13, fontWeight: "900", marginTop: 1 },
  content: { padding: 20, paddingBottom: 32, gap: 16 },
  eyebrow: { color: "#2E8BFF", fontSize: 11, fontWeight: "900", letterSpacing: 1.6 },
  hero: { color: "#F4F7FB", fontSize: 28, lineHeight: 34, fontWeight: "900", maxWidth: 560 },
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: {
    flex: 1,
    minHeight: 88,
    backgroundColor: "#111722",
    borderRadius: 18,
    padding: 14,
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#1C2532",
  },
  statValue: { color: "#F4F7FB", fontSize: 21, fontWeight: "900" },
  statLabel: { color: "#7E8A9A", fontSize: 10, lineHeight: 14, fontWeight: "700" },
  card: {
    backgroundColor: "#111722",
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: "#1C2532",
    gap: 10,
  },
  cardKicker: { color: "#6DE0A8", fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  cardTitle: { color: "#F4F7FB", fontSize: 22, fontWeight: "900" },
  cardBody: { color: "#AAB4C2", fontSize: 14, lineHeight: 21 },
  primaryButton: {
    backgroundColor: "#2E8BFF",
    minHeight: 48,
    borderRadius: 15,
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  primaryButtonPressed: { opacity: 0.82 },
  primaryButtonDisabled: { opacity: 0.45 },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "900", fontSize: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  miniCard: {
    width: "48%",
    flexGrow: 1,
    minHeight: 128,
    backgroundColor: "#0E141D",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1C2532",
  },
  miniTitle: { color: "#F4F7FB", fontWeight: "900", fontSize: 15 },
  miniBody: { color: "#7E8A9A", fontSize: 12, lineHeight: 17, marginTop: 8 },
  nav: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#222A36",
    backgroundColor: "#0D1118",
  },
  navItem: {
    flex: 1,
    minHeight: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  navItemActive: { backgroundColor: "#182131" },
  navText: { color: "#6F7B8B", fontSize: 10, fontWeight: "800" },
  navTextActive: { color: "#F4F7FB" },
  errorBox: {
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#2A171B",
    borderWidth: 1,
    borderColor: "#61313A",
  },
  errorText: { color: "#FFB5C0", fontSize: 12, lineHeight: 18 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  muted: { color: "#7E8A9A", fontSize: 12, lineHeight: 18 },
});
