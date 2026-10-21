import { useQuery } from "@tanstack/react-query";
import { FolderOpen, History, Redo2, Save, Trash2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useBuildMutation } from "../api/hooks";
import { ErrorText } from "./ErrorText";
import { Modal } from "./Modal";

type Entry = { id: number; label: string; name?: string; at: number };
type HistoryState = { undo: Entry[]; redo: Entry[] };
type SavedBuild = {
  id: string;
  name: string;
  className?: string;
  ascendClassName?: string;
  level?: number;
  mainSkill?: string;
  savedAt: number;
};

const ago = (t: number) => {
  const s = Math.max(0, Date.now() / 1000 - t);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t * 1000).toLocaleDateString();
};

const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
};

/** Undo / redo buttons (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y) and a history list. Covers changes made by AI agents too. */
export function HistoryControls() {
  const history = useQuery({ queryKey: ["history"], queryFn: () => api.get<HistoryState>("/history") });
  const undo = useBuildMutation(() => api.post<HistoryState>("/history/undo"));
  const redo = useBuildMutation(() => api.post<HistoryState>("/history/redo"));
  const [open, setOpen] = useState(false);
  const last = history.data?.undo[0];
  const next = history.data?.redo[0];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || typing(e)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey && last && !undo.isPending) {
        e.preventDefault();
        undo.mutate(undefined);
      } else if ((k === "y" || (k === "z" && e.shiftKey)) && next && !redo.isPending) {
        e.preventDefault();
        redo.mutate(undefined);
      }
    };
    const onCommand = (e: Event) => {
      const name = (e as CustomEvent<string>).detail;
      if (name === "undo" && last) undo.mutate(undefined);
      else if (name === "redo" && next) redo.mutate(undefined);
      else if (name === "history") setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pob:command", onCommand);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pob:command", onCommand); };
  }, [last, next, undo, redo]);
  return (
    <div className="flex items-center">
      <button className="btn btn-ghost" disabled={!last || undo.isPending} onClick={() => undo.mutate(undefined)}
        title={last ? `Undo: ${last.label} (Ctrl+Z)` : "Nothing to undo"} aria-label="Undo"><Undo2 size={16} /></button>
      <button className="btn btn-ghost" disabled={!next || redo.isPending} onClick={() => redo.mutate(undefined)}
        title={next ? `Redo: ${next.label} (Ctrl+Y)` : "Nothing to redo"} aria-label="Redo"><Redo2 size={16} /></button>
      <button className="btn btn-ghost" onClick={() => setOpen(true)} title="History" aria-label="History"><History size={16} /></button>
      {open && <HistoryDialog history={history.data} onClose={() => setOpen(false)} />}
    </div>
  );
}

function HistoryDialog({ history, onClose }: { history?: HistoryState; onClose: () => void }) {
  const restore = useBuildMutation((id: number) => api.post(`/history/${id}/restore`));
  const checkpoint = useBuildMutation((label: string) => api.post("/history/checkpoint", { label }));
  const [label, setLabel] = useState("");
  return (
    <Modal title="History" onClose={onClose}>
      <p className="text-sm text-ink-400">Every change to the build, including ones an AI agent makes. Go back to any point; that is undoable too.</p>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); checkpoint.mutate(label || "Checkpoint", { onSuccess: () => setLabel("") }); }}>
        <input className="input flex-1" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Checkpoint name, e.g. before respec" />
        <button className="btn" disabled={checkpoint.isPending}>Add checkpoint</button>
      </form>
      <ErrorText error={restore.error ?? checkpoint.error} />
      <ul className="mt-3 max-h-[50vh] space-y-1 overflow-y-auto">
        {(history?.undo ?? []).map((e, i) => (
          <li key={e.id} className="flex items-center justify-between gap-3 rounded border border-ink-700 px-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="truncate text-ink-200">{i === 0 ? "Last change: " : ""}{e.label}</div>
              <div className="text-xs text-ink-400">{ago(e.at)}</div>
            </div>
            <button className="btn shrink-0" disabled={restore.isPending} onClick={() => restore.mutate(e.id, { onSuccess: onClose })}
              title="Go back to the build as it was before this change">Go back here</button>
          </li>
        ))}
        {!history?.undo.length && <li className="text-sm text-ink-400">No changes yet.</li>}
      </ul>
    </Modal>
  );
}

/** Saved builds library (kept in the server's data folder). */
export function BuildsButton() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onCommand = (e: Event) => { if ((e as CustomEvent<string>).detail === "builds") setOpen(true); };
    window.addEventListener("pob:command", onCommand);
    return () => window.removeEventListener("pob:command", onCommand);
  }, []);
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)} title="Saved builds"><FolderOpen size={14} /> Builds</button>
      {open && <BuildsDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function BuildsDialog({ onClose }: { onClose: () => void }) {
  const builds = useQuery({ queryKey: ["saved-builds"], queryFn: () => api.get<SavedBuild[]>("/builds") });
  const save = useBuildMutation((name: string) => api.post<SavedBuild>("/builds", { name: name || null }));
  const open = useBuildMutation((id: string) => api.post(`/builds/${encodeURIComponent(id)}/open`));
  const remove = useBuildMutation((id: string) => api.del(`/builds/${encodeURIComponent(id)}`));
  const [name, setName] = useState("");
  return (
    <Modal title="Saved builds" onClose={onClose} wide>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); save.mutate(name, { onSuccess: () => setName("") }); }}>
        <input className="input flex-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (default: the build's name; the same name overwrites)" />
        <button className="btn btn-primary" disabled={save.isPending}><Save size={14} /> Save current build</button>
      </form>
      <ErrorText error={builds.error ?? save.error ?? open.error ?? remove.error} />
      <ul className="mt-3 max-h-[55vh] space-y-1 overflow-y-auto">
        {(builds.data ?? []).map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-3 rounded border border-ink-700 px-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="truncate text-ink-200">{b.name}</div>
              <div className="truncate text-xs text-ink-400">
                {[b.ascendClassName ?? b.className, b.level ? `level ${b.level}` : null, b.mainSkill].filter(Boolean).join(" · ")} · saved {ago(b.savedAt)}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <button className="btn" disabled={open.isPending} onClick={() => open.mutate(b.id, { onSuccess: onClose })}>Open</button>
              <button className="btn btn-ghost" disabled={remove.isPending} aria-label={`Delete ${b.name}`} title="Delete"
                onClick={() => { if (confirm(`Delete "${b.name}"? This cannot be undone.`)) remove.mutate(b.id); }}>
                <Trash2 size={14} />
              </button>
            </div>
          </li>
        ))}
        {builds.data && !builds.data.length && <li className="text-sm text-ink-400">No saved builds yet. The current build is kept automatically across restarts; save copies here to switch between builds.</li>}
      </ul>
    </Modal>
  );
}
