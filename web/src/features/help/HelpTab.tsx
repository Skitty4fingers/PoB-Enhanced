import {
  ArrowRight, BookOpen, Bot, CircleHelp, ClipboardCheck, Gauge, Gem, LifeBuoy, Network, Rocket, TrendingUp,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Jump to another tab (App listens for hash changes). */
function go(tab: string) {
  window.location.hash = tab;
}

function Open({ tab, children }: { tab: string; children: ReactNode }) {
  return (
    <button className="btn mt-3" onClick={() => go(tab)}>
      {children} <ArrowRight size={14} />
    </button>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="mt-3 space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gold/15 text-xs font-semibold text-gold-soft">{i + 1}</span>
          <span className="pt-0.5">{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Points({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-400" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Term({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-ink-200">{children}</strong>;
}

function Kbd({ children }: { children: ReactNode }) {
  return <code className="rounded border border-ink-600 bg-ink-800 px-1 py-px text-xs text-ink-200">{children}</code>;
}

type Section = { id: string; title: string; icon: ReactNode; body: ReactNode };

const SECTIONS: Section[] = [
  {
    id: "start",
    title: "Quick start",
    icon: <Rocket size={15} />,
    body: (
      <>
        <p>PoB-Enhanced runs Path of Building&apos;s own calculator. Every number here is measured in <Term>your</Term> build, with your Config tab settings.</p>
        <Steps
          items={[
            <>Press <Term>Import</Term> (top right) and paste a PoB share code, a pobb.in / pastebin link, or your <Term>poe.ninja character page</Term> (<Kbd>poe.ninja/poe2/profile/&lt;account&gt;/&lt;league&gt;/character/&lt;name&gt;</Kbd>).</>,
            <>Check the <Term>summary card</Term> in the sidebar: DPS, EHP and your resources (Mana, Spirit, Rage, Runic Ward).</>,
            <>Set the <Term>Config</Term> tab to how you actually play (enemy conditions, buffs, charges). It changes every number.</>,
            <>Follow the <Term>Tree</Term> advisor for passive points, and use <Term>Upgrades</Term> before you spend currency.</>,
            <>When your character changes in game, press <Term>Update</Term> in the header to re-import it. Your Config settings are kept.</>,
          ]}
        />
      </>
    ),
  },
  {
    id: "summary",
    title: "The summary card",
    icon: <Gauge size={15} />,
    body: (
      <>
        <p>The card at the top of the sidebar recalculates after every change, whether you make it here or an AI agent makes it over MCP.</p>
        <Points
          items={[
            <><Term>DPS</Term>: the main skill&apos;s damage. For totem skills it counts every totem your Spirit can keep up (PoB itself shows one totem).</>,
            <><Term>EHP</Term>: effective hit pool, with Life and Energy Shield below it.</>,
            <><Term>Resources</Term>: only the ones your character has. <Term>net</Term> is regeneration minus what the main skill spends per second; red means it drains.</>,
            <><Term>Spirit</Term>: what is reserved and how much is free. A warning appears when Spirit limits your totems.</>,
            <>After a change, a green or red <Term>chip</Term> shows how much DPS or EHP moved. Hover DPS, EHP or Spirit for a breakdown (defences, resistances, reservations).</>,
          ]}
        />
      </>
    ),
  },
  {
    id: "tree",
    title: "Tree and advisor",
    icon: <Network size={15} />,
    body: (
      <>
        <p>The passive tree uses the game&apos;s own artwork. Hover a node for its stats and what allocating it would change.</p>
        <Points
          items={[
            <><Term>Next point</Term> (green, NEXT): the best node to take next, with the path to it.</>,
            <><Term>Move a point</Term> (red, MOVE): the allocated point that is cheapest to refund, and what it gains elsewhere.</>,
            <><Term>Attribute nodes</Term> (amber): which +5 Str/Dex/Int choices to switch. Gear and gem requirements are respected.</>,
            <>Choose <Term>Balanced</Term>, <Term>Damage</Term> or <Term>Defence</Term> to change what the advisor optimises for.</>,
            <>Import or copy official <Kbd>pathofexile2.com/game/passive-skill-tree</Kbd> links with the tree link buttons.</>,
          ]}
        />
        <Open tab="tree">Open Tree</Open>
      </>
    ),
  },
  {
    id: "upgrades",
    title: "Upgrades",
    icon: <TrendingUp size={15} />,
    body: (
      <>
        <p>Everything in Upgrades is measured in your build. Pick Balanced (DPS% + EHP%), Damage or Defence at the top.</p>
        <Points
          items={[
            <><Term>Check item</Term>: paste any item (Ctrl+C in game or from trade) for an upgrade / sidegrade / downgrade verdict. It checks every damage skill, totems, Spirit, attribute requirements and skills the swap would remove. <Term>Do this before buying anything.</Term></>,
            <><Term>Gear</Term> and <Term>Jewels</Term>: what each item and mod is worth (dead mods flagged), what to look for on a replacement, and a weighted trade search.</>,
            <><Term>Sockets</Term>: what each rune, soul core and idol is worth and the best legal replacements. It respects corruption, level, per-item limits and character-wide limits (for example Ancient Augment). <Term>Build plan</Term> gives an ordered list of swaps measured together.</>,
            <><Term>Gems</Term>: what each support is worth, the best swap for the weakest one, and level/quality upgrades. One click applies a suggestion.</>,
            <><Term>Shop</Term>: uniques that would help most, with poe.ninja prices and a budget filter.</>,
          ]}
        />
        <Open tab="upgrades">Open Upgrades</Open>
      </>
    ),
  },
  {
    id: "check",
    title: "Check before you buy",
    icon: <ClipboardCheck size={15} />,
    body: (
      <>
        <Steps
          items={[
            <>In game or on the trade site, hover the item and press <Kbd>Ctrl</Kbd>+<Kbd>C</Kbd>.</>,
            <>Open <Term>Upgrades → Check item</Term> (or the Items tab) and paste it.</>,
            <>Read the verdict and warnings: <Term>totems lost</Term>, <Term>Spirit short</Term>, <Term>attribute requirement</Term> or <Term>removed skills</Term> matter more than the headline percent.</>,
            <>Compare several listings the same way; equip the winner from the Items tab if you want to keep working with it.</>,
          ]}
        />
        <p className="mt-3 text-ink-400">Lines PoB can&apos;t model are flagged &quot;unmodelled&quot;. Their effect is not in the numbers, so weigh them yourself.</p>
      </>
    ),
  },
  {
    id: "build",
    title: "Skills, Items and Config",
    icon: <Gem size={15} />,
    body: (
      <Points
        items={[
          <><Term>Skills</Term>: add gem groups, pick the main skill (the one DPS is shown for) and enable or disable groups.</>,
          <><Term>Items</Term>: equip from item text, unequip, or search uniques. Equipping an item with warnings asks first.</>,
          <><Term>Config</Term>: enemy conditions, buffs, charges and custom modifiers. If a number looks wrong, check here first.</>,
        ]}
      />
    ),
  },
  {
    id: "guide",
    title: "Build guides",
    icon: <BookOpen size={15} />,
    body: (
      <>
        <p>Upload a guide&apos;s PoE2 BuildPlanner <Kbd>.build</Kbd> file (Maxroll and the in-game planner export these).</p>
        <Points
          items={[
            <>See missing and extra passives, skill and support gaps, and the guide&apos;s gear notes.</>,
            <>The guide&apos;s notables are ranked by gain per point, each with its path and one-click allocate.</>,
            <>The guide&apos;s untaken nodes are outlined on the tree. Pick a level stage to compare against.</>,
          ]}
        />
        <Open tab="reference">Open Guide</Open>
      </>
    ),
  },
  {
    id: "ai",
    title: "AI agents (MCP)",
    icon: <Bot size={15} />,
    body: (
      <>
        <p>Connect Claude or any MCP client to the same live build. The UI updates as the agent works.</p>
        <pre className="mt-2 overflow-x-auto rounded border border-ink-700 bg-ink-900 p-2 text-xs text-ink-200">claude mcp add --transport http pob2 {window.location.origin}/mcp</pre>
        <p className="mt-2 text-ink-400">Ask things like &quot;check this item before I buy it&quot;, &quot;what should my next 5 points be?&quot; or &quot;which runes should I swap?&quot;.</p>
        <Open tab="ai">Open AI / MCP</Open>
      </>
    ),
  },
  {
    id: "tips",
    title: "Tips and limits",
    icon: <LifeBuoy size={15} />,
    body: (
      <Points
        items={[
          <>There is <Term>one live build</Term> per server, shared by every browser tab and agent. It lives in memory: after a server restart, import again or press Update.</>,
          <>There is <Term>no login</Term>. Anyone who can reach the server can change the build, so keep it on localhost, your home network or a tailnet.</>,
          <>Numbers follow PoB&apos;s calculator. Mods PoB doesn&apos;t support show as unmodelled, and the advisors treat them as worth 0.</>,
          <>Nothing is changed by advice, checks or plans. Only Allocate, Apply, Equip and similar buttons change the build.</>,
          <>Use your browser&apos;s back button or the tabs to move around; the URL keeps the current tab (<Kbd>#upgrades</Kbd>, <Kbd>#help</Kbd>).</>,
        ]}
      />
    ),
  },
];

export function HelpTab() {
  const [active, setActive] = useState(SECTIONS[0].id);
  const container = useRef<HTMLDivElement>(null);
  // Highlight the section being read.
  useEffect(() => {
    const root = container.current?.closest(".overflow-y-auto") ?? null;
    const obs = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id.replace("help-", ""));
      },
      { root, rootMargin: "0px 0px -60% 0px" },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(`help-${s.id}`);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, []);
  const jump = (id: string) => document.getElementById(`help-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <div ref={container} className="mx-auto flex max-w-5xl gap-8 p-4 md:p-6">
      <nav className="sticky top-0 hidden w-48 shrink-0 self-start md:block" aria-label="Help sections">
        <div className="label mb-2 flex items-center gap-1.5"><CircleHelp size={13} /> Help</div>
        <ul className="space-y-0.5">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => jump(s.id)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition ${
                  active === s.id ? "bg-gold/10 text-gold-soft" : "text-ink-400 hover:text-ink-200"
                }`}
              >
                {s.icon} {s.title}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 flex-1 space-y-4 text-sm leading-6 text-ink-400">
        <header className="panel p-5">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-gold-soft"><CircleHelp size={20} /> How to use PoB-Enhanced</h1>
          <p className="mt-1">A short guide to every part of the app. New here? Start with the quick start below.</p>
        </header>
        {SECTIONS.map((s) => (
          <section key={s.id} id={`help-${s.id}`} className="panel scroll-mt-4 p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink-200">
              <span className="text-gold-soft">{s.icon}</span> {s.title}
            </h2>
            <div className="mt-2">{s.body}</div>
          </section>
        ))}
        <p className="pb-6 text-center text-xs">
          More detail: <a className="text-gold-soft hover:underline" href="https://skitty4fingers.github.io/PoB-Enhanced/" target="_blank" rel="noreferrer">project site</a>
          {" · "}
          <a className="text-gold-soft hover:underline" href="/docs" target="_blank" rel="noreferrer">REST API reference</a>
        </p>
      </div>
    </div>
  );
}

/** One-time banner for first visits, pointing at the guide. */
export function WelcomeBanner() {
  const [show, setShow] = useState(() => {
    try {
      return localStorage.getItem("pob2.helpSeen") !== "1";
    } catch {
      return false;
    }
  });
  if (!show) return null;
  const dismiss = () => {
    try {
      localStorage.setItem("pob2.helpSeen", "1");
    } catch {
      /* private mode: just hide it */
    }
    setShow(false);
  };
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-gold/30 bg-gold/10 px-4 py-2 text-sm text-ink-200">
      <CircleHelp size={15} className="hidden text-gold-soft sm:block" />
      <span className="min-w-0 flex-1">New to PoB-Enhanced? The help guide walks through importing your character and every tool.</span>
      <button className="btn btn-primary" onClick={() => { dismiss(); go("help"); }}>Open the guide</button>
      <button className="btn btn-ghost text-ink-400" onClick={dismiss}>Dismiss</button>
    </div>
  );
}

