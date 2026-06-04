import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback, useRef, type TouchEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AuthGate } from "@/components/AuthGate";
import { GenderGate } from "@/components/GenderGate";
import { PaymentGate } from "@/components/PaymentGate";
import { UploadDialog } from "@/components/UploadDialog";
import { PostCard } from "@/components/PostCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogOut, Search, MapPin, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Have You Hit" },
      {
        name: "description",
        content: "Post a pic. Hit or Not Hit? Green flags, red flags, and the comments.",
      },
      { property: "og:title", content: "Have You Hit" },
      { property: "og:description", content: "The group chat verdict in app form." },
    ],
  }),
  component: Index,
});

type Post = {
  id: string;
  user_id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
  subject_name: string;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
};

const NEARBY_KM = 80;

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;

  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(s));
}

function Index() {
  const { user, session, loading } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [feedLoading, setFeedLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [nearby, setNearby] = useState(false);
  const [gender, setGender] = useState<string | null | undefined>(undefined);
  const [membershipActive, setMembershipActive] = useState(false);

  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    if (!user) {
      setGender(undefined);
      setMembershipActive(false);
      return;
    }

    supabase
      .from("profiles")
      .select("gender")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setGender((data?.gender as string | null) ?? null));
  }, [user]);

  useEffect(() => {
    setMembershipActive(false);
  }, [user?.id]);

  const load = useCallback(async () => {
    setFeedLoading(true);

    const { data, error } = await supabase
      .from("posts")
      .select(
        "id,user_id,image_url,caption,created_at,subject_name,latitude,longitude,location_name",
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      toast.error(error.message);
      setPosts([]);
      setFeedLoading(false);
      return;
    }

    const ps = (data as Post[]) ?? [];
    setPosts(ps);

    const ids = Array.from(new Set(ps.map((p) => p.user_id)));

    if (ids.length) {
      const { data: profs, error: profilesError } = await supabase
        .from("profiles")
        .select("id,display_name")
        .in("id", ids);

      if (profilesError) {
        toast.error(profilesError.message);
      }

      const map: Record<string, string> = {};

      (profs as { id: string; display_name: string }[] | null)?.forEach((p) => {
        map[p.id] = p.display_name;
      });

      setNames(map);
    } else {
      setNames({});
    }

    setFeedLoading(false);
  }, []);

  useEffect(() => {
    if (user && membershipActive) load();
  }, [user, membershipActive, load]);

  const handleMembershipActive = useCallback(() => {
    setMembershipActive(true);
  }, []);

  function handleTouchStart(e: TouchEvent<HTMLDivElement>) {
    if (window.scrollY === 0) {
      touchStartY.current = e.touches[0].clientY;
    }
  }

  function handleTouchMove(e: TouchEvent<HTMLDivElement>) {
    if (touchStartY.current === null || refreshing) return;

    const currentY = e.touches[0].clientY;
    const distance = currentY - touchStartY.current;

    if (distance > 0 && window.scrollY === 0) {
      setPullY(Math.min(distance, 90));
    }
  }

  async function handleTouchEnd() {
    if (pullY > 70 && !refreshing) {
      setRefreshing(true);

      try {
        await load();
        toast.success("Feed refreshed");
      } catch {
        toast.error("Could not refresh feed");
      } finally {
        setRefreshing(false);
      }
    }

    setPullY(0);
    touchStartY.current = null;
  }

  function toggleNearby() {
    if (nearby) {
      setNearby(false);
      return;
    }

    if (myLoc) {
      setNearby(true);
      return;
    }

    if (!navigator.geolocation) {
      toast.error("Geolocation not supported");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMyLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setNearby(true);
      },
      (err) => {
        if (err.message?.includes("permission") || err.code === 1) {
          toast.error("Location is blocked. Use an HTTPS link like ngrok, then allow location.");
          return;
        }

        toast.error(err.message || "Couldn't get location");
      },
      { timeout: 10000 },
    );
  }

  const filtered = useMemo(() => {
    let list = posts;
    const q = query.trim().toLowerCase();

    if (q) {
      list = list.filter((p) => p.subject_name?.toLowerCase().includes(q));
    }

    if (nearby && myLoc) {
      list = list.filter(
        (p) =>
          p.latitude != null &&
          p.longitude != null &&
          distanceKm(myLoc, { lat: p.latitude, lng: p.longitude }) <= NEARBY_KM,
      );
    }

    return list;
  }, [posts, query, nearby, myLoc]);

  if (loading) return <div className="min-h-screen" />;
  if (!user) return <AuthGate />;
  if (gender === undefined) return <div className="min-h-screen" />;
  if (!gender)
    return <GenderGate userId={user.id} onConfirmed={() => setGender("confirmed_18_plus")} />;

  return (
    <PaymentGate userEmail={session?.user.email} onActive={handleMembershipActive}>
      <div
        className="min-h-screen"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-border">
          <div className="max-w-2xl mx-auto px-4 py-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h1 className="font-display text-2xl sm:text-3xl font-black text-primary leading-none">
                Have You Hit
              </h1>

              <div className="flex items-center justify-end gap-2">
                <p className="max-w-28 text-right text-[11px] font-black uppercase leading-tight text-primary sm:max-w-none sm:text-sm">
                  This is in protest of the Tea app
                </p>

                <UploadDialog userId={user.id} onUploaded={load} />

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => supabase.auth.signOut()}
                  className="rounded-full text-muted-foreground"
                  aria-label="Sign out"
                >
                  <LogOut className="size-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />

                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name…"
                  className="rounded-full pl-9 pr-9 bg-muted border-0 h-10"
                />

                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>

              <Button
                type="button"
                variant={nearby ? "default" : "outline"}
                onClick={toggleNearby}
                className="rounded-full h-10 gap-1.5 shrink-0"
                aria-pressed={nearby}
              >
                <MapPin className="size-4" />
                Nearby
              </Button>
            </div>
          </div>
        </header>

        <div
          className="text-center text-sm font-semibold text-muted-foreground transition-all duration-200 overflow-hidden"
          style={{ height: pullY > 0 || refreshing ? 40 : 0 }}
        >
          <div className="py-2">
            {refreshing ? "Refreshing…" : pullY > 70 ? "Release to refresh" : "Pull to refresh"}
          </div>
        </div>

        <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          {feedLoading && posts.length === 0 && (
            <div className="text-center py-20 text-muted-foreground">Loading the tea…</div>
          )}

          {!feedLoading && filtered.length === 0 && (
            <div className="text-center py-20 bg-card rounded-3xl border border-border">
              <p className="font-display text-3xl font-bold mb-2">
                {posts.length === 0 ? "No tea yet" : "Nothing matches"}
              </p>

              <p className="text-muted-foreground">
                {posts.length === 0
                  ? "Be the first to drop a pic."
                  : "Try a different name or turn off Nearby."}
              </p>
            </div>
          )}

          {filtered.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              currentUserId={user.id}
              authorName={names[p.user_id] ?? "someone"}
              onDeleted={load}
            />
          ))}
        </main>
      </div>
    </PaymentGate>
  );
}
