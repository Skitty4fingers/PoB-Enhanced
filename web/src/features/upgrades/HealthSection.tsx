import { AlertOctagon, AlertTriangle, ArrowRight, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";
import type { BuildCheck, Finding } from "../../api/types";
import { useBuildCheck } from "../../api/hooks";
import { ErrorText } from "../../components/ErrorText";

const STYLE: Record<Finding["severity"], { icon: ReactNode; text: string; border: string; label: string }> = {
  high: { icon: <AlertOctagon size={16} />, text: "text-bad", border: "border-l-bad", label: "Fix first" },
  medium: { icon: <AlertTriangle size={16} />, text: "text-rare", border: "border-l-rare", label: "Worth fixing" },
  low: { icon: <Info size={16} />, text: "text-ink-400", border: "border-l-ink-600", label: "Minor" },
};

const TAB_LABEL: Record<string, string> = { tree: "Tree", upgrades: "Upgrades", skills: "Skills", items: "Items", config: "Config" };

/** One line for the summary card: "All clear" or counts per severity, linking to the full list. */
export function healthSummary(check?: BuildCheck): { text: string; tone: string } | null {
  if (!check) return null;
  const { high, medium, low } = check.counts;
  if (!high && !medium && !low) return { text: "Build check: all clear", tone: "text-good" };
  const parts = [high && `${high} to fix`, medium && `${medium} worth fixing`, !high && !medium && low && `${low} minor`].filter(Boolean);
  return { text: `Build check: ${parts.join(" · ")}`, tone: high ? "text-bad" : medium ? "text-rare" : "text-ink-400" };
}

/** Build health check: what is wrong with the build, worst first, each with a fix and a link to the tab. */
export function HealthSection() {
  const check = useBuildCheck();
  if (check.error) return <ErrorText error={check.error} />;
  if (!check.data) return <p className="text-sm text-ink-400">Checking the build…</p>;
  const { findings } = check.data;
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-400">
        What is wrong with the build, worst first. Every number is PoB's for your current Config tab. It updates after every change.
      </p>
      {findings.length === 0 && (
        <div className="panel flex items-center gap-3 p-4 text-good">
          <CheckCircle2 size={20} /> Nothing to fix: resistances capped, points spent, slots filled, requirements met.
        </div>
      )}
      <ul className="space-y-2">
        {findings.map((f, i) => {
          const s = STYLE[f.severity];
          return (
            <li key={i} className={`panel flex items-start gap-3 border-l-4 p-3 ${s.border}`}>
              <span className={`mt-0.5 shrink-0 ${s.text}`}>{s.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm text-ink-200">{f.message}</span>
                  <span className={`text-[11px] uppercase tracking-wide ${s.text}`}>{s.label} · {f.area}</span>
                </div>
                <div className="mt-0.5 text-sm text-ink-400">{f.fix}</div>
              </div>
              {f.tab && (
                <button className="btn shrink-0" onClick={() => { window.location.hash = f.tab!; }}>
                  {TAB_LABEL[f.tab] ?? f.tab} <ArrowRight size={13} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
