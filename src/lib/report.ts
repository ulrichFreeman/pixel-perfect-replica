import type { Analysis, AppData, Ebook, Match, TeamHistory, HeadToHead } from "./types";
import { computeProbabilities, computeTeamStats, headToHead, MODEL_VERSION, type ProbabilityResult, type TeamStats } from "./stats";
import { MODEL_TEXT, REASON_TEXT } from "./stats-text";
import { TZ } from "./format";

export interface ReportEntry {
  analysis: Analysis;
  match: Match;
  homeHistory: TeamHistory | null;
  awayHistory: TeamHistory | null;
  homeStats: TeamStats | null;
  awayStats: TeamStats | null;
  probabilities: ProbabilityResult;
  h2h: HeadToHead[];
}
export interface ReportSnapshot {
  schemaVersion: 1;
  mode: "demo" | "real";
  generatedAt: string;
  period: { start: string; end: string };
  modelVersion: string;
  explanations: typeof MODEL_TEXT;
  reasons: typeof REASON_TEXT;
  entries: ReportEntry[];
}

const localDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
export function eligibleAnalyses(data: AppData, start: string, end: string) {
  return data.analyses.filter((a) => {
    const m = data.matches.find((x) => x.id === a.matchId);
    return a.status === "validée" && m && localDay(m.kickoff) >= start && localDay(m.kickoff) <= end;
  });
}

export function createReportSnapshot(data: AppData, ids: string[], mode: "demo" | "real", period: ReportSnapshot["period"], generatedAt: string): ReportSnapshot {
  if (!period.start || !period.end || period.start > period.end) throw new Error("Période invalide.");
  if (!ids.length || new Set(ids).size !== ids.length) throw new Error("Sélectionnez des analyses distinctes et validées.");
  const eligible = eligibleAnalyses(data, period.start, period.end);
  const entries = ids.map((id): ReportEntry => {
    const analysis = eligible.find((a) => a.id === id);
    if (!analysis) throw new Error("Une analyse n’est plus validée ou est hors période.");
    const match = data.matches.find((m) => m.id === analysis.matchId);
    if (!match) throw new Error("Match introuvable.");
    const home = data.histories.find((h) => h.team === match.home);
    const away = data.histories.find((h) => h.team === match.away);
    if (mode === "real" && (match.isDemo || home?.isDemo || away?.isDemo)) throw new Error("Les données fictives sont interdites dans un rapport réel.");
    if (mode === "demo" && !match.isDemo) throw new Error("Les espaces réel et démo ne peuvent pas être mélangés.");
    const homeStats = computeTeamStats(home, { before: match.kickoff });
    const awayStats = computeTeamStats(away, { before: match.kickoff });
    return {
      analysis, match,
      homeHistory: home && homeStats ? { ...home, games: homeStats.games } : null,
      awayHistory: away && awayStats ? { ...away, games: awayStats.games } : null,
      homeStats, awayStats,
      probabilities: computeProbabilities(home, away, match.kickoff),
      h2h: headToHead(data.h2h, match.home, match.away, match.kickoff),
    };
  });
  return JSON.parse(JSON.stringify({ schemaVersion: 1, mode, generatedAt, period, modelVersion: MODEL_VERSION, explanations: MODEL_TEXT, reasons: REASON_TEXT, entries }));
}

export function assertReportArchive(e: Ebook): ReportSnapshot {
  const s = e.snapshot;
  if (!s) throw new Error("Ancien rapport sans instantané : téléchargement fidèle indisponible.");
  if (!s.entries.length || s.entries.length !== e.analysisIds.length || s.entries.some((x, i) => x.analysis.status !== "validée" || x.analysis.id !== e.analysisIds[i])) throw new Error("Archive invalide : seules les analyses validées sont autorisées.");
  if (s.mode === "real" && s.entries.some((x) => x.match.isDemo || x.homeHistory?.isDemo || x.awayHistory?.isDemo)) throw new Error("Données fictives détectées dans une archive réelle.");
  return s;
}