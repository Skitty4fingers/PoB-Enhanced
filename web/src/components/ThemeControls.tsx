import { useQuery } from "@tanstack/react-query";
import { Check, Palette } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { BuildInfo } from "../api/types";
import { setAccentFor, setThemeSettings, THEMES, useThemeSettings } from "../theme";

/** Header button: pick a theme and toggle the ascendancy backdrop. */
export function ThemePicker() {
  const settings = useThemeSettings();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div className="relative" ref={root}>
      <button className="btn btn-ghost" onClick={() => setOpen((o) => !o)} title="Theme" aria-label="Theme" aria-expanded={open}>
        <Palette size={16} />
      </button>
      {open && (
        <div className="panel absolute right-0 top-full z-40 mt-1 w-56 bg-ink-850 p-1 shadow-2xl" role="menu">
          {THEMES.map((t) => (
            <button key={t.id} role="menuitemradio" aria-checked={settings.theme === t.id}
              onClick={() => setThemeSettings({ theme: t.id })}
              className={`flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-sm hover:bg-ink-800 ${settings.theme === t.id ? "text-gold-soft" : "text-ink-200"}`}>
              <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-ink-600" style={{ background: t.swatch }} />
              <span className="flex-1">{t.label}</span>
              {settings.theme === t.id && <Check size={14} />}
            </button>
          ))}
          <label className="mt-1 flex cursor-pointer items-center gap-2.5 border-t border-ink-700 px-2 pb-1 pt-2 text-sm text-ink-200">
            <input type="checkbox" className="accent-gold" checked={settings.backdrop}
              onChange={(e) => setThemeSettings({ backdrop: e.target.checked })} />
            Ascendancy background art
          </label>
        </div>
      )}
    </div>
  );
}

interface ArtManifest {
  atlases: Record<string, { kind: string }>;
  names: Record<string, [string, number][]>;
}

/** Keeps the accent in step with the build and draws its ascendancy artwork, very faintly, behind the main area. */
export function AscendancyBackdrop({ info }: { info?: BuildInfo }) {
  const { backdrop } = useThemeSettings();
  useEffect(() => { setAccentFor(info?.ascendClassName, info?.className); }, [info?.ascendClassName, info?.className]);

  const version = info?.treeVersion;
  // Same artwork the tree tab uses; absent when scripts/build_tree_art.py has not been run.
  const manifest = useQuery({
    queryKey: ["tree-art-manifest", version],
    queryFn: async () => {
      const res = await fetch(`/tree-art/${version}/manifest.json`);
      return res.ok ? ((await res.json()) as ArtManifest) : null;
    },
    enabled: backdrop && !!version,
    staleTime: Infinity,
    retry: false,
  });
  const name = info?.ascendClassName ?? info?.className;
  const entry = manifest.data && name ? manifest.data.names[`Classes${name}`]?.[0] : undefined;
  if (!backdrop || !entry || manifest.data?.atlases[entry[0]]?.kind !== "files") return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-contain bg-center bg-no-repeat opacity-[0.11] md:left-72"
      style={{
        backgroundImage: `url(/tree-art/${version}/${entry[0]}/${entry[1]}.webp)`,
        backgroundOrigin: "content-box",
        padding: "6vh 4vw",
        filter: "saturate(0.75)",
        maskImage: "radial-gradient(circle closest-side, black 45%, transparent 100%)",
      }} />
  );
}
