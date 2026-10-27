ALTER TABLE public.pdf_reports ADD COLUMN IF NOT EXISTS snapshot jsonb;
ALTER TABLE public.pdf_reports ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.pdf_reports ADD COLUMN IF NOT EXISTS generated_at timestamptz NOT NULL DEFAULT now();
COMMENT ON COLUMN public.pdf_reports.snapshot IS 'Immutable generation-time data, validated analyses, sources and computed probabilities. NULL identifies legacy reports without a reproducible archive.';
CREATE OR REPLACE FUNCTION public.validate_report_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE item jsonb; ids uuid[];
BEGIN
 IF TG_OP = 'UPDATE' AND OLD.snapshot IS NOT NULL THEN
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.analysis_ids IS DISTINCT FROM OLD.analysis_ids OR NEW.version IS DISTINCT FROM OLD.version OR NEW.generated_at IS DISTINCT FROM OLD.generated_at OR NEW.title IS DISTINCT FROM OLD.title OR NEW.subtitle IS DISTINCT FROM OLD.subtitle OR NEW.publication_date IS DISTINCT FROM OLD.publication_date OR NEW.cover_color IS DISTINCT FROM OLD.cover_color OR NEW.file_name IS DISTINCT FROM OLD.file_name THEN
   RAISE EXCEPTION 'Le contenu archivé est immuable';
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.snapshot IS NULL OR NEW.snapshot->>'mode' IS DISTINCT FROM 'real' OR jsonb_typeof(NEW.snapshot->'entries') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.snapshot->'entries') = 0 THEN
  RAISE EXCEPTION 'Un rapport réel nécessite un instantané réel non vide';
 END IF;
 ids := ARRAY[]::uuid[];
 FOR item IN SELECT value FROM jsonb_array_elements(NEW.snapshot->'entries') LOOP
  IF item->'analysis'->>'status' IS DISTINCT FROM 'validée' OR item->'match'->>'isDemo' IS DISTINCT FROM 'false' OR item->'homeHistory'->>'isDemo' = 'true' OR item->'awayHistory'->>'isDemo' = 'true' THEN
   RAISE EXCEPTION 'Analyse non validée ou données fictives interdites';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.analyses a JOIN public.matches m ON m.id = a.match_id WHERE a.id = (item->'analysis'->>'id')::uuid AND a.status = 'validée' AND a.match_id = (item->'match'->>'id')::uuid AND a.updated_at = (item->'analysis'->>'updatedAt')::timestamptz) THEN
   RAISE EXCEPTION 'Analyse modifiée depuis sa sélection : rechargez les données';
  END IF;
  ids := array_append(ids, (item->'analysis'->>'id')::uuid);
 END LOOP;
 IF ids IS DISTINCT FROM NEW.analysis_ids OR (SELECT count(DISTINCT x) FROM unnest(ids) x) <> cardinality(ids) THEN
  RAISE EXCEPTION 'Liste des analyses incohérente';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER validate_pdf_report_snapshot BEFORE INSERT OR UPDATE ON public.pdf_reports FOR EACH ROW EXECUTE FUNCTION public.validate_report_snapshot();