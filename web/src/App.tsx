import { ArrowLeftRight, BookOpen, Bot, CircleHelp, Gem, Network, Settings2, Shield, TrendingUp } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useLiveRevision, useOverview } from "./api/hooks";
import { ErrorText } from "./components/ErrorText";
import { Header } from "./components/Header";
import { BudgetCard } from "./components/BudgetCard";
import { CommandPalette } from "./components/CommandPalette";
import { StatPanel } from "./components/StatPanel";
import { AscendancyBackdrop } from "./components/ThemeControls";
import { AiTab } from "./features/ai/AiTab";
import { CompareTab } from "./features/compare/CompareTab";
import { ConfigTab } from "./features/config/ConfigTab";
import { ItemsTab } from "./features/items/ItemsTab";
import { ReferenceTab } from "./features/reference/ReferenceTab";
import { SkillsTab } from "./features/skills/SkillsTab";
import { TreeTab } from "./features/tree/TreeTab";
import { UpgradesTab } from "./features/upgrades/UpgradesTab";
import { HelpTab, WelcomeBanner } from "./features/help/HelpTab";

const TABS: { id: string; label: string; icon: ReactNode }[] = [
  { id: "tree", label: "Tree", icon: <Network size={15} /> },
  { id: "skills", label: "Skills", icon: <Gem size={15} /> },
  { id: "items", label: "Items", icon: <Shield size={15} /> },
  { id: "config", label: "Config", icon: <Settings2 size={15} /> },
  { id: "upgrades", label: "Upgrades", icon: <TrendingUp size={15} /> },
  { id: "reference", label: "Guide", icon: <BookOpen size={15} /> },
  { id: "compare", label: "Compare", icon: <ArrowLeftRight size={15} /> },
  { id: "ai", label: "AI / MCP", icon: <Bot size={15} /> },
  { id: "help", label: "Help", icon: <CircleHelp size={15} /> },
];

function initialTab() {
  const hash = window.location.hash.slice(1).split("/")[0];
  return TABS.some((t) => t.id === hash) ? hash : "tree";
}

export default function App() {
  const revision = useLiveRevision();
  const overview = useOverview();
  const [tab, setTabState] = useState(initialTab);
  useEffect(() => {
    const onHash = () => setTabState(initialTab());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const setTab = (id: string) => {
    setTabState(id);
    history.replaceState(null, "", `#${id}`);
  };

  return (
    <div className="flex h-full flex-col">
      <AscendancyBackdrop info={overview.data?.info} />
      <Header info={overview.data?.info} revision={revision} />
      <WelcomeBanner />
      <CommandPalette />
      {overview.error ? <div className="p-4"><ErrorText error={overview.error} /></div> : null}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="order-2 max-h-[40vh] overflow-y-auto border-t border-ink-700 bg-ink-900 md:order-1 md:max-h-none md:w-72 md:shrink-0 md:border-t-0 md:border-r">
          <BudgetCard />
          <StatPanel stats={overview.data?.stats} />
        </aside>
        <main className="order-1 flex min-h-0 min-w-0 flex-1 flex-col md:order-2">
          <nav className="flex gap-1 overflow-x-auto border-b border-ink-700 px-3">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition ${
                  tab === t.id ? "border-gold text-gold-soft" : "border-transparent text-ink-400 hover:text-ink-200"
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "tree" && <TreeTab />}
            {tab === "skills" && <SkillsTab />}
            {tab === "items" && <ItemsTab />}
            {tab === "config" && <ConfigTab />}
            {tab === "upgrades" && <UpgradesTab />}
            {tab === "reference" && <ReferenceTab />}
            {tab === "compare" && <CompareTab />}
            {tab === "ai" && <AiTab />}
            {tab === "help" && <HelpTab />}
          </div>
        </main>
      </div>
    </div>
  );
}
