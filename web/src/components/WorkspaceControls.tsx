import { Check, Copy, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  isWorkspaceName, mcpUrl, normalizeWorkspace, openWorkspace, randomWorkspace, recentWorkspaces, workspace, workspaceUrl,
} from "../api/workspace";
import { Modal } from "./Modal";

/** Name field + recent list; opens the chosen workspace. */
function WorkspaceForm({ suggestion, submit }: { suggestion: string; submit: string }) {
  const [name, setName] = useState(suggestion);
  const clean = normalizeWorkspace(name);
  const ok = isWorkspaceName(clean);
  const recent = recentWorkspaces().filter((n) => n !== workspace);
  const go = (e: FormEvent) => {
    e.preventDefault();
    if (ok) openWorkspace(clean);
  };
  return (
    <form onSubmit={go} className="space-y-3">
      <label className="block">
        <span className="label">Workspace name</span>
        <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} autoFocus
          onFocus={(e) => e.target.select()} placeholder="e.g. your name or character" />
      </label>
      <p className="text-xs text-ink-400">
        {ok ? <>Opens <span className="text-ink-200">{workspaceUrl(clean)}</span>. </> : "Letters, digits and dashes, up to 32. "}
        Anyone with the link can see and edit this workspace's build.
      </p>
      {recent.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="label mr-1">Recent</span>
          {recent.map((n) => (
            <button key={n} type="button" className="rounded border border-ink-600 px-2 py-0.5 text-xs text-ink-200 hover:border-gold" onClick={() => openWorkspace(n)}>{n}</button>
          ))}
        </div>
      )}
      <button className="btn btn-primary" disabled={!ok}>{submit}</button>
    </form>
  );
}

/** Shown at "/" when this browser has never opened a workspace. */
export function WorkspaceGate() {
  return (
    <div className="flex h-full items-start justify-center bg-ink-950 p-4 pt-[15vh]">
      <div className="panel w-full max-w-md p-5">
        <div className="mb-3 flex items-center gap-2">
          <div className="h-6 w-6 rounded-full border-[5px] border-gold bg-ink-950" />
          <span className="font-semibold tracking-wide text-gold-soft">PoB2 Enhanced</span>
        </div>
        <p className="mb-4 text-sm text-ink-400">
          Each workspace has its own live build, undo history and saved builds. Pick a name to start one, or enter
          an existing name to open it. There's no login: share the link with anyone you want to plan with.
        </p>
        <WorkspaceForm suggestion={randomWorkspace()} submit="Open workspace" />
      </div>
    </div>
  );
}

function CopyField({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* no clipboard over plain http: the field is selectable */
    }
  };
  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="mt-1 flex gap-1">
        <input readOnly className="input font-mono text-xs" value={text} onFocus={(e) => e.target.select()} />
        <button type="button" className="btn btn-ghost" onClick={copy} aria-label={`Copy ${label}`}>
          {copied ? <Check size={14} className="text-good" /> : <Copy size={14} />}
        </button>
      </div>
    </label>
  );
}

/** Header chip: which workspace this is, its links, and switching to another. */
export function WorkspaceChip() {
  const [open, setOpen] = useState(false);
  if (!workspace) return null;
  return (
    <>
      <button className="btn btn-ghost text-xs text-ink-200" onClick={() => setOpen(true)} title="Workspace: share the link, connect an agent, or switch">
        <Users size={14} className="text-gold" /> {workspace}
      </button>
      {open && (
        <Modal title={`Workspace: ${workspace}`} onClose={() => setOpen(false)}>
          <div className="space-y-4">
            <CopyField label="Link (anyone with it shares this build)" text={workspaceUrl(workspace)} />
            <CopyField label="MCP endpoint for AI agents" text={mcpUrl(workspace)} />
            <div className="border-t border-ink-700 pt-4">
              <WorkspaceForm suggestion="" submit="Switch" />
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
