import { AlertTriangle, Check, Cloud, Copy, Laptop, Server } from "lucide-react";
import { useState, type ReactNode } from "react";

function CopyBlock({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink-700 px-3 py-2">
        <span className="text-sm text-ink-200">{title}</span>
        <button className="btn btn-ghost text-xs" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs text-ink-200"><code>{text}</code></pre>
    </div>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return <ol className="list-decimal space-y-1 pl-5 text-ink-200">{items.map((s, i) => <li key={i}>{s}</li>)}</ol>;
}

const K = ({ children }: { children: ReactNode }) => <code className="rounded border border-ink-600 bg-ink-800 px-1 text-xs text-ink-200">{children}</code>;

type Client = { id: string; name: string; group: "local" | "selfhosted" | "cloud"; body: (url: string, publicUrl: string) => ReactNode };

const isLocal = (url: string) => /\/\/(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);

const CLIENTS: Client[] = [
  {
    id: "claude-code", name: "Claude Code", group: "local",
    body: (url) => <CopyBlock title="Terminal" text={`claude mcp add --transport http pob2 ${url}`} />,
  },
  {
    id: "claude-desktop", name: "Claude Desktop", group: "local",
    body: (url) => (
      <>
        <p className="text-ink-400">Claude Desktop's config file starts local programs, so bridge to this server with <K>mcp-remote</K> (needs Node.js). Settings → Developer → Edit Config, add this, then restart Claude.</p>
        <CopyBlock title="claude_desktop_config.json" text={JSON.stringify({ mcpServers: { pob2: { command: "npx", args: ["-y", "mcp-remote", url, ...(isLocal(url) ? [] : ["--allow-http"])] } } }, null, 2)} />
      </>
    ),
  },
  {
    id: "codex", name: "ChatGPT: Codex CLI", group: "local",
    body: (url) => (
      <>
        <p className="text-ink-400">Codex is OpenAI's agent for your terminal and IDE, signed in with your ChatGPT account. It runs on your computer, so it reaches this server directly.</p>
        <CopyBlock title="Terminal" text={`codex mcp add pob2 --url ${url}`} />
        <CopyBlock title="or ~/.codex/config.toml" text={`[mcp_servers.pob2]\nurl = "${url}"`} />
      </>
    ),
  },
  {
    id: "gemini", name: "Gemini: Antigravity / Gemini CLI", group: "local",
    body: (url) => (
      <>
        <p className="text-ink-400">Google moved personal Google AI accounts from Gemini CLI to Antigravity in June 2026. Antigravity reads <K>~/.gemini/config/mcp_config.json</K> (or type <K>/mcp</K> in the CLI); remote servers use <K>serverUrl</K>.</p>
        <CopyBlock title="Antigravity: ~/.gemini/config/mcp_config.json" text={JSON.stringify({ mcpServers: { pob2: { serverUrl: url } } }, null, 2)} />
        <p className="text-ink-400">Gemini CLI (API key or Code Assist for teams):</p>
        <CopyBlock title="Terminal" text={`gemini mcp add --transport http --scope user pob2 ${url}`} />
        <CopyBlock title="or ~/.gemini/settings.json" text={JSON.stringify({ mcpServers: { pob2: { httpUrl: url } } }, null, 2)} />
      </>
    ),
  },
  {
    id: "other", name: "Other MCP clients", group: "local",
    body: (url) => (
      <>
        <p className="text-ink-400">Cursor, VS Code, Cline, Continue, Zed and most others take a Streamable HTTP server URL. The common JSON shape:</p>
        <CopyBlock title="mcp.json / settings" text={JSON.stringify({ mcpServers: { pob2: { url } } }, null, 2)} />
        <CopyBlock title="Standalone stdio server (no web UI; shares no build with this page)" text={JSON.stringify({ mcpServers: { pob2: { command: "docker", args: ["run", "--rm", "-i", "ghcr.io/skitty4fingers/pob-enhanced:latest", "pob2-mcp"] } } }, null, 2)} />
      </>
    ),
  },
  {
    id: "lmstudio", name: "LM Studio", group: "selfhosted",
    body: (url) => (
      <>
        <p className="text-ink-400">LM Studio 0.3.17 or newer, with a model that supports tool use (Qwen 3, Llama 3.1+, Mistral Small...). Right sidebar → Program → Install → Edit mcp.json:</p>
        <CopyBlock title="mcp.json" text={JSON.stringify({ mcpServers: { pob2: { url } } }, null, 2)} />
      </>
    ),
  },
  {
    id: "openwebui", name: "Open WebUI (Ollama)", group: "selfhosted",
    body: (url) => (
      <>
        <Steps items={[
          <>Open WebUI 0.6.31 or newer, as an admin: <b>Admin Settings → External Tools</b> (Integrations in some versions) → <b>+</b>.</>,
          <>Type <b>MCP (Streamable HTTP)</b> (not OpenAPI), authentication <b>None</b>, URL below.</>,
          <>In a chat, enable the <b>pob2</b> tools from the tools menu. Use a model with tool calling (for example Qwen 3 or Llama 3.1 through Ollama).</>,
        ]} />
        <CopyBlock title="Server URL" text={url.replace(/\/\/(localhost|127\.0\.0\.1)/, "//host.docker.internal")} />
        <p className="text-ink-400">Inside Docker, <K>localhost</K> is the Open WebUI container itself, hence <K>host.docker.internal</K> (on Linux add <K>--add-host=host.docker.internal:host-gateway</K>). Add <K>host.docker.internal</K> to <K>POB2_ALLOWED_HOSTS</K> on this server.</p>
      </>
    ),
  },
  {
    id: "librechat", name: "LibreChat", group: "selfhosted",
    body: (url) => (
      <>
        <p className="text-ink-400">Add to <K>librechat.yaml</K> and restart. As with Open WebUI, a containerised LibreChat reaches this server through <K>host.docker.internal</K>, which must be in <K>POB2_ALLOWED_HOSTS</K>.</p>
        <CopyBlock title="librechat.yaml" text={`mcpServers:\n  pob2:\n    type: streamable-http\n    url: ${url.replace(/\/\/(localhost|127\.0\.0\.1)/, "//host.docker.internal")}`} />
      </>
    ),
  },
  {
    id: "chatgpt", name: "ChatGPT (web and app)", group: "cloud",
    body: (_url, pub) => (
      <Steps items={[
        <>Give this server a public HTTPS address (see <b>Public URL</b> below).</>,
        <>In ChatGPT: <b>Settings → Apps &amp; Connectors → Advanced settings</b>, turn on <b>Developer mode</b>. On Business, Enterprise and Edu plans an admin may have to allow it; which plans can use custom connectors varies, so check OpenAI's help pages.</>,
        <><b>Settings → Connectors → Create</b>: name <K>PoB-Enhanced</K>, URL <K>{pub}</K>, authentication <b>No authentication</b>.</>,
        <>In a chat, pick the connector from the <b>+</b> menu (Developer mode) and ask away.</>,
      ]} />
    ),
  },
  {
    id: "grok", name: "Grok", group: "cloud",
    body: (_url, pub) => (
      <>
        <Steps items={[
          <>Give this server a public HTTPS address (see <b>Public URL</b>). Grok rejects localhost and private addresses.</>,
          <>Go to <K>grok.com/connectors</K> → <b>New Connector</b> → <b>Custom</b>, enter <K>{pub}</K> (paid Grok plans).</>,
          <>Grok lists the pob2 tools; enable the connector in a chat.</>,
        ]} />
        <p className="text-ink-400">Through the xAI API, pass it as a remote MCP tool:</p>
        <CopyBlock title="tools (xAI Responses API)" text={JSON.stringify([{ type: "mcp", server_label: "pob2", server_url: pub }], null, 2)} />
      </>
    ),
  },
  {
    id: "gemini-app", name: "Gemini app", group: "cloud",
    body: (_url, pub) => (
      <Steps items={[
        <>Custom MCP servers in the consumer Gemini app depend on your plan and region (rolled out with Gemini Spark on Google AI Ultra in 2026). Look for <b>Connected Apps → Add custom</b>; if it isn't there, use Antigravity (above).</>,
        <>It needs a public HTTPS address (see <b>Public URL</b>): <K>{pub}</K>.</>,
      ]} />
    ),
  },
  {
    id: "muse", name: "Meta Muse", group: "cloud",
    body: (_url, pub) => (
      <Steps items={[
        <>Muse has no MCP connector menu. It can still use this server: give it a public HTTPS address (see <b>Public URL</b>).</>,
        <>Ask Muse to connect to the MCP server at <K>{pub}</K> (Streamable HTTP) and list its tools; it writes the client in its own workspace and can save it as a skill.</>,
        <>Or add a <b>Custom Connector</b> for the REST API: its OpenAPI description is at <K>{pub.replace(/\/mcp$/, "/openapi.json")}</K>.</>,
      ]} />
    ),
  },
  {
    id: "claude-web", name: "Claude.ai (web and mobile)", group: "cloud",
    body: (_url, pub) => (
      <Steps items={[
        <>Give this server a public HTTPS address (see <b>Public URL</b>).</>,
        <>Claude.ai → <b>Settings → Connectors → Add custom connector</b>, URL <K>{pub}</K>.</>,
      ]} />
    ),
  },
];

const GROUPS: { id: Client["group"]; label: string; icon: ReactNode; note: string }[] = [
  { id: "local", label: "On your computer", icon: <Laptop size={14} />, note: "These run where you are, so they reach this server directly (same PC or your network)." },
  { id: "selfhosted", label: "Self-hosted models", icon: <Server size={14} />, note: "Local LLMs through LM Studio, Ollama + Open WebUI or LibreChat. Pick a model that supports tool calling." },
  { id: "cloud", label: "Cloud chat apps", icon: <Cloud size={14} />, note: "These run on the provider's servers, so they can only reach a public HTTPS address." },
];

export function AiTab() {
  const url = `${window.location.origin}/mcp`;
  const [id, setId] = useState("claude-code");
  const [publicUrl, setPublicUrl] = useState("");
  const pub = publicUrl.trim() ? `${publicUrl.trim().replace(/\/+$/, "").replace(/\/mcp$/, "")}/mcp` : "https://<your-public-address>/mcp";
  const client = CLIENTS.find((c) => c.id === id) ?? CLIENTS[0];
  const host = window.location.hostname;
  const port = window.location.port || (window.location.protocol === "https:" ? "443" : "80");
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 text-sm leading-6">
      <section>
        <h2 className="text-lg font-semibold text-gold-soft">Connect an AI agent</h2>
        <p className="text-ink-400">
          This server is an MCP endpoint at <K>{url}</K>. Agents connected to it read and edit the same live build you see
          here, this page refreshes as they work, and anything they change can be undone. Pick your assistant:
        </p>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        {GROUPS.map((g) => (
          <div key={g.id} className="panel p-3">
            <div className="label mb-1 flex items-center gap-1.5">{g.icon} {g.label}</div>
            <p className="mb-2 text-xs text-ink-400">{g.note}</p>
            <div className="flex flex-wrap gap-1">
              {CLIENTS.filter((c) => c.group === g.id).map((c) => (
                <button key={c.id} onClick={() => setId(c.id)}
                  className={`rounded border px-2 py-1 text-xs ${c.id === id ? "border-gold bg-gold/10 text-gold-soft" : "border-ink-600 text-ink-200 hover:border-gold"}`}>
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <section className="panel space-y-3 p-4">
        <h3 className="font-semibold text-ink-200">{client.name}</h3>
        {client.body(url, pub)}
        {client.group !== "cloud" && host !== "localhost" && host !== "127.0.0.1" && (
          <p className="text-xs text-ink-400">Using it from another machine? <K>{host}</K> must be in <K>POB2_ALLOWED_HOSTS</K> on this server (it is, if this page loads through that name and agents already connect).</p>
        )}
      </section>

      <section className="panel space-y-3 p-4">
        <h3 className="flex items-center gap-2 font-semibold text-ink-200"><Cloud size={15} /> Public URL (for cloud chat apps)</h3>
        <p className="text-ink-400">ChatGPT, Grok, the Gemini app, Muse and Claude.ai connect from their own servers, so this server needs a public HTTPS address. A tunnel is the quickest way:</p>
        <CopyBlock title="Cloudflare quick tunnel (no account needed)" text={`cloudflared tunnel --url http://localhost:${port}`} />
        <CopyBlock title="or ngrok" text={`ngrok http ${port}`} />
        <p className="text-xs text-ink-400">Run it on the machine that hosts this server (on a NAS, a tunnel container such as <K>cloudflare/cloudflared</K> pointed at <K>http://{host}:{port}</K> does the same).</p>
        <Steps items={[
          <>Copy the https address it prints (for example <K>https://word-word.trycloudflare.com</K>) and paste it here: <input className="input ml-1 inline-block w-72 align-middle" value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} placeholder="https://…" aria-label="Public address" /></>,
          <>Add that hostname (without https://) to <K>POB2_ALLOWED_HOSTS</K> and restart the container, or <K>/mcp</K> rejects it.</>,
          <>Use <K>{pub}</K> in the assistant's connector settings (the instructions above update with it).</>,
        ]} />
        <p className="flex gap-2 rounded border border-rare/40 bg-rare/10 p-2 text-xs text-ink-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-rare" />
          PoB-Enhanced has no login. While the tunnel runs, anyone who learns the address can view and change the loaded build (Undo brings it back, and nothing else on your machine is exposed). Keep the address private and stop the tunnel when you are done.
        </p>
      </section>

      <section>
        <h3 className="label mb-2">Things to ask</h3>
        <ul className="list-disc space-y-1 pl-5 text-ink-200">
          <li>Run a build check and tell me what to fix first.</li>
          <li>Check this item before I buy it: &lt;paste item text&gt;</li>
          <li>Design the best rare for my gloves and give me the trade link.</li>
          <li>Compare my build with this ladder character and list the three biggest differences: &lt;poe.ninja link&gt;</li>
          <li>Which runes and soul cores should I swap? Checkpoint first so I can undo.</li>
        </ul>
      </section>
      <section>
        <h3 className="label mb-2">REST API</h3>
        <p className="text-ink-400">
          Every UI action is also a plain JSON endpoint. See <a className="text-gold hover:underline" href="/docs" target="_blank" rel="noreferrer">/docs</a> for the OpenAPI reference.
        </p>
      </section>
    </div>
  );
}
