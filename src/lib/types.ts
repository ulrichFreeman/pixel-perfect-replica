export type MatchStatus = "à venir" | "en cours" | "terminé" | "reporté";
export type AnalysisStatus = "brouillon" | "à vérifier" | "validée" | "rejetée" | "publiée";

export interface Match {
  id: string;
  league: string;
  home: string;
  away: string;
  kickoff: string; // ISO UTC
  status: MatchStatus;
  source: string;
  isDemo: boolean;
  statsAvailable: boolean;
  score?: { home: number; away: number };
}

export interface PastGame {
  date: string;
  opponent: string;
  venue: "D" | "E";
  gf: number;
  ga: number;
  source?: string;
}

export interface TeamHistory {
  team: string;
  games: PastGame[];
  isDemo: boolean;
}

export interface HeadToHead {
  date: string;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
}

export interface AnalysisNote {
  date: string;
  text: string;
}

export interface Analysis {
  id: string;
  matchId: string;
  status: AnalysisStatus;
  summary: string;
  selection: string; // marché retenu par l'admin, ex. "Plus de 1,5 but"
  notes: AnalysisNote[];
  outcome: "réussie" | "échouée" | null;
  updatedAt: string;
}

export interface Ebook {
  id: string;
  title: string;
  subtitle: string;
  publicationDate: string;
  coverColor: string;
  analysisIds: string[];
  createdAt: string;
  status: "généré" | "publié";
  publishedAt?: string;
  fileName: string;
  version?: number;
  generatedAt?: string;
  snapshot?: import("./report").ReportSnapshot;
}

export interface SyncLog {
  date: string;
  level: "info" | "erreur";
  message: string;
}

export interface AppData {
  matches: Match[];
  histories: TeamHistory[];
  h2h: HeadToHead[];
  analyses: Analysis[];
  ebooks: Ebook[];
  logs: SyncLog[];
  lastSync: string | null;
}
