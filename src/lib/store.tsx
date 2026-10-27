// État de l'application. Deux espaces strictement séparés :
// - "demo" : données fictives, stockées dans ce navigateur uniquement ;
// - "real" : données réelles, chargées et enregistrées en ligne (administrateur connecté).
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createDemoData } from "./demo-data";
import { loadRealData, saveAnalysis, saveEbook, saveMatches } from "./remote";
import type { Analysis, AnalysisStatus, AppData, Ebook, Match } from "./types";

const KEY = "footdata-v1";
const MODE_KEY = "footdata-mode";
export type DataMode = "demo" | "real";

const empty = (): AppData => ({ matches: [], histories: [], h2h: [], analyses: [], ebooks: [], logs: [], lastSync: null });

interface Store {
  data: AppData;
  ready: boolean;
  mode: DataMode;
  setMode: (m: DataMode) => void;
  userEmail: string | null;
  isAdmin: boolean;
  authChecked: boolean;
  reload: () => Promise<void>;
  setAnalysisStatus: (id: string, status: AnalysisStatus) => void;
  addNote: (id: string, text: string) => void;
  updateAnalysis: (id: string, patch: { summary?: string; selection?: string }) => void;
  createAnalysis: (matchId: string) => string;
  setOutcome: (id: string, outcome: "réussie" | "échouée" | null) => void;
  addEbook: (e: Ebook) => Promise<void>;
  publishEbook: (id: string) => Promise<void>;
  importMatches: (m: Match[]) => Promise<number>;
  resetDemo: () => void;
  clearDemo: () => void;
}

const Ctx = createContext<Store | null>(null);
const nowIso = () => new Date().toISOString();
const fail = (e: unknown) => toast.error(`Échec de l'enregistrement en ligne : ${e instanceof Error ? e.message : e}`);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [demo, setDemo] = useState<AppData>(createDemoData);
  const [real, setReal] = useState<AppData>(empty);
  const [mode, setModeState] = useState<DataMode>("demo");
  const [ready, setReady] = useState(false);
  const [realReady, setRealReady] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setDemo(JSON.parse(raw));
      if (localStorage.getItem(MODE_KEY) === "real") setModeState("real");
    } catch { /* données corrompues : on garde la démo */ }
    setReady(true);
  }, []);

  useEffect(() => { if (ready) localStorage.setItem(KEY, JSON.stringify(demo)); }, [demo, ready]);

  const refreshAuth = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const u = data.user;
    setUserEmail(u?.email ?? null);
    if (u) {
      const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", u.id).eq("role", "admin").maybeSingle();
      setIsAdmin(!!role);
    } else setIsAdmin(false);
    setAuthChecked(true);
  }, []);

  useEffect(() => {
    void refreshAuth();
    const { data: sub } = supabase.auth.onAuthStateChange((ev) => {
      if (ev === "SIGNED_IN" || ev === "SIGNED_OUT" || ev === "USER_UPDATED") void refreshAuth();
    });
    return () => sub.subscription.unsubscribe();
  }, [refreshAuth]);

  const reload = useCallback(async () => {
    setRealReady(false);
    try { setReal(await loadRealData()); } catch (e) { toast.error(`Chargement impossible : ${e instanceof Error ? e.message : e}`); }
    setRealReady(true);
  }, []);

  useEffect(() => {
    if (mode === "real" && isAdmin) void reload();
    if (!isAdmin) setReal(empty());
  }, [mode, isAdmin, reload]);

  const setMode = (m: DataMode) => { setModeState(m); localStorage.setItem(MODE_KEY, m); };
  const isReal = mode === "real";
  const data = isReal ? real : demo;
  const setData = isReal ? setReal : setDemo;

  const mapA = (id: string, fn: (a: Analysis) => Analysis) => {
    let next: Analysis | undefined;
    setData((d) => ({ ...d, analyses: d.analyses.map((a) => (a.id === id ? (next = { ...fn(a), updatedAt: nowIso() }) : a)) }));
    if (isReal) {
      const cur = real.analyses.find((a) => a.id === id);
      if (cur) saveAnalysis(next ?? { ...fn(cur), updatedAt: nowIso() }).catch(fail);
    }
  };

  const store: Store = {
    data,
    ready: ready && (!isReal || realReady),
    mode, setMode, userEmail, isAdmin, authChecked, reload,
    setAnalysisStatus: (id, status) => mapA(id, (a) => ({ ...a, status })),
    addNote: (id, text) => mapA(id, (a) => ({ ...a, notes: [...a.notes, { date: nowIso(), text }] })),
    updateAnalysis: (id, patch) => mapA(id, (a) => ({ ...a, ...patch, status: a.status === "validée" ? "à vérifier" : a.status })),
    setOutcome: (id, outcome) => mapA(id, (a) => ({ ...a, outcome })),
    createAnalysis: (matchId) => {
      const id = isReal ? crypto.randomUUID() : `a-${Date.now()}`;
      const a: Analysis = { id, matchId, status: "brouillon", summary: "", selection: "", notes: [], outcome: null, updatedAt: nowIso() };
      setData((d) => ({ ...d, analyses: [...d.analyses, a] }));
      if (isReal) saveAnalysis(a).catch(fail);
      return id;
    },
    addEbook: async (e) => {
      if (!e.snapshot || e.snapshot.mode !== mode) throw new Error("Espace d’archivage incohérent.");
      if (isReal) {
        if (!isAdmin) throw new Error("Accès administrateur requis.");
        await saveEbook(e);
      }
      setData((d) => ({ ...d, ebooks: [e, ...d.ebooks] }));
    },
    publishEbook: async (id) => {
      const eb = data.ebooks.find((e) => e.id === id);
      if (!eb) return;
      const pub = { ...eb, status: "publié" as const, publishedAt: nowIso() };
      if (!eb.snapshot) throw new Error("Ce rapport ancien n’a pas d’instantané archivé.");
      if (isReal) {
        if (!isAdmin) throw new Error("Accès administrateur requis.");
        await saveEbook(pub);
        await Promise.all(real.analyses.filter((a) => eb.analysisIds.includes(a.id) && a.updatedAt === eb.snapshot?.entries.find((x) => x.analysis.id === a.id)?.analysis.updatedAt).map((a) => saveAnalysis({ ...a, status: "publiée" })));
      }
      setData((d) => ({
        ...d,
        ebooks: d.ebooks.map((e) => (e.id === id ? pub : e)),
        analyses: d.analyses.map((a) => (eb.analysisIds.includes(a.id) && a.updatedAt === eb.snapshot?.entries.find((x) => x.analysis.id === a.id)?.analysis.updatedAt ? { ...a, status: "publiée" } : a)),
      }));
    },
    importMatches: async (m) => {
      if (isReal) {
        const n = await saveMatches(m);
        await reload();
        return n;
      }
      setDemo((d) => ({
        ...d, matches: [...d.matches, ...m], lastSync: nowIso(),
        logs: [{ date: nowIso(), level: "info", message: `Import CSV : ${m.length} match(s) ajouté(s).` }, ...d.logs],
      }));
      return m.length;
    },
    resetDemo: () => setDemo(createDemoData()),
    clearDemo: () => setDemo(empty()),
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore hors StoreProvider");
  return s;
}
