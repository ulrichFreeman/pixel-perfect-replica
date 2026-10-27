<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- `src/lib/store.tsx` holds two isolated datasets: demo (localStorage only) and real (Cloud via `src/lib/remote.ts`, admin-only RLS); why: demo data must never reach real storage.
- Domain logic is split by module in `src/lib/` (csv = collecte, stats, pdf, store = validation/history); why: each can later move server-side independently.
- Probabilities come only from `computeProbabilities` in `src/lib/stats.ts` (Poisson, pre-kickoff data only, min sample, returns a reason when invalid); explanatory copy lives in `stats-text.ts`; why: traceable, leak-free figures.
- PDF reports render only versioned generation-time snapshots from `src/lib/report.ts`; never regenerate legacy reports from live data. Cloud snapshots are immutable and validation-checked by a trigger; why: published statistics and source data must remain reproducible after edits.
