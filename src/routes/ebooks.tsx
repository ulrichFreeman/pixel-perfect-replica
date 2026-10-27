import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { seo } from "@/lib/seo";
import { fmtDateTime } from "@/lib/format";
import { generateEbookPdf } from "@/lib/pdf";
import { createReportSnapshot, eligibleAnalyses } from "@/lib/report";
import { deliverFile } from "@/lib/download";
import type { Ebook } from "@/lib/types";
import { Badge, Button, Card, Empty, Input, Label, PageHeader } from "@/components/kit";
import { Check, FileDown, Loader2 } from "lucide-react";

export const Route = createFileRoute("/ebooks")({
  head: () => seo("Générateur d’ebooks PDF", "Rapports A4 à partir d’analyses validées, avec statistiques et probabilités archivées."),
  component: Ebooks,
});
const covers = [
  { name: "Forêt", color: "#12382b", className: "report-cover-forest" },
  { name: "Océan", color: "#0f1e3a", className: "report-cover-ocean" },
  { name: "Graphite", color: "#2a2f3a", className: "report-cover-graphite" },
];
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Porto-Novo" }).format(new Date());
function Ebooks() {
  const { data, addEbook, mode, isAdmin } = useStore();
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState("Analyses statistiques de la semaine");
  const [subtitle, setSubtitle] = useState("Sélection de matchs étudiés par FootData Analytics");
  const [date, setDate] = useState(today);
  const [start, setStart] = useState(() => data.matches.map(m => m.kickoff.slice(0, 10)).sort()[0] ?? today());
  const [end, setEnd] = useState(() => data.matches.map(m => m.kickoff.slice(0, 10)).sort().at(-1) ?? today());
  const [cover, setCover] = useState(covers[0]);
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<{ blob: Blob; name: string } | null>(null);
  const validated = eligibleAnalyses(data, start, end);
  const chosen = picked.filter(id => validated.some(a => a.id === id));
  async function generate() {
    if (mode === "real" && !isAdmin) return;
    setBusy(true); setPrepared(null);
    try {
      const id = crypto.randomUUID();
      const generatedAt = new Date().toISOString();
      const snapshot = createReportSnapshot(data, chosen, mode, { start, end }, generatedAt);
      const ebook: Ebook = { id, title: title.trim(), subtitle: subtitle.trim(), publicationDate: date, coverColor: cover.color, analysisIds: chosen, fileName: `footdata-${date}-${id.slice(0, 8)}.pdf`, status: "généré", createdAt: generatedAt, generatedAt, version: 1, snapshot };
      const blob = await generateEbookPdf(ebook);
      await addEbook(ebook);
      setPrepared({ blob, name: ebook.fileName }); setPicked([]);
      toast.success("PDF prêt et archivé");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec de la génération"); }
    finally { setBusy(false); }
  }
  return <>
    <PageHeader title="Générateur d’ebooks PDF" />
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Card title="Analyses validées">
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div><Label>Début de période</Label><Input aria-label="Début de période" type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
          <div><Label>Fin de période</Label><Input aria-label="Fin de période" type="date" value={end} onChange={e => setEnd(e.target.value)} /></div>
        </div>
        {start > end && <p className="mb-3 text-sm text-destructive">La fin doit suivre le début de période.</p>}
        {!validated.length ? <Empty title="Aucune analyse validée sur cette période" action={<Link to="/validation" className="text-sm text-primary">Aller à la validation</Link>} /> : <ul className="space-y-2">{validated.map(a => {
          const m = data.matches.find(x => x.id === a.matchId);
          if (!m) return null;
          const on = picked.includes(a.id);
          return <li key={a.id}><label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-accent/40">
            <input type="checkbox" checked={on} onChange={() => setPicked(on ? picked.filter(x => x !== a.id) : [...picked, a.id])} className="mt-1 accent-primary" />
            <div className="min-w-0"><p className="text-sm font-medium">{m.home} – {m.away} {m.isDemo && <Badge tone="warning">Démo fictive</Badge>}</p><p className="text-xs text-muted-foreground">{fmtDateTime(m.kickoff)} · {a.selection}</p></div>
          </label></li>;
        })}</ul>}
      </Card>
      <Card title="Couverture">
        <div className="space-y-3">
          <div className={`report-cover flex aspect-[3/4] flex-col justify-between rounded-lg p-5 ${cover.className}`}>
            <p className="text-xs font-semibold">FOOTDATA ANALYTICS</p>
            <div className="break-words"><p className="font-display text-lg font-semibold leading-snug">{title}</p><p className="mt-2 text-xs">{subtitle}</p></div>
            <p className="text-xs">{start} — {end}{mode === "demo" && <span className="mt-2 block font-semibold">DÉMONSTRATION FICTIVE</span>}</p>
          </div>
          <div className="flex gap-2">{covers.map(c => <Button key={c.name} aria-label={`Couverture ${c.name}`} aria-pressed={cover.name === c.name} title={c.name} variant="ghost" onClick={() => setCover(c)} className={`report-cover h-9 w-9 p-0 ${c.className}`}>{cover.name === c.name && <Check className="h-4 w-4" />}</Button>)}</div>
          <div><Label>Titre</Label><Input aria-label="Titre" value={title} maxLength={140} onChange={e => setTitle(e.target.value)} /></div>
          <div><Label>Sous-titre</Label><Input aria-label="Sous-titre" value={subtitle} maxLength={240} onChange={e => setSubtitle(e.target.value)} /></div>
          <div><Label>Date de publication</Label><Input aria-label="Date de publication" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          <Button className="w-full" disabled={!chosen.length || !title.trim() || !date || start > end || busy || (mode === "real" && !isAdmin)} onClick={generate}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}Générer le PDF ({chosen.length})</Button>
          {prepared && <Button className="w-full" variant="secondary" onClick={() => void deliverFile(prepared.blob, prepared.name)}><FileDown className="h-4 w-4" />Télécharger le PDF</Button>}
        </div>
      </Card>
    </div>
  </>;
}
