import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Command, Gem, Network, Palette as PaletteIcon, Search, Settings2, Shield, Sigma, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, qs } from "../api/client";
import { useConfig, useItems, useOverview, useSkills } from "../api/hooks";
import type { TreeNodeInfo } from "../api/types";
import { setThemeSettings, THEMES, useThemeSettings } from "../theme";

/** A node for the tree tab to centre on once it is showing (set by the palette, read by TreeTab). */
export const pendingFocus: { id: number | null } = { id: null };

/** Ask a part of the app to do something (Header and HistoryControls listen). */
export const runCommand = (name: string) => window.dispatchEvent(new CustomEvent("pob:command", { detail: name }));

type Result = { group: string; icon: ReactNode; label: string; hint?: string; run: () => void };

const go = (hash: string) => { window.location.hash = hash; };

const TABS: [string, string][] = [
  ["Tree", "tree"], ["Skills", "skills"], ["Items", "items"], ["Config", "config"], ["Upgrades: Build check", "upgrades/health"],
  ["Upgrades: Check item", "upgrades/check"], ["Upgrades: Gear", "upgrades/gear"], ["Upgrades: Jewels", "upgrades/jewels"],
  ["Upgrades: Sockets", "upgrades/sockets"], ["Upgrades: Gems", "upgrades/gems"], ["Upgrades: Shop", "upgrades/shop"],
  ["Guide", "reference"], ["Compare", "compare"], ["AI / MCP", "ai"], ["Help", "help"],
];

const COMMANDS: [string, string, string?][] = [
  ["Import a build", "import"], ["New build", "new"], ["Export build", "export"], ["Saved builds", "builds"],
  ["Undo", "undo", "Ctrl+Z"], ["Redo", "redo", "Ctrl+Y"], ["History", "history"],
];

function useDebounced(value: string, ms = 200) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** Ctrl+K (Cmd+K): one search for tabs, commands, passives, equipped items, skills, config options and stats. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pob:palette", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pob:palette", onOpen); };
  }, []);
  return open ? <Palette onClose={() => setOpen(false)} /> : null;
}

function Palette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();
  const debounced = useDebounced(q);
  const items = useItems();
  const skills = useSkills();
  const config = useConfig(true);
  const overview = useOverview();
  const theme = useThemeSettings();
  const nodes = useQuery({
    queryKey: ["palette-nodes", debounced],
    queryFn: () => api.get<TreeNodeInfo[]>(`/tree/search${qs({ q: debounced, limit: 8 })}`),
    enabled: debounced.length >= 2,
  });
  useEffect(() => { input.current?.focus(); }, []);

  const results = useMemo<Result[]>(() => {
    const match = (s?: string) => !q || (s ?? "").toLowerCase().includes(q);
    const out: Result[] = [];
    for (const [label, cmd, hint] of COMMANDS) {
      if (match(label)) out.push({ group: "Commands", icon: <Command size={14} />, label, hint, run: () => runCommand(cmd) });
    }
    for (const [label, hash] of TABS) {
      if (match(label)) out.push({ group: "Go to", icon: <ArrowRight size={14} />, label, run: () => go(hash) });
    }
    if (!q) return out;
    for (const t of THEMES) {
      if (match(`Theme: ${t.label}`)) {
        out.push({ group: "Theme", icon: <PaletteIcon size={14} />, label: `Theme: ${t.label}`, hint: theme.theme === t.id ? "current" : undefined, run: () => setThemeSettings({ theme: t.id }) });
      }
    }
    const backdropLabel = `${theme.backdrop ? "Hide" : "Show"} ascendancy background art`;
    if (match(backdropLabel) || match("theme background")) {
      out.push({ group: "Theme", icon: <PaletteIcon size={14} />, label: backdropLabel, run: () => setThemeSettings({ backdrop: !theme.backdrop }) });
    }
    for (const n of nodes.data ?? []) {
      out.push({
        group: "Passives", icon: <Network size={14} />, label: n.name,
        hint: `${n.allocated ? "allocated · " : ""}${n.type}${n.stats?.[0] ? ` · ${n.stats[0]}` : ""}`,
        run: () => { pendingFocus.id = n.id; go("tree"); window.dispatchEvent(new Event("pob:focus-node")); },
      });
    }
    for (const row of items.data ?? []) {
      const it = row.item;
      if (it && (match(it.name) || match(row.slot) || it.mods?.some((m) => match(m.text)))) {
        out.push({ group: "Items", icon: <Shield size={14} />, label: it.name, hint: row.slot, run: () => go("items") });
      }
    }
    for (const g of skills.data ?? []) {
      for (const gem of g.gems) {
        if (match(gem.name)) {
          out.push({ group: "Skills", icon: <Gem size={14} />, label: gem.name, hint: `${g.displayLabel ?? `group ${g.index}`}${gem.support ? " · support" : ""}`, run: () => go("skills") });
        }
      }
    }
    for (const c of config.data ?? []) {
      if (match(c.label) || match(c.var)) {
        out.push({ group: "Config", icon: <Settings2 size={14} />, label: c.label ?? c.var, hint: c.value !== undefined && c.value !== null ? `now ${String(c.value)}` : undefined, run: () => go("config") });
      }
    }
    for (const s of overview.data?.stats?.player ?? []) {
      if (match(s.label)) {
        out.push({ group: "Stats", icon: <Sigma size={14} />, label: s.label, hint: s.formatted, run: () => go("upgrades/health") });
      }
    }
    return out.slice(0, 60);
  }, [q, nodes.data, items.data, skills.data, config.data, overview.data, theme]);

  useEffect(() => { setIndex(0); }, [q]);
  const pick = (r?: Result) => { if (!r) return; onClose(); r.run(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(results[index]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };
  useEffect(() => {
    document.getElementById(`palette-${index}`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh]" onMouseDown={onClose}>
      <div className="panel w-full max-w-xl overflow-hidden shadow-2xl" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <div className="flex items-center gap-2 border-b border-ink-700 px-3">
          <Search size={16} className="text-ink-400" />
          <input ref={input} className="w-full bg-transparent py-3 text-sm text-ink-200 outline-none placeholder:text-ink-400" value={query}
            onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey}
            placeholder="Search tabs, commands, passives, items, skills, config, stats…" aria-label="Search" />
          <kbd className="rounded border border-ink-600 px-1.5 text-[11px] text-ink-400">Esc</kbd>
        </div>
        <ul className="max-h-[55vh] overflow-y-auto py-1" role="listbox">
          {results.map((r, i) => {
            const header = r.group !== lastGroup ? r.group : null;
            lastGroup = r.group;
            return (
              <li key={`${r.group}-${r.label}-${i}`}>
                {header && <div className="label px-3 pb-1 pt-2">{header}</div>}
                <button id={`palette-${i}`} role="option" aria-selected={i === index} onMouseEnter={() => setIndex(i)} onClick={() => pick(r)}
                  className={`flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm ${i === index ? "bg-gold/10 text-gold-soft" : "text-ink-200"}`}>
                  <span className="text-ink-400">{r.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{r.label}</span>
                  {r.hint && <span className="max-w-[45%] shrink-0 truncate text-xs text-ink-400">{r.hint}</span>}
                </button>
              </li>
            );
          })}
          {q.length >= 2 && nodes.isFetching && <li className="px-3 py-2 text-xs text-ink-400"><Zap size={12} className="mr-1 inline" />Searching passives…</li>}
          {!results.length && !nodes.isFetching && <li className="px-3 py-6 text-center text-sm text-ink-400">No matches</li>}
        </ul>
      </div>
    </div>
  );
}
