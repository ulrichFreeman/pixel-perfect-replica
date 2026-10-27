import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { seo } from "@/lib/seo";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { generateEbookPdf } from "@/lib/pdf";
import { deliverFile } from "@/lib/download";
import type { Ebook } from "@/lib/types";
import { Badge, Button, Card, Empty, PageHeader, Table } from "@/components/kit";
import { FileDown, Loader2 } from "lucide-react";
export const Route = createFileRoute("/historique")({
  head: () => seo("Archives des ebooks PDF", "Rapports versionnés avec analyses, statistiques et probabilités conservées à la génération."),
  component: Historique,
});
function Historique() {
  const { data, publishEbook } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<Record<string, Blob>>({});
  async function prepare(e: Ebook) {
    setBusy(e.id);
    try { const blob = await generateEbookPdf(e); setPrepared(p => ({ ...p, [e.id]: blob })); }
    catch (err) { toast.error(err instanceof Error ? err.message : "PDF indisponible"); }
    finally { setBusy(null); }
  }
  async function publish(id: string) {
    setBusy(id);
    try { await publishEbook(id); toast.success("Rapport marqué comme publié"); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Publication impossible"); }
    finally { setBusy(null); }
  }
  return <>
    <PageHeader title="Historique des publications" />
    <Card>{!data.ebooks.length ? <Empty title="Aucun rapport généré" action={<Link to="/ebooks" className="text-sm text-primary">Créer un ebook</Link>} /> :
      <Table head={["Rapport / identifiant", "Publication", "Analyses", "Généré le", "Statut", ""]}>{data.ebooks.map(e => <tr key={e.id}>
        <td className="px-3 py-2.5"><p className="font-medium">{e.title}</p><p className="text-xs text-muted-foreground">v{e.version ?? 1} · {e.id}</p>{e.snapshot && <p className="text-xs text-muted-foreground">{e.snapshot.period.start} — {e.snapshot.period.end}</p>}</td>
        <td className="px-3 py-2.5 text-xs">{fmtDate(e.publicationDate)}</td><td className="num px-3 py-2.5">{e.analysisIds.length}</td>
        <td className="px-3 py-2.5 text-xs">{fmtDateTime(e.generatedAt ?? e.createdAt)}</td>
        <td className="px-3 py-2.5"><Badge tone={e.status === "publié" ? "success" : "neutral"}>{e.status === "publié" ? "Publié" : "Généré"}</Badge>{e.snapshot?.mode === "demo" && <Badge tone="warning">Démo fictive</Badge>}</td>
        <td className="px-3 py-2.5"><div className="flex flex-wrap justify-end gap-2">
          {!e.snapshot ? <span className="text-xs text-warning">Ancien rapport sans instantané</span> : prepared[e.id] ? <Button variant="secondary" onClick={() => void deliverFile(prepared[e.id], e.fileName)}><FileDown className="h-4 w-4" />Télécharger</Button> : <Button variant="ghost" disabled={busy !== null} onClick={() => void prepare(e)}>{busy === e.id && <Loader2 className="h-4 w-4 animate-spin" />}Préparer le PDF</Button>}
          {e.snapshot && e.status !== "publié" && <Button variant="secondary" disabled={busy !== null} onClick={() => void publish(e.id)}>Marquer publié</Button>}
        </div></td>
      </tr>)}</Table>}
    </Card>
  </>;
}
