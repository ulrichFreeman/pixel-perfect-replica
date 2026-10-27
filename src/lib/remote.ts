// Accès aux données réelles stockées en ligne (règles de sécurité : administrateur uniquement).
import { supabase } from "@/integrations/supabase/client";
import type { Analysis, AppData, Ebook, Match, TeamHistory } from "./types";

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

export async function loadRealData(): Promise<AppData> {
  const [matches, teams, stats, h2h, analyses, reports, logs] = await Promise.all([
    supabase.from("matches").select("*, competition:competitions(name), home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name)").order("kickoff"),
    supabase.from("teams").select("id,name"),
    supabase.from("team_match_stats").select("*").order("match_date", { ascending: false }),
    supabase.from("historical_results").select("*").order("match_date", { ascending: false }),
    supabase.from("analyses").select("*"),
    supabase.from("pdf_reports").select("*").order("created_at", { ascending: false }),
    supabase.from("sync_logs").select("*").order("created_at", { ascending: false }).limit(200),
  ]);
  const teamName = new Map(check(teams).map((t) => [t.id, t.name]));
  const hist = new Map<string, TeamHistory>();
  for (const s of check(stats)) {
    const name = teamName.get(s.team_id) ?? "?";
    if (!hist.has(name)) hist.set(name, { team: name, games: [], isDemo: false });
    hist.get(name)?.games.push({ date: s.match_date, opponent: s.opponent, venue: s.venue === "E" ? "E" : "D", gf: s.goals_for, ga: s.goals_against, source: s.source });
  }
  const logRows = check(logs);
  return {
    matches: check(matches).map((m): Match => ({
      id: m.id, league: m.competition?.name ?? "", home: m.home?.name ?? "", away: m.away?.name ?? "",
      kickoff: m.kickoff, status: m.status as Match["status"], source: m.source, isDemo: false,
      statsAvailable: m.stats_available,
      score: m.home_score != null && m.away_score != null ? { home: m.home_score, away: m.away_score } : undefined,
    })),
    histories: [...hist.values()],
    h2h: check(h2h).map((r) => ({ date: r.match_date, home: r.home_team, away: r.away_team, homeGoals: r.home_goals, awayGoals: r.away_goals })),
    analyses: check(analyses).map((a): Analysis => ({
      id: a.id, matchId: a.match_id, status: a.status as Analysis["status"], selection: a.selection, summary: a.summary,
      notes: (a.notes as unknown as Analysis["notes"]) ?? [], outcome: (a.outcome as Analysis["outcome"]) ?? null, updatedAt: a.updated_at,
    })),
    ebooks: check(reports).map((r): Ebook => ({
      id: r.id, title: r.title, subtitle: r.subtitle, publicationDate: r.publication_date, coverColor: r.cover_color,
      analysisIds: r.analysis_ids, createdAt: r.created_at, status: r.status as Ebook["status"],
      publishedAt: r.published_at ?? undefined, fileName: r.file_name,
      version: r.version, generatedAt: r.generated_at, snapshot: r.snapshot ? r.snapshot as unknown as Ebook["snapshot"] : undefined,
    })),
    logs: logRows.map((l) => ({ date: l.created_at, level: l.level as "info" | "erreur", message: l.message })),
    lastSync: logRows[0]?.created_at ?? null,
  };
}

export async function saveAnalysis(a: Analysis) {
  check(await supabase.from("analyses").upsert({
    id: a.id, match_id: a.matchId, status: a.status, selection: a.selection, summary: a.summary,
    notes: a.notes as never, outcome: a.outcome, updated_at: a.updatedAt,
  }));
}

export async function saveEbook(e: Ebook) {
  check(await supabase.from("pdf_reports").upsert({
    id: e.id, title: e.title, subtitle: e.subtitle, publication_date: e.publicationDate.slice(0, 10), cover_color: e.coverColor,
    analysis_ids: e.analysisIds, file_name: e.fileName, status: e.status, published_at: e.publishedAt ?? null,
    snapshot: e.snapshot as never, version: e.version ?? 1, generated_at: e.generatedAt ?? e.createdAt,
  }));
}

async function idsByName(table: "teams" | "competitions", names: string[]) {
  const uniq = [...new Set(names)];
  check(await supabase.from(table).upsert(uniq.map((name) => ({ name })), { onConflict: "name", ignoreDuplicates: true }));
  const rows = check(await supabase.from(table).select("id,name").in("name", uniq));
  return new Map(rows.map((r) => [r.name, r.id]));
}

/** Enregistre les matchs importés ; les doublons (mêmes équipes, même heure) sont ignorés. */
export async function saveMatches(ms: Match[]): Promise<number> {
  const comps = await idsByName("competitions", ms.map((m) => m.league));
  const teams = await idsByName("teams", ms.flatMap((m) => [m.home, m.away]));
  const rows = check(await supabase.from("matches").upsert(ms.map((m) => ({
    competition_id: comps.get(m.league)!, home_team_id: teams.get(m.home)!, away_team_id: teams.get(m.away)!,
    kickoff: m.kickoff, status: m.status, source: m.source, stats_available: m.statsAvailable,
  })), { onConflict: "home_team_id,away_team_id,kickoff", ignoreDuplicates: true }).select("id"));
  await supabase.from("sync_logs").insert({ level: "info", message: `Import CSV : ${rows.length} match(s) ajouté(s), ${ms.length - rows.length} doublon(s) ignoré(s).` });
  return rows.length;
}
