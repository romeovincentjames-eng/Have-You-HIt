import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type LimitedFeature = "search" | "location";

const LIMITS: Record<LimitedFeature, number> = {
  search: 7,
  location: 2,
};

type UsageCounts = Record<LimitedFeature, number>;

const EMPTY_COUNTS: UsageCounts = {
  search: 0,
  location: 0,
};

function getWeekStart() {
  const date = new Date();
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;

  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + mondayOffset);

  return date.toISOString().slice(0, 10);
}

export function useUsageLimits(userId: string | undefined, subscriber: boolean) {
  const [counts, setCounts] = useState<UsageCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const weekStart = useMemo(() => getWeekStart(), []);

  const loadCounts = useCallback(async () => {
    if (!userId || subscriber) {
      setCounts(EMPTY_COUNTS);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("usage_counters")
      .select("feature,used_count")
      .eq("user_id", userId)
      .eq("week_start", weekStart)
      .in("feature", ["search", "location"]);

    if (error) {
      setLoading(false);
      throw error;
    }

    const nextCounts = { ...EMPTY_COUNTS };

    data?.forEach((row) => {
      if (row.feature === "search" || row.feature === "location") {
        nextCounts[row.feature] = row.used_count;
      }
    });

    setCounts(nextCounts);
    setLoading(false);
  }, [subscriber, userId, weekStart]);

  useEffect(() => {
    loadCounts().catch(() => setLoading(false));
  }, [loadCounts]);

  const remaining = useMemo(
    () => ({
      search: subscriber ? Number.POSITIVE_INFINITY : Math.max(0, LIMITS.search - counts.search),
      location: subscriber
        ? Number.POSITIVE_INFINITY
        : Math.max(0, LIMITS.location - counts.location),
    }),
    [counts, subscriber],
  );

  const hasRemaining = useCallback(
    (feature: LimitedFeature) => subscriber || remaining[feature] > 0,
    [remaining, subscriber],
  );

  const recordUse = useCallback(
    async (feature: LimitedFeature) => {
      if (subscriber) {
        return { allowed: true, remaining: Number.POSITIVE_INFINITY };
      }

      if (!userId) {
        return { allowed: false, remaining: 0 };
      }

      const limit = LIMITS[feature];
      const current = counts[feature];

      if (current >= limit) {
        return { allowed: false, remaining: 0 };
      }

      const nextCount = current + 1;

      const { data, error } = await supabase
        .from("usage_counters")
        .upsert(
          {
            user_id: userId,
            feature,
            week_start: weekStart,
            used_count: nextCount,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,feature,week_start" },
        )
        .select("feature,used_count")
        .single();

      if (error) throw error;

      setCounts((currentCounts) => ({
        ...currentCounts,
        [feature]: data.used_count,
      }));

      return {
        allowed: true,
        remaining: Math.max(0, limit - data.used_count),
      };
    },
    [counts, subscriber, userId, weekStart],
  );

  return {
    limits: LIMITS,
    counts,
    remaining,
    loading,
    hasRemaining,
    recordUse,
    reload: loadCounts,
  };
}
