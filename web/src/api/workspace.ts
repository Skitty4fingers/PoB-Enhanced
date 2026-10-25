/**
 * Workspaces: each name in the URL (/w/<name>) has its own live build, history and saved builds on the server.
 * There is no login: anyone with the link shares the workspace. "/" opens the last one used in this browser.
 */

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const LAST_KEY = "pob2.workspace";
const RECENT_KEY = "pob2.workspaces";

export const normalizeWorkspace = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+/, "").slice(0, 32);
export const isWorkspaceName = (name: string) => NAME_RE.test(name);

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private window: nothing to remember */
  }
}

/** Workspaces opened in this browser, most recent first. */
export function recentWorkspaces(): string[] {
  try {
    const list = JSON.parse(read(RECENT_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((n): n is string => typeof n === "string" && isWorkspaceName(n)) : [];
  } catch {
    return [];
  }
}

function remember(name: string) {
  write(LAST_KEY, name);
  write(RECENT_KEY, JSON.stringify([name, ...recentWorkspaces().filter((n) => n !== name)].slice(0, 8)));
}

/** The workspace in the URL. At "/" it picks the last one used here (and puts it in the URL), or null to ask. */
function resolve(): string | null {
  const m = window.location.pathname.match(/^\/w\/([^/]+)\/?$/);
  if (m) {
    const name = normalizeWorkspace(decodeURIComponent(m[1]));
    if (isWorkspaceName(name)) {
      remember(name);
      return name;
    }
  }
  const last = read(LAST_KEY);
  if (last && isWorkspaceName(last)) {
    window.history.replaceState(null, "", `/w/${last}${window.location.hash}`);
    return last;
  }
  return null;
}

export const workspace: string | null = resolve();

export const workspaceUrl = (name: string) => `${window.location.origin}/w/${name}`;
export const mcpUrl = (name: string | null) => `${window.location.origin}${name ? `/w/${name}` : ""}/mcp`;

/** Open another workspace (a full page load, so nothing from this one is kept). */
export function openWorkspace(name: string) {
  window.location.assign(`/w/${name}${window.location.hash}`);
}

const ADJECTIVES = ["amber", "brisk", "crimson", "dusky", "ember", "frost", "gilded", "hollow", "iron", "jade", "lucky", "misty", "noble", "rusty", "silent", "swift", "vivid", "wild"];
const NOUNS = ["ash", "atlas", "blade", "cinder", "comet", "crow", "druid", "ember", "falcon", "golem", "grove", "lich", "monk", "rune", "sigil", "totem", "wolf", "wyrm"];
const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)];
export const randomWorkspace = () => `${pick(ADJECTIVES)}-${pick(NOUNS)}-${Math.floor(Math.random() * 90 + 10)}`;
