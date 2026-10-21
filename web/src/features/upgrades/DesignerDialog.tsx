import { useMutation, useQuery } from "@tanstack/react-query";
import { ClipboardCheck, Copy, ExternalLink, Search, Wand2 } from "lucide-react";
import { useState } from "react";
import { api, qs } from "../../api/client";
import type { DesignedRare, ItemCheck } from "../../api/types";
import { ErrorText } from "../../components/ErrorText";
import { ItemVerdict } from "../../components/ItemVerdict";
import { Modal } from "../../components/Modal";

type Metric = "balanced" | "dps" | "ehp";

const gainText = (g: { dpsPercent: number; ehpPercent: number }) =>
  [Math.abs(g.dpsPercent) >= 0.05 && `${g.dpsPercent > 0 ? "+" : ""}${g.dpsPercent.toFixed(1)}% DPS`,
    Math.abs(g.ehpPercent) >= 0.05 && `${g.ehpPercent > 0 ? "+" : ""}${g.ehpPercent.toFixed(1)}% EHP`].filter(Boolean).join(" · ") || "±0";

/** "Design best rare" for one gear slot: the best mods from the real pool, measured in this build. */
export function DesignerButton({ slot, metric, league }: { slot: string; metric: Metric; league?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)} title="Build the best rare for this slot from the real mod pool, measured in your build">
        <Wand2 size={13} /> Design best rare
      </button>
      {open && <DesignerDialog slot={slot} metric={metric} league={league} onClose={() => setOpen(false)} />}
    </>
  );
}

function DesignerDialog({ slot, metric, league, onClose }: { slot: string; metric: Metric; league?: string; onClose: () => void }) {
  const [itemLevel, setItemLevel] = useState(82);
  const design = useQuery({
    queryKey: ["designer", slot, metric, itemLevel, league],
    queryFn: () => api.get<DesignedRare>(`/designer${qs({ slot, metric, itemLevel, league })}`),
  });
  const check = useMutation({ mutationFn: (text: string) => api.post<ItemCheck>("/items/check", { text, slot }) });
  const [copied, setCopied] = useState(false);
  const d = design.data;
  return (
    <Modal title={`Best rare for ${slot}`} onClose={onClose} wide>
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-400">
        Item level
        <select className="input w-auto" value={itemLevel} onChange={(e) => setItemLevel(Number(e.target.value))}>
          {[65, 75, 81, 82, 84, 86].map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <span>Keeps your base, sockets, runes and implicits. Each mod is the top tier at this item level, rolled at the top of its range.</span>
      </div>
      <ErrorText error={design.error ?? check.error} />
      {design.isLoading && <p className="mt-3 text-sm text-ink-400">Trying every mod that can roll on this base…</p>}
      {d && (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <div className="label mb-1">{d.base} · replaces {d.replaces}</div>
            <div className="text-lg font-semibold text-good">{gainText(d.gain)}</div>
            <ul className="mt-2 space-y-1.5 text-sm">
              {d.mods.map((m, i) => (
                <li key={i} className="flex items-baseline gap-2">
                  <span className="w-12 shrink-0 text-[11px] uppercase text-ink-400">{m.type}</span>
                  <span className="min-w-0 flex-1 text-magic">{m.lines.join(" / ")}</span>
                  <span className="shrink-0 text-xs text-good">+{m.gain.toFixed(1)}</span>
                </li>
              ))}
            </ul>
            {(d.openAffixes.prefixes > 0 || d.openAffixes.suffixes > 0) && (
              <p className="mt-2 text-xs text-ink-400">
                {d.openAffixes.prefixes} prefix and {d.openAffixes.suffixes} suffix left open: nothing else measurably helps (life or resistances there are still fine).
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {d.tradeUrl && <a className="btn btn-primary" href={d.tradeUrl} target="_blank" rel="noreferrer"><Search size={13} /> Search trade <ExternalLink size={11} /></a>}
              <button className="btn" onClick={() => check.mutate(d.text)} disabled={check.isPending}><ClipboardCheck size={13} /> Check in my build</button>
              <button className="btn" onClick={() => { navigator.clipboard.writeText(d.text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>
                <Copy size={13} /> {copied ? "Copied" : "Copy item text"}
              </button>
            </div>
            <p className="mt-2 text-xs text-ink-400">{d.note}</p>
          </div>
          <pre className="max-h-80 overflow-auto rounded border border-ink-700 bg-ink-900 p-3 text-xs text-ink-200">{d.text}</pre>
        </div>
      )}
      {check.data && <div className="mt-4"><ItemVerdict check={check.data} /></div>}
    </Modal>
  );
}
