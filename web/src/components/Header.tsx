import { useQuery } from "@tanstack/react-query";
import { CircleHelp, Download, FilePlus2, Radio, RefreshCw, Search, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useBuildMutation } from "../api/hooks";
import type { BuildInfo, SourceInfo, VersionInfo } from "../api/types";
import { ExportDialog, ImportDialog, NewBuildDialog } from "./BuildDialogs";
import { BuildsButton, HistoryControls } from "./HistoryControls";
import { LevelEditor } from "./LevelEditor";

type Dialog = "import" | "export" | "new" | null;

type Stats = Record<string, number>;

const fmt = (v?: number) => (v === undefined ? "?" : Math.round(v).toLocaleString());

/** Re-import the build from the link it came from (poe.ninja character page, pobb.in, ...), keeping config. */
function UpdateButton() {
  const source = useQuery({ queryKey: ["build-source"], queryFn: () => api.get<SourceInfo>("/build/source") });
  const [summary, setSummary] = useState<string | null>(null);
  const refresh = useBuildMutation(() => api.post<{ before: Stats; after: Stats }>("/build/refresh"));
  if (!source.data?.source) return null;
  const run = () =>
    refresh.mutate(undefined, {
      onSuccess: ({ before, after }) => {
        const dps = (o: Stats) => Math.max(o.TotalDPS ?? 0, o.CombinedDPS ?? 0);
        const changed = dps(before) !== dps(after) || before.Life !== after.Life || before.EnergyShield !== after.EnergyShield;
        setSummary(changed
          ? `DPS ${fmt(dps(before))} → ${fmt(dps(after))} · Life ${fmt(before.Life)} → ${fmt(after.Life)} · ES ${fmt(before.EnergyShield)} → ${fmt(after.EnergyShield)}`
          : "Up to date: no changes");
        setTimeout(() => setSummary(null), 10000);
      },
    });
  const when = source.data.loadedAt ? new Date(source.data.loadedAt * 1000).toLocaleTimeString() : "";
  return (
    <>
      {summary && <span className="text-xs text-good">{summary}</span>}
      {refresh.error ? <span className="text-xs text-bad">{String((refresh.error as Error).message)}</span> : null}
      <button className="btn" disabled={refresh.isPending} onClick={run}
        title={`Re-import from ${source.data.source}${when ? ` (last loaded ${when})` : ""}. Your Config tab settings are kept.`}>
        <RefreshCw size={14} className={refresh.isPending ? "animate-spin" : ""} /> {refresh.isPending ? "Updating…" : "Update"}
      </button>
    </>
  );
}

/** Server version and commit. Polled, so a redeploy while the page is open shows a reload prompt. */
function VersionBadge() {
  const { data } = useQuery({
    queryKey: ["version"],
    queryFn: () => api.get<VersionInfo>("/version"),
    refetchInterval: 60000,
  });
  const [first, setFirst] = useState<string | null>(null);
  const id = data ? `${data.version} ${data.commit ?? ""}` : null;
  useEffect(() => {
    if (id && first === null) setFirst(id);
  }, [id, first]);
  if (!data) return null;
  const built = data.built ? new Date(data.built).toLocaleString() : "not recorded";
  const title = [
    `PoB2 Enhanced v${data.version}`,
    `Commit ${data.commit ?? "unknown"}`,
    `Built ${built}`,
    data.upstream ? `Path of Building ${data.upstream}` : null,
  ].filter(Boolean).join("\n");
  if (first !== null && id !== first) {
    return (
      <button className="text-xs text-gold underline" onClick={() => window.location.reload()} title={title}>
        Updated to v{data.version}: reload
      </button>
    );
  }
  return (
    <span className="text-xs text-ink-400" title={title}>
      v{data.version}{data.commit && <span className="hidden sm:inline"> · {data.commit}</span>}
    </span>
  );
}

export function Header({ info, revision }: { info?: BuildInfo; revision?: number }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  // The command palette (Ctrl+K) opens these dialogs.
  useEffect(() => {
    const onCommand = (e: Event) => {
      const name = (e as CustomEvent<string>).detail;
      if (name === "import" || name === "new" || name === "export") setDialog(name);
    };
    window.addEventListener("pob:command", onCommand);
    return () => window.removeEventListener("pob:command", onCommand);
  }, []);
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-ink-700 bg-ink-900 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-full border-[5px] border-gold bg-ink-950" />
        <span className="font-semibold tracking-wide text-gold-soft">PoB2 Enhanced</span>
        <VersionBadge />
      </div>
      {info && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="text-ink-200">
            {info.ascendClassName ?? info.className}
            {info.ascendClassName && <span className="text-ink-400"> ({info.className})</span>}
          </span>
          <LevelEditor level={info.level} />
          <span className="text-ink-400">Passives <span className="text-ink-200">{info.pointsUsed}</span></span>
          <span className="text-ink-400">Ascendancy <span className="text-ink-200">{info.ascendancyPointsUsed}</span></span>
          {info.mainSkill && <span className="text-ink-400">Main <span className="text-gold-soft">{info.mainSkill}</span></span>}
        </div>
      )}
      <div className="ml-auto flex items-center gap-2">
        <span className="hidden items-center gap-1 text-xs text-ink-400 sm:flex" title="The UI refreshes when the build changes (including changes made by an AI agent over MCP)">
          <Radio size={12} className="text-good" /> live · rev {revision ?? "–"}
        </span>
        <button className="btn btn-ghost hidden text-xs text-ink-400 md:inline-flex" onClick={() => window.dispatchEvent(new Event("pob:palette"))} title="Search everything (Ctrl+K)">
          <Search size={14} /><span className="hidden xl:inline">Search</span> <kbd className="rounded border border-ink-600 px-1 text-[10px]">Ctrl K</kbd>
        </button>
        <HistoryControls />
        <UpdateButton />
        <BuildsButton />
        <button className="btn" onClick={() => setDialog("new")}><FilePlus2 size={14} /> New</button>
        <button className="btn" onClick={() => setDialog("import")}><Upload size={14} /> Import</button>
        <button className="btn btn-primary" onClick={() => setDialog("export")}><Download size={14} /> Export</button>
        <button className="btn btn-ghost" onClick={() => { window.location.hash = "help"; }} title="Help guide" aria-label="Help guide"><CircleHelp size={16} /></button>
      </div>
      {dialog === "import" && <ImportDialog onClose={close} />}
      {dialog === "export" && <ExportDialog onClose={close} />}
      {dialog === "new" && <NewBuildDialog onClose={close} />}
    </header>
  );
}
