import { useQuery } from "@tanstack/react-query";
import { Axe, Crown, Diamond, Footprints, Gem, Hand, Shield, Shirt, Sparkles, Swords, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { api } from "../api/client";

type ArtMap = { uniques: Record<string, string>; bases: Record<string, string> };

/** Icon URLs (GGG's CDN, collected from poe.ninja) by unique name and base type. */
export const useItemArt = () =>
  useQuery({ queryKey: ["static", "art"], queryFn: () => api.get<ArtMap>("/art"), staleTime: 30 * 60_000 });

const FALLBACK: [RegExp, LucideIcon][] = [
  [/Helmet|Crown|Hood|Mask|Circlet/i, Crown],
  [/Body|Armour|Vest|Robe|Mantle|Jacket|Garb/i, Shirt],
  [/Glove|Gauntlet|Cuffs|Wraps|Bracers|Mitts/i, Hand],
  [/Boots|Greaves|Slippers|Shoes/i, Footprints],
  [/Shield|Buckler|Focus|Quiver/i, Shield],
  [/Ring|Amulet|Belt|Talisman/i, Diamond],
  [/Jewel|Sapphire|Emerald|Ruby|Diamond/i, Gem],
  [/Flask|Charm/i, Sparkles],
  [/Axe/i, Axe],
];

function fallbackIcon(type?: string, base?: string): LucideIcon {
  const text = `${type ?? ""} ${base ?? ""}`;
  return FALLBACK.find(([re]) => re.test(text))?.[1] ?? Swords;
}

export function artUrl(map: ArtMap | undefined, item: { rarity?: string; title?: string; name?: string; baseName?: string }) {
  if (!map) return undefined;
  const unique = item.rarity === "UNIQUE" || item.rarity === "RELIC";
  const title = item.title ?? item.name?.split(",")[0];
  return (unique && title ? map.uniques[title] : undefined) ?? (item.baseName ? map.bases[item.baseName] : undefined);
}

/** The item's game art, or a type icon until its art is known (art fills in as characters are imported). */
export function ItemArt({ item, size = 48, className = "" }: {
  item: { rarity?: string; title?: string; name?: string; baseName?: string; type?: string };
  size?: number;
  className?: string;
}) {
  const art = useItemArt();
  const url = artUrl(art.data, item);
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}
        className={`object-contain drop-shadow ${className}`} style={{ maxWidth: size, maxHeight: size * 1.5 }} />
    );
  }
  const Icon = fallbackIcon(item.type, item.baseName);
  return (
    <span className={`flex items-center justify-center rounded-md border border-ink-700 bg-ink-900 text-ink-400 ${className}`} style={{ width: size, height: size }}>
      <Icon size={Math.round(size * 0.5)} />
    </span>
  );
}
