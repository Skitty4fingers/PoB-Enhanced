import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, MinusCircle, XCircle } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { api } from "../api/client";
import type { ItemCheck, ItemExplain, ItemExplainLine } from "../api/types";
import { ErrorText } from "./ErrorText";
import { fmtNum } from "./format";

const STYLE = {
  upgrade: { icon: <CheckCircle2 size={18} />, color: "text-good", border: "border-l-good", label: "Upgrade" },
  sidegrade: { icon: <MinusCircle size={18} />, color: "text-rare", border: "border-l-rare", label: "Sidegrade" },
  downgrade: { icon: <XCircle size={18} />, color: "text-bad", border: "border-l-bad", label: "Downgrade" },
};

const DEFENCE_LABELS: Record<string, string> = {
  TotalEHP: "Effective HP", Life: "Life", EnergyShield: "Energy Shield", Mana: "Mana",
  FireResist: "Fire res", ColdResist: "Cold res", LightningResist: "Lightning res", ChaosResist: "Chaos res",
  PhysicalMaximumHitTaken: "Phys max hit", LifeRegenRecovery: "Life regen",
};

const signed = (v: number, digits = 1) => `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;

function Lines({ rows, empty }: { rows: ItemExplainLine[]; empty: string }) {
  if (!rows.length) return <p className="text-xs text-ink-400">{empty}</p>;
  return (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={r.kind + r.text} className="flex items-baseline gap-2">
          <span className={`min-w-0 flex-1 ${r.kind === "implicit" || r.kind === "enchant" || r.kind === "rune" ? "italic text-ink-400" : "text-magic"}`}>{r.text}</span>
          <span className="shrink-0 tabular-nums text-ink-200">{r.percent.toFixed(1)}%</span>
        </li>
      ))}
    </ul>
  );
}

/** Why a skill's damage changes: the lines carrying it, what the new item brings back, and the stats that moved. */
function ExplainPanel({ check, group }: { check: ItemCheck; group: number }) {
  const explain = useMutation({
    mutationFn: () => api.post<ItemExplain>("/items/explain", { text: check.itemText, slot: check.slot, group }),
  });
  useEffect(() => { explain.mutate(); }, [check.itemText, check.slot, group]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = explain.data;
  const drop = d && d.percent !== undefined && d.percent < 0;
  return (
    <div className="space-y-3 rounded border border-ink-700 bg-ink-900 p-3 text-[13px]">
      <ErrorText error={explain.error} />
      {explain.isPending && <p className="text-ink-400">Measuring each mod line…</p>}
      {d && (
        <>
          <p className="text-ink-200">
            {d.skill}: {fmtNum(d.before)} → {fmtNum(d.after)}{d.percent !== undefined && d.percent !== null ? ` (${signed(d.percent)})` : ""}
            {d.totemsBefore !== undefined && d.totemsAfter !== undefined && d.totemsBefore !== d.totemsAfter ? `, totems ${d.totemsBefore} → ${d.totemsAfter}` : ""}
          </p>
          <div>
            <div className="label mb-1">{drop ? "What you lose from" : "Damage carried by"} {d.replaces ?? "the current item"}</div>
            <Lines rows={d.lost} empty="None of its lines changes this skill’s damage." />
          </div>
          <div>
            <div className="label mb-1">What {d.item} brings to this skill</div>
            <Lines rows={d.gained} empty="None of its lines changes this skill’s damage." />
          </div>
          {d.moved.length > 0 && (
            <div>
              <div className="label mb-1">What changed in the skill</div>
              <table className="w-full">
                <tbody>
                  {d.moved.map((m) => (
                    <tr key={m.key}>
                      <td className="pr-2 text-ink-200">{m.label}</td>
                      <td className="pr-2 text-right tabular-nums text-ink-400">{fmtNum(m.before)}{m.pct ? "%" : ""} → {fmtNum(m.after)}{m.pct ? "%" : ""}</td>
                      <td className={`w-16 text-right tabular-nums ${m.percent < 0 ? "text-bad" : "text-good"}`}>{signed(m.percent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-ink-400">
            Each line is measured alone: its percentage is how much of the skill’s damage disappears if just that line is removed. Damage multiplies, so shares overlap and don’t add up to the total.
          </p>
        </>
      )}
    </div>
  );
}

/** "Check before you buy" result: verdict, warnings (Spirit, totems, requirements, lost skills), every damage skill. */
export function ItemVerdict({ check }: { check: ItemCheck }) {
  const [open, setOpen] = useState<number | null>(null);
  const canExplain = !!check.itemText;
  const st = STYLE[check.verdict];
  const changedDefence = Object.entries(check.defence).filter(([, v]) => Math.round(v.before) !== Math.round(v.after));
  return (
    <div className={`rounded border border-ink-700 border-l-4 ${st.border} bg-ink-850 p-3 text-sm`}>
      <div className={`flex items-center gap-2 font-semibold ${st.color}`}>
        {st.icon} {st.label}
        <span className="font-normal text-ink-400">in {check.slot}{check.replaces ? `, replacing ${check.replaces}` : ""}</span>
      </div>
      {check.warnings.length > 0 && (
        <ul className="mt-2 space-y-1">
          {check.warnings.map((w) => (
            <li key={w} className="flex gap-1.5 text-bad"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {w}</li>
          ))}
        </ul>
      )}
      <table className="mt-2 w-full text-[13px]">
        <tbody>
          {check.skills.map((s) => (
            <Fragment key={s.group}>
            <tr className={`border-t border-ink-800 ${canExplain && !s.lost ? "cursor-pointer hover:bg-ink-800/40" : ""}`}
              onClick={canExplain && !s.lost ? () => setOpen(open === s.group ? null : s.group) : undefined}
              title={canExplain && !s.lost ? "Click to see why this skill's damage changes" : undefined}>
              <td className="py-1 pr-2">
                {canExplain && !s.lost && (open === s.group ? <ChevronDown size={12} className="mr-1 inline text-ink-400" /> : <ChevronRight size={12} className="mr-1 inline text-ink-400" />)}
                <span className={s.isMain ? "text-gold-soft" : "text-ink-200"}>{s.name}</span>
                {s.isMain && <span className="ml-1 text-xs text-ink-400">main</span>}
                {s.totemsBefore !== undefined && (
                  <span className={`ml-1 text-xs ${s.totemsAfter !== undefined && s.totemsAfter < s.totemsBefore ? "text-bad" : "text-ink-400"}`}>
                    {s.totemsBefore}{s.totemsAfter !== undefined && s.totemsAfter !== s.totemsBefore ? ` → ${s.totemsAfter}` : ""} totem{(s.totemsAfter ?? s.totemsBefore) === 1 ? "" : "s"}
                  </span>
                )}
              </td>
              <td className="py-1 pr-2 text-right tabular-nums text-ink-400">{fmtNum(s.before)} → {s.lost ? "lost" : fmtNum(s.after)}</td>
              <td className={`py-1 text-right tabular-nums ${s.lost || (s.percent ?? 0) < -0.5 ? "text-bad" : (s.percent ?? 0) > 0.5 ? "text-good" : "text-ink-400"}`}>
                {s.percent !== undefined && s.percent !== null ? `${s.percent > 0 ? "+" : ""}${s.percent.toFixed(1)}%` : ""}
              </td>
            </tr>
            {open === s.group && (
              <tr><td colSpan={3} className="pb-2"><ExplainPanel check={check} group={s.group} /></td></tr>
            )}
            </Fragment>
          ))}
          {changedDefence.map(([k, v]) => (
            <tr key={k} className="border-t border-ink-800">
              <td className="py-1 pr-2 text-ink-200">{DEFENCE_LABELS[k] ?? k}</td>
              <td className="py-1 pr-2 text-right tabular-nums text-ink-400">{fmtNum(v.before)} → {fmtNum(v.after)}</td>
              <td className={`py-1 text-right tabular-nums ${v.after >= v.before ? "text-good" : "text-bad"}`}>{v.after - v.before > 0 ? "+" : ""}{fmtNum(v.after - v.before)}</td>
            </tr>
          ))}
          <tr className="border-t border-ink-800">
            <td className="py-1 pr-2 text-ink-200">Spirit</td>
            <td className="py-1 pr-2 text-right tabular-nums text-ink-400">{fmtNum(check.budget.before.spirit)} → {fmtNum(check.budget.after.spirit)}</td>
            <td className={`py-1 text-right tabular-nums ${check.budget.after.spirit >= check.budget.before.spirit ? "text-ink-400" : "text-bad"}`}>
              {check.budget.after.spirit !== check.budget.before.spirit ? `${check.budget.after.spirit > check.budget.before.spirit ? "+" : ""}${fmtNum(check.budget.after.spirit - check.budget.before.spirit)}` : ""}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-xs text-ink-400">{check.caveat}</p>
    </div>
  );
}
