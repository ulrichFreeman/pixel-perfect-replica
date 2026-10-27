import { describe, expect, it } from "vitest";
import { createReportSnapshot, assertReportArchive, eligibleAnalyses } from "./report";
import { computeProbabilities } from "./stats";
import type { AppData, Ebook } from "./types";

const makeData = (): AppData => ({
  matches: [{ id: "m1", home: "A", away: "B", league: "Ligue", kickoff: "2026-02-01T16:00:00Z", isDemo: false, source: "CSV utilisateur", statsAvailable: true, status: "à venir" }],
  analyses: [{ id: "a1", matchId: "m1", status: "validée", summary: "Analyse validée", selection: "Plus de 1,5 but", notes: [], outcome: null, updatedAt: "2026-01-31T10:00:00Z" }],
  histories: ["A", "B"].map(team => ({ team, isDemo: false, games: Array.from({ length: 8 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, opponent: "C", gf: 2, ga: 1, venue: "D" as const, source: "Import historique" })) })),
  h2h: [], ebooks: [], logs: [], lastSync: null,
});
const period = { start: "2026-02-01", end: "2026-02-01" };
const time = "2026-01-31T12:00:00Z";
describe("règles des rapports PDF", () => {
  it.each(["brouillon", "à vérifier", "rejetée", "publiée"] as const)("refuse une analyse %s", status => {
    const data = makeData(); data.analyses[0].status = status;
    expect(() => createReportSnapshot(data, ["a1"], "real", period, time)).toThrow("validée");
  });
  it("exclut les analyses hors période", () => {
    expect(eligibleAnalyses(makeData(), "2026-02-02", "2026-02-03")).toHaveLength(0);
  });
  it("refuse les données fictives dans un rapport réel", () => {
    const data = makeData(); data.matches[0].isDemo = true;
    expect(() => createReportSnapshot(data, ["a1"], "real", period, time)).toThrow("fictives");
  });
  it("refuse un historique fictif même si le match est réel", () => {
    const data = makeData(); data.histories[0].isDemo = true;
    expect(() => createReportSnapshot(data, ["a1"], "real", period, time)).toThrow("fictives");
  });
  it("conserve les probabilités du moteur et les données malgré les modifications", () => {
    const data = makeData();
    const expected = computeProbabilities(data.histories[0], data.histories[1], data.matches[0].kickoff);
    const s = createReportSnapshot(data, ["a1"], "real", period, time);
    data.histories[0].games[0].gf = 99; data.analyses[0].summary = "Modifiée";
    expect(s.entries[0].probabilities).toEqual(expected);
    expect(s.entries[0].homeHistory?.games.find(g => g.date === "2026-01-01")?.gf).toBe(2);
    expect(s.entries[0].analysis.summary).toBe("Analyse validée");
    expect(s.generatedAt).toBe(time);
  });
  it("ne crée pas de probabilité sans données suffisantes", () => {
    const data = makeData(); data.histories = [];
    const result = createReportSnapshot(data, ["a1"], "real", period, time).entries[0].probabilities;
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("value");
  });
  it("conserve l’étiquette démo dans l’archive", () => {
    const data = makeData(); data.matches[0].isDemo = true; data.histories.forEach(h => { h.isDemo = true; });
    const s = createReportSnapshot(data, ["a1"], "demo", period, time);
    expect(s.mode).toBe("demo"); expect(s.entries[0].match.isDemo).toBe(true);
  });
  it("refuse de reconstruire un ancien rapport depuis les données vivantes", () => {
    expect(() => assertReportArchive({ analysisIds: ["a1"] } as Ebook)).toThrow("instantané");
  });
});