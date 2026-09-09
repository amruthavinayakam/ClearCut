import type { Category } from "@clearcut/contracts";
import {
  Archive,
  Building2,
  Frame,
  MapPin,
  Music,
  Package,
  Quote,
  Signpost,
  Sparkles,
  Tag,
  UserRound,
  type LucideIcon,
} from "lucide-react";

/**
 * One icon per clearance category, tinted by the case's risk colour.
 *
 * The icon replaces a coloured dot plus a "Brand · Both" caption. The dot
 * carried risk but said nothing about what the element was, and the caption
 * repeated in every row what the icon can say at a glance.
 */
const ICONS: Record<Category, LucideIcon> = {
  brand: Tag,
  artwork: Frame,
  music: Music,
  real_person: UserRound,
  organization: Building2,
  location: MapPin,
  quotation: Quote,
  archival: Archive,
  product: Package,
  signage: Signpost,
  other: Sparkles,
};

export function CategoryIcon({
  category,
  color,
  provenance,
  className = "",
}: {
  category: Category;
  color: string;
  provenance?: string;
  className?: string;
}) {
  const Icon = ICONS[category] ?? Sparkles;
  const label = category.replaceAll("_", " ");
  return (
    <span
      // Concentric: 6px radius inside a 24px tile reads as one object rather
      // than a square with a rounded sticker on it.
      className={`grid size-6 shrink-0 place-items-center rounded-[6px] risk-tint--${color} ${className}`}
      title={provenance ? `${label} · ${provenance.replaceAll("_", " ")}` : label}
    >
      <Icon aria-hidden="true" className="size-3.5" strokeWidth={2} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
