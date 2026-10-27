// Génération à partir de l’instantané exclusivement; aucun accès aux données vivantes.
import type { Ebook } from "./types";
import { assertReportArchive } from "./report";
import { dec, pct } from "./stats";
import { fmtDate, fmtDateTime } from "./format";

export async function generateEbookPdf(ebook: Ebook): Promise<Blob> {
  const snapshot = assertReportArchive(ebook);
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const fonts = await Promise.all(["regular", "bold"].map(async (kind) => {
    const response = await fetch(`/fonts/report-${kind}.ttf`);
    if (!response.ok) throw new Error("Police PDF indisponible.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  }));
  fonts.forEach((font, i) => { doc.addFileToVFS(`report-${i}.ttf`, font); doc.addFont(`report-${i}.ttf`, "Report", i ? "bold" : "normal"); });
  const hex = /^#[0-9a-f]{6}$/i.test(ebook.coverColor) ? ebook.coverColor.slice(1) : "12382b";
  const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  const demo = snapshot.mode === "demo";
  let y = 24;
  const newPage = () => { doc.addPage(); y = 25; doc.setTextColor(25, 30, 35); };
  const ensure = (height: number) => { if (y + height > 275) newPage(); };
  const text = (value: string, size = 12, bold = false) => {
    doc.setFont("Report", bold ? "bold" : "normal"); doc.setFontSize(size);
    const lines = doc.splitTextToSize(value, 174) as string[];
    const lineHeight = size * 0.46;
    const paragraphHeight = lines.length * lineHeight + 3;
    if (paragraphHeight < 240) ensure(paragraphHeight);
    for (const line of lines) { ensure(lineHeight); doc.text(line, 18, y); y += lineHeight; }
    y += 3;
  };
  const heading = (value: string) => { ensure(22); y += 4; text(value, 15, true); };
  const table = (head: string[], body: (string | number)[][]) => {
    const estimatedHeight = (body.length + 1) * 12 + 8;
    ensure(estimatedHeight <= 220 ? estimatedHeight : 22);
    autoTable(doc, { startY: y, head: [head], body, margin: { left: 18, right: 18, top: 24, bottom: 24 }, styles: { font: "Report", fontSize: 10, cellPadding: 3, overflow: "linebreak" }, headStyles: { fillColor: rgb, fontStyle: "bold" }, rowPageBreak: "avoid" });
    const final = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
    y = (final ?? y) + 7;
  };
  doc.setProperties({ title: ebook.title, subject: ebook.subtitle, author: "FootData Analytics", creator: "FootData Analytics PDF v1" });
  doc.setCreationDate(new Date(snapshot.generatedAt));
  doc.setFillColor(...rgb); doc.rect(0, 0, 210, 297, "F"); doc.setTextColor(255, 255, 255);
  y = 30; text("FOOTDATA ANALYTICS", 13, true);
  if (demo) text("DÉMONSTRATION — DONNÉES FICTIVES", 13, true);
  y = 80; text(ebook.title, 26, true); text(ebook.subtitle, 14);
  text(`Période : ${fmtDate(snapshot.period.start)} au ${fmtDate(snapshot.period.end)}`, 12);
  text(`${snapshot.entries.length} analyse(s) validée(s) · Version ${ebook.version ?? 1}`, 12);
  newPage(); heading("Présentation des matchs");
  text(`Identifiant : ${ebook.id}`, 10);
  text(`Généré le ${fmtDateTime(snapshot.generatedAt)} (Porto-Novo). Publication prévue : ${fmtDate(ebook.publicationDate)}.`, 11);
  text(demo ? "Ce document contient exclusivement des données fictives de démonstration." : "Rapport établi à partir des données réelles importées. Les sources indiquées n’ont pas fait l’objet d’une vérification indépendante.", 12, true);
  table(["Championnat / source", "Match", "Coup d’envoi"], snapshot.entries.map((e) => [`${e.match.league}\n${e.match.source}`, `${e.match.home} – ${e.match.away}`, fmtDateTime(e.match.kickoff)]));
  for (const entry of snapshot.entries) {
    newPage(); text(`${entry.match.home} – ${entry.match.away}`, 19, true);
    text(`${entry.match.league} · ${fmtDateTime(entry.match.kickoff)}`, 11);
    text(`Analyse ${entry.analysis.id} · validée le ${fmtDateTime(entry.analysis.updatedAt)}`, 10);
    heading("Statistiques utilisées");
    const h = entry.homeStats, a = entry.awayStats;
    const row = (label: string, fn: (s: NonNullable<typeof h>) => string) => [label, h ? fn(h) : "Indisponible", a ? fn(a) : "Indisponible"];
    table(["Indicateur", entry.match.home, entry.match.away], [
      row("Matchs analysés", s => String(s.played)), row("Buts marqués / match", s => dec(s.avgScored)), row("Buts encaissés / match", s => dec(s.avgConceded)),
      row("Domicile : matchs / attaque / défense", s => `${s.home.played} / ${dec(s.home.avgScored)} / ${dec(s.home.avgConceded)}`),
      row("Extérieur : matchs / attaque / défense", s => `${s.away.played} / ${dec(s.away.avgScored)} / ${dec(s.away.avgConceded)}`),
      row("Forme (récent → ancien)", s => s.form.join(" · ")), row("Fréquence : plus de 1,5 but", s => pct(s.over15)), row("Fréquence : plus de 2,5 buts", s => pct(s.over25)), row("Fréquence : deux équipes marquent", s => pct(s.btts)),
    ]);
    text(snapshot.explanations.frequencies, 11);
    heading("Analyse validée"); text(`Sélection : ${entry.analysis.selection || "Aucune"}`, 12, true); text(entry.analysis.summary || "Aucun commentaire.");
    heading(snapshot.explanations.title);
    const p = entry.probabilities;
    if (p.ok) {
      const v = p.value;
      table(["Marché", "Estimation"], [["Victoire domicile", pct(v.homeWin)], ["Match nul", pct(v.draw)], ["Victoire extérieur", pct(v.awayWin)], ["Plus de 1,5 but", pct(v.over15)], ["Plus de 2,5 buts", pct(v.over25)], ["Les deux équipes marquent", pct(v.btts)], [`Score le plus probable : ${v.mostLikelyScore.home} – ${v.mostLikelyScore.away}`, pct(v.mostLikelyScore.p)]]);
      text(`Buts attendus : ${dec(v.lambdaHome)} / ${dec(v.lambdaAway)}. Modèle : ${v.trace.model}. Masse couverte par la grille : ${(v.trace.coverage * 100).toFixed(4)} %.`, 11);
      text(`Échantillons domicile / extérieur : ${v.trace.homeSample.played} / ${v.trace.awaySample.played} matchs. Séparation par lieu utilisée : ${v.trace.homeSample.usedVenueSplit ? "oui" : "non"} / ${v.trace.awaySample.usedVenueSplit ? "oui" : "non"}.`, 11);
      text(`Entrées : attaque domicile ${dec(v.trace.inputs.homeAttack)}, défense adverse ${dec(v.trace.inputs.awayDefence)}, attaque extérieur ${dec(v.trace.inputs.awayAttack)}, défense adverse ${dec(v.trace.inputs.homeDefence)}.`, 11);
      table(["Buts", "Domicile", "Extérieur"], v.homeGoals.map((value, k) => [String(k), `${(value * 100).toFixed(2)} %`, `${(v.awayGoals[k] * 100).toFixed(2)} %`]));
    } else {
      text(snapshot.explanations.unavailable, 12, true);
      p.reasons.forEach(reason => text(snapshot.reasons[reason]));
    }
    ensure(65); heading("Méthode et explications"); text(snapshot.explanations.method); text("V : victoire, N : nul, D : défaite. Les buts des équipes sont supposés indépendants. La grille 0–10 buts est renormalisée; sa masse couverte est indiquée ci-dessus."); text(snapshot.explanations.disclaimer, 12, true);
    newPage(); heading("Sources et données de calcul"); text(`Source du match : ${entry.match.source}. Données arrêtées avant ${fmtDateTime(entry.match.kickoff)}.`, 11);
    for (const [team, history] of [[entry.match.home, entry.homeHistory], [entry.match.away, entry.awayHistory]] as const) {
      heading(team);
      if (!history) text("Aucun historique disponible.");
      else table(["Date / lieu", "Adversaire", "Buts pour / contre", "Source"], history.games.map(g => [ `${g.date} · ${g.venue === "D" ? "dom." : "ext."}`, g.opponent, `${g.gf} / ${g.ga}`, demo ? "Démonstration fictive" : g.source || "Import historique — origine non renseignée" ]));
    }
    heading("Confrontations directes");
    if (!entry.h2h.length) text("Aucune confrontation antérieure disponible.");
    else table(["Date", "Match / score"], entry.h2h.map(g => [g.date, `${g.home} ${g.homeGoals} – ${g.awayGoals} ${g.away}`]));
    text(demo ? "Source des confrontations : démonstration fictive." : "Source des confrontations : résultats historiques importés; origine non renseignée.", 10);
  }
  newPage(); heading("Limites de l’analyse");
  text("Les performances passées portent sur un échantillon limité. Ce modèle de Poisson indépendant ne tient pas compte des blessures, suspensions, météo, compositions ni changements d’effectif. Les historiques ne constituent pas une moyenne de championnat. La qualité des estimations dépend de celle des imports; les fréquences observées ne sont pas des probabilités de gain.");
  text("Les statistiques et probabilités sont figées à la génération du rapport. Toute correction ultérieure nécessite un nouveau rapport. Aucune analyse ne garantit un résultat.");
  heading("Avertissement sur les paris"); text("Les paris sportifs comportent un risque de perte financière et de dépendance. Ne misez jamais plus que ce que vous pouvez perdre. Document informatif, sans conseil financier; réservé aux personnes majeures.");
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFont("Report", "normal"); doc.setFontSize(8);
    if (i === 1) doc.setTextColor(255, 255, 255);
    else doc.setTextColor(90, 95, 100);
    doc.text(`FootData · v${ebook.version ?? 1} · ${demo ? "DÉMO FICTIVE" : "DONNÉES RÉELLES"}`, 18, 286);
    doc.text(`${i} / ${pages}`, 192, 286, { align: "right" });
  }
  return doc.output("blob");
}
