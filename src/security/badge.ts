import type { TrustBadge } from "./security.types";

const BADGE_SEVERITY: Record<TrustBadge, number> = {
  certified: 0,
  conditional: 1,
  suspicious: 2,
  rejected: 3,
};

export function isBadgeAtOrAbove(badge: TrustBadge, threshold: TrustBadge): boolean {
  return BADGE_SEVERITY[badge] >= BADGE_SEVERITY[threshold];
}
