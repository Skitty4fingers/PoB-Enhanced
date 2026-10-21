import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, ClipboardCheck, Copy, ExternalLink, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { api } from "../../api/client";
import { useBuildMutation } from "../../api/hooks";
import type { CompareResult, ItemCheck } from "../../api/types";
import { ErrorText } from "../../components/ErrorText";
import { fmtNum } from "../../components/format";
import { ItemVerdict } from "../../components/ItemVerdict";
import { Modal } from "../../components/Modal";

const who = (b: CompareResult["mine"]) =>
  [b.ascendClassName ?? b.className, b.level ? `level ${b.level}` : null, b.skill].filter(Boolean).join(" · ");

function Pct({ pct, better }: { pct: number | null; better: boolean | null }) {
  if (pct === null || better === null || Math.abs(pct) < 0.05) return <span className="text-ink-400">–</span>;
  return <span className={better ? "text-good" : "text-bad"}>{pct > 0 ? "+" : ""}{pct.toFixed(1)}%</span>;
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="label">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Compare the live build with another one (a ladder character, a guide's PoB, an older version of yours). */
export function CompareTab() {
  const data = useQuery({ queryKey: ["compare"], queryFn: () => api.get<CompareResult | null>("/compare") });
  const load = useBuildMutation((source: string) => api.put<CompareResult>("/compare", { source }));
  const clear = useBuildMutation(() => api.del("/compare"));
  const copy = useBuildMutation((body: { what: "tree" | "item" | "config"; slot?: string }) => api.post("/compare/copy", body));
  const check = useMutation({ mutationFn: (text: string) => api.post<ItemCheck>("/items/check", { text }) });
  const [source, setSource] = useState("");
  const c = data.data;

  return (
    <div className="space-y-4 p-4">
      <form className="panel flex flex-wrap items-center gap-2 p-3" onSubmit={(e) => { e.preventDefault(); if (source.trim()) load.mutate(source.trim()); }}>
        <ArrowLeftRight size={16} className="text-gold-soft" />
        <input className="input min-w-[16rem] flex-1" value={source} onChange={(e) => setSource(e.target.value)}
          placeholder="Build to compare: share code, pobb.in / Maxroll / poe.ninja character link, or XML" />
        <button className="btn btn-primary" disabled={load.isPending || !source.trim()}>{load.isPending ? "Loading…" : "Compare"}</button>
        {c && <button type="button" className="btn btn-ghost" onClick={() => clear.mutate(undefined)} aria-label="Stop comparing"><X size={14} /></button>}
      </form>
      <ErrorText error={data.error ?? load.error ?? copy.error} />
      {!c && !load.isPending && (
        <p className="text-sm text-ink-400">
          Load any build to see it next to yours: DPS, EHP and stats, items per slot, skills and supports, notables only one of you takes, and config differences.
          Copy their tree, config or any item across in one click (undoable). Your build is not changed by comparing.
        </p>
      )}
      {c && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="panel p-3"><div className="label">Yours</div><div className="text-ink-200">{c.mine.name}</div><div className="text-sm text-ink-400">{who(c.mine)}</div></div>
            <div className="panel p-3">
              <div className="label flex items-center gap-2">Compared {c.source && <a className="text-gold-soft" href={c.source} target="_blank" rel="noreferrer"><ExternalLink size={12} /></a>}</div>
              <div className="text-ink-200">{c.theirs.name}</div><div className="text-sm text-ink-400">{who(c.theirs)}</div>
            </div>
          </div>

          <Section title="Stats">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-ink-400"><th className="py-1 font-normal"></th><th className="font-normal">Yours</th><th className="font-normal">Theirs</th><th className="font-normal">Difference</th></tr></thead>
              <tbody>
                {c.stats.map((s) => (
                  <tr key={s.key} className={`border-t border-ink-800 ${s.key === "DPS" || s.key === "EHP" ? "text-base font-semibold" : ""}`}>
                    <td className="py-1 text-ink-400">{s.label}</td>
                    <td className="tabular-nums text-ink-200">{fmtNum(s.mine)}</td>
                    <td className="tabular-nums text-ink-200">{fmtNum(s.theirs)}</td>
                    <td className="tabular-nums"><Pct pct={s.pct} better={s.theirsBetter} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="Items">
            <ul className="divide-y divide-ink-800 text-sm">
              {c.items.map((r) => (
                <li key={r.slot} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                  <span className="w-28 shrink-0 text-ink-400">{r.slot}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-200">{r.mine ?? <span className="text-ink-400">empty</span>}</span>
                  <span className={`min-w-0 flex-1 truncate ${r.same ? "text-ink-400" : "text-gold-soft"}`}>{r.same ? "same" : r.theirs ?? "empty"}</span>
                  {!r.same && r.theirsText && (
                    <span className="flex shrink-0 gap-1">
                      <button className="btn" disabled={check.isPending} onClick={() => check.mutate(r.theirsText!)} title="Check their item in your build before copying"><ClipboardCheck size={13} /> Check</button>
                      <button className="btn" disabled={copy.isPending} onClick={() => copy.mutate({ what: "item", slot: r.slot })} title="Equip their item in your build (undoable)"><Copy size={13} /> Copy</button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Skills and supports">
              <ul className="space-y-1.5 text-sm">
                {c.skills.map((s) => (
                  <li key={s.skill}>
                    <span className={s.inMine && s.inTheirs ? "text-ink-200" : "text-gold-soft"}>{s.skill}</span>
                    {(s.mainInMine || s.mainInTheirs) && <span className="ml-1 text-xs text-ink-400">(main{s.mainInMine && s.mainInTheirs ? "" : s.mainInMine ? " for you" : " for them"})</span>}
                    {!s.inTheirs && <span className="ml-2 text-xs text-ink-400">only yours</span>}
                    {!s.inMine && <span className="ml-2 text-xs text-ink-400">only theirs</span>}
                    {s.supportsOnlyTheirs.length > 0 && <div className="text-xs text-good">+ they use {s.supportsOnlyTheirs.join(", ")}</div>}
                    {s.supportsOnlyMine.length > 0 && <div className="text-xs text-ink-400">− you use {s.supportsOnlyMine.join(", ")}</div>}
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="Passive tree" action={<button className="btn" disabled={copy.isPending} onClick={() => { if (confirm("Replace your passive tree with theirs? (Undo is available.)")) copy.mutate({ what: "tree" }); }}><Copy size={13} /> Copy their tree</button>}>
              <p className="text-sm text-ink-400">{c.tree.shared} nodes shared · you {c.tree.mineNodes} · them {c.tree.theirsNodes}</p>
              {c.tree.notablesOnlyTheirs.length > 0 && <><div className="mt-2 text-xs text-ink-400">Notables only they take</div><p className="text-sm text-gold-soft">{c.tree.notablesOnlyTheirs.join(", ")}</p></>}
              {c.tree.notablesOnlyMine.length > 0 && <><div className="mt-2 text-xs text-ink-400">Notables only you take</div><p className="text-sm text-ink-200">{c.tree.notablesOnlyMine.join(", ")}</p></>}
            </Section>
          </div>

          {c.config.length > 0 && (
            <Section title="Config differences" action={<button className="btn" disabled={copy.isPending} onClick={() => copy.mutate({ what: "config" })}><Copy size={13} /> Use their config</button>}>
              <ul className="divide-y divide-ink-800 text-sm">
                {c.config.map((r) => (
                  <li key={r.var} className="flex gap-3 py-1"><span className="flex-1 text-ink-400">{r.label}</span><span className="w-24 text-ink-200">{String(r.mine ?? "–")}</span><span className="w-24 text-gold-soft">{String(r.theirs ?? "–")}</span></li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
      {check.data && (
        <Modal title="Their item in your build" onClose={() => check.reset()} wide>
          <ItemVerdict check={check.data} />
        </Modal>
      )}
    </div>
  );
}
