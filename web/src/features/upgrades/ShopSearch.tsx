import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink, Search, Sparkles, Zap } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api, qs } from "../../api/client";
import type { BestInShop as BestInShopResult, ShopListing, ShopSearchResult, ShopSeller } from "../../api/types";
import { ErrorText } from "../../components/ErrorText";
import { Modal } from "../../components/Modal";

type Metric = "balanced" | "dps" | "ehp";

/** What to look for: a slot's weighted rare search, a rare designer query, or a named unique. */
export interface ShopTarget {
  title: string;
  slot?: string;
  query?: Record<string, unknown>;
  unique?: { name: string; baseName?: string };
  /** Opens the plain trade-site search (shown as a fallback inside the window). */
  tradeUrl?: string;
}

const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
const tone = (v: number) => (v > 0.05 ? "text-good" : v < -0.05 ? "text-bad" : "text-ink-400");

function age(iso?: string | null): string | null {
  if (!iso) return null;
  const mins = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.round(mins)} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 60 / 24)} d ago`;
}

const PRICE_TYPES: Record<string, string> = { "~b/o": "buyout", "~price": "asking price", "~fixed": "fixed", "~c/o": "current offer" };

function StatusDot({ status }: { status?: string | null }) {
  const [cls, label] =
    status === "online" ? ["bg-good", "online"] : status === "afk" ? ["bg-rare", "away (AFK)"] : ["bg-ink-500", "offline / not shown"];
  return <span className={`inline-block h-2 w-2 rounded-full ${cls}`} title={label} aria-label={label} />;
}

function Seller({ s }: { s: ShopSeller }) {
  const bits: ReactNode[] = [];
  const listed = age(s.listed);
  if (listed) bits.push(<span key="l">listed {listed}</span>);
  if (s.priceType) bits.push(<span key="t">{PRICE_TYPES[s.priceType] ?? s.priceType}</span>);
  if (s.stash) bits.push(<span key="s">tab “{s.stash}”{s.position ? ` (${s.position[0]}, ${s.position[1]})` : ""}</span>);
  if (s.language && s.language !== "en_US") bits.push(<span key="g">{s.language}</span>);
  return (
    <div className="mt-1 text-xs text-ink-400">
      <div className="flex flex-wrap items-center gap-x-2">
        <StatusDot status={s.status} />
        <span className="text-ink-200">{s.account ?? "unknown seller"}</span>
        {s.character && <span>as {s.character}</span>}
        {s.buyNow && <span className="inline-flex items-center gap-0.5 rounded bg-good/15 px-1.5 text-good" title="Instant buyout: no need to whisper the seller"><Zap size={10} /> buy now</span>}
      </div>
      {bits.length > 0 && <div className="flex flex-wrap gap-x-2">{bits.map((b, i) => <span key={i}>{i > 0 && "· "}{b}</span>)}</div>}
    </div>
  );
}

const VERDICT: Record<ShopListing["verdict"], string> = {
  upgrade: "bg-good/15 text-good",
  sidegrade: "bg-ink-700 text-ink-300",
  downgrade: "bg-bad/15 text-bad",
};

function GainLine({ l }: { l: ShopListing }) {
  return (
    <span className="inline-flex flex-wrap gap-x-2">
      <span className={tone(l.dpsPercent)}>{pct(l.dpsPercent)} DPS</span>
      <span className={tone(l.ehpPercent)}>{pct(l.ehpPercent)} EHP</span>
    </span>
  );
}

export function ListingCard({ l, showVerdict }: { l: ShopListing; showVerdict?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState(false);
  const whisper = l.seller.whisper;
  return (
    <div className="border-t border-ink-800 py-2 first:border-t-0">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-rare">{l.name}</span>
            {showVerdict && <span className={`rounded px-1.5 text-xs ${VERDICT[l.verdict]}`}>{l.verdict}</span>}
          </div>
          <div className="text-xs text-ink-400">{l.baseName} · {l.group ?? l.slot}{l.replaces ? ` · replaces ${l.replaces}` : ""}</div>
          <Seller s={l.seller} />
          {l.warnings.map((w) => (
            <div key={w} className="text-xs text-rare"><AlertTriangle size={11} className="mr-1 inline" />{w}</div>
          ))}
        </div>
        <div className="text-right text-sm tabular-nums">
          <div className="text-xs"><GainLine l={l} /></div>
          <div className="text-ink-200">{l.price ?? "no price"}</div>
          {l.gainPerDivine ? <div className="text-xs text-ink-400">{l.gainPerDivine.toFixed(1)}% per div</div> : null}
          <div className="mt-1 flex items-center justify-end gap-3 text-xs">
            {whisper && (
              <button className="text-gold hover:underline" title={whisper}
                onClick={() => { void navigator.clipboard?.writeText(whisper).then(() => setCopied(true)); }}>
                {copied ? "whisper copied" : "copy whisper"}
              </button>
            )}
            <button className="text-gold hover:underline" onClick={() => setText(!text)}>{text ? "hide item" : "item"}</button>
          </div>
        </div>
      </div>
      {text && <pre className="mt-2 max-h-56 overflow-auto rounded border border-ink-700 bg-ink-900 p-2 text-xs text-ink-200">{l.itemText}</pre>}
    </div>
  );
}

function BuyNowToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-ink-200" title="Only listings you can buy instantly, without whispering the seller">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <Zap size={13} className="text-good" /> Buy now only
    </label>
  );
}

function BudgetInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-sm text-ink-400">
      Budget
      <input className="input w-20" inputMode="decimal" placeholder="any" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))} />
      div
    </label>
  );
}

function ShopWindow({ target, metric, league, maxPrice, onClose }: {
  target: ShopTarget; metric: Metric; league?: string; maxPrice?: number; onClose: () => void;
}) {
  const [buyNow, setBuyNow] = useState(false);
  const [budget, setBudget] = useState(maxPrice ? String(maxPrice) : "");
  const [all, setAll] = useState(false);
  const run = useMutation({
    mutationFn: () =>
      api.post<ShopSearchResult>("/gear/shop", {
        slot: target.slot, query: target.query, unique: target.unique, metric, league,
        maxPrice: budget ? Number(budget) : undefined, buyNow,
      }),
  });
  // Search as soon as the window opens, and again whenever a filter changes.
  useEffect(() => { run.mutate(); }, [buyNow]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = run.data;
  const shown = d ? d.listings.filter((l) => all || l.verdict === "upgrade") : [];
  const hidden = d ? d.listings.length - shown.length : 0;
  const link = d?.tradeUrl ?? target.tradeUrl;
  return (
    <Modal title={`Trade: ${target.title}`} onClose={onClose} wide>
      <div className="flex flex-wrap items-center gap-3">
        <BuyNowToggle value={buyNow} onChange={setBuyNow} />
        <BudgetInput value={budget} onChange={setBudget} />
        <button className="btn" disabled={run.isPending} onClick={() => run.mutate()}><Search size={13} /> {run.isPending ? "Searching…" : "Search again"}</button>
        {link && <a className="btn ml-auto" href={link} target="_blank" rel="noreferrer" title="Opens pathofexile.com trade (sign in there to buy)">Open on trade site <ExternalLink size={11} /></a>}
      </div>
      <p className="mt-2 text-xs text-ink-400">
        Real listings right now, each measured in your build by PoB. Rare searches look for several of the stats that matter most to this build, sampled from cheap to dear.
      </p>
      <ErrorText error={run.error} />
      {run.error && target.tradeUrl && <p className="mt-2 text-xs text-ink-400">The trade site search is still available with “Open on trade site”.</p>}
      {run.isPending && <p className="mt-3 text-sm text-ink-400">Searching the trade site and measuring listings (up to 30 s)…</p>}
      {d && (
        <div className="mt-3">
          {shown.length === 0 && (
            <p className="text-sm text-ink-400">
              {d.listings.length === 0 ? `Nothing matching was listed${d.buyNow ? " with buy now" : ""}.` : `None of the ${d.listings.length} listings checked beat what you have.`}
            </p>
          )}
          {shown.map((l, i) => <ListingCard key={`${l.seller.account}${l.name}${i}`} l={l} showVerdict={all} />)}
          {(hidden > 0 || all) && (
            <button className="mt-2 text-xs text-gold hover:underline" onClick={() => setAll(!all)}>
              {all ? "Only show upgrades" : `Also show ${hidden} that aren’t upgrades`}
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}

/** "Search trade": opens a window with real listings measured in the build, with the trade site as a fallback. */
export function TradeSearchButton({ target, metric, league, maxPrice, compact, primary }: {
  target: ShopTarget; metric: Metric; league?: string; maxPrice?: number; compact?: boolean; primary?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={compact ? "text-gold hover:underline" : primary ? "btn btn-primary" : "btn"} onClick={() => setOpen(true)}
        title="Find real listings and measure them in your build">
        {compact ? <Search size={14} /> : <><Search size={13} /> Search trade</>}
      </button>
      {open && <ShopWindow target={target} metric={metric} league={league} maxPrice={maxPrice} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Searches the real trade site for the slots with most headroom and keeps only the listings PoB says are upgrades. */
export function BestInShop({ metric, league, maxPrice }: { metric: Metric; league?: string; maxPrice?: number }) {
  const [buyNow, setBuyNow] = useState(false);
  const run = useMutation({
    mutationFn: () => api.get<BestInShopResult>(`/gear/best-in-shop${qs({ metric, league, maxPrice, buyNow: buyNow || undefined })}`),
  });
  const d = run.data;
  const [more, setMore] = useState<string | null>(null);
  return (
    <div className="panel space-y-3 border-l-4 border-l-unique p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={run.isPending} onClick={() => run.mutate()}>
          <Sparkles size={14} /> {run.isPending ? "Searching trade…" : "Best in shop"}
        </button>
        <BuyNowToggle value={buyNow} onChange={setBuyNow} />
        <span className="text-xs text-ink-400">
          Checks what is listed right now (rares too) for your top upgrade slots and keeps only real upgrades{maxPrice ? ` up to ${maxPrice} div` : ""}. Takes a minute or two.
        </span>
      </div>
      <ErrorText error={run.error} />
      {d && (
        <>
          {d.best.length === 0 && <p className="text-sm text-ink-400">No listed item beat your current gear in the {d.searched.length} slot(s) searched{d.maxPrice ? ` within ${d.maxPrice} div` : ""}{d.buyNow ? " with buy now" : ""}.</p>}
          {d.best.map((l, i) => <ListingCard key={`${l.group}${l.name}${i}`} l={l} />)}
          {d.slots.filter((s) => s.items.length > 1).map((s) => (
            <div key={s.slot} className="text-sm">
              <button className="flex items-center gap-1 text-ink-400 hover:text-ink-200" onClick={() => setMore(more === s.slot ? null : s.slot)}>
                {more === s.slot ? <ChevronDown size={13} /> : <ChevronRight size={13} />} More for {s.slot} ({s.items.length - 1})
              </button>
              {more === s.slot && s.items.slice(1).map((l, i) => <ListingCard key={`${l.name}${i}`} l={l} />)}
            </div>
          ))}
          {d.errors.length > 0 && <p className="text-xs text-bad">Trade search failed for {d.errors.map((e) => `${e.slot} (${e.error})`).join(", ")}</p>}
        </>
      )}
    </div>
  );
}
