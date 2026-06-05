import { createFileRoute } from "@tanstack/react-router";
import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
  type FormEvent,
  type TouchEvent,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AgeVerificationGate } from "@/components/AgeVerificationGate";
import { AuthGate } from "@/components/AuthGate";
import { GenderGate } from "@/components/GenderGate";
import { GuidelinesGate } from "@/components/GuidelinesGate";
import { PaymentGate, SubscribeButton } from "@/components/PaymentGate";
import { UploadDialog } from "@/components/UploadDialog";
import { PostCard } from "@/components/PostCard";
import { DatingSection } from "@/components/DatingSection";
import { MatchesSection } from "@/components/MatchesSection";
import { ProfileSection } from "@/components/ProfileSection";
import { CommunityGuidelinesDialog } from "@/components/CommunityGuidelines";
import { useUsageLimits } from "@/hooks/use-usage-limits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Heart, LogOut, MessageCircle, Search, MapPin, UserCircle, Users, X } from "lucide-react";
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
  target_user_id: string | null;
  image_url: string;
  caption: string | null;
  created_at: string;
  subject_name: string;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
};

type ActiveView = "feed" | "dating" | "matches" | "profile";
type Gender = "man" | "woman";

const NEARBY_KM = 80;

function isSupportedGender(value: unknown): value is Gender {
  return value === "man" || value === "woman";
}

function getSavedAgeVerifiedAt(user: { user_metadata?: Record<string, unknown> } | null) {
  const metadata = user?.user_metadata ?? {};
  const ageVerifiedAt = metadata.age_verified_at;
  const stripeVerifiedAt = metadata.stripe_identity_verified_at;

  if (typeof ageVerifiedAt === "string" && ageVerifiedAt) return ageVerifiedAt;
  if (typeof stripeVerifiedAt === "string" && stripeVerifiedAt) return stripeVerifiedAt;
  return null;
}

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
  const [searchDraft, setSearchDraft] = useState("");
  const [query, setQuery] = useState("");
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [nearby, setNearby] = useState(false);
  const [gender, setGender] = useState<string | null | undefined>(undefined);
  const [ageVerifiedAt, setAgeVerifiedAt] = useState<string | null | undefined>(undefined);
  const [guidelinesAgreedAt, setGuidelinesAgreedAt] = useState<string | null | undefined>(
    undefined,
  );
  const [membershipActive, setMembershipActive] = useState(false);
  const [limitNotice, setLimitNotice] = useState("");
  const [ageConfirmBusy, setAgeConfirmBusy] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>("feed");
  const [matchesRefreshKey, setMatchesRefreshKey] = useState(0);

  const usageLimits = useUsageLimits(user?.id, membershipActive);

  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    if (!user) {
      setGender(undefined);
      setAgeVerifiedAt(undefined);
      setGuidelinesAgreedAt(undefined);
      setMembershipActive(false);
      return;
    }

    const savedAgeVerifiedAt = getSavedAgeVerifiedAt(user);

    supabase
      .from("profiles")
      .select("gender,age_verified_at,community_guidelines_agreed_at")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setGender((data?.gender as string | null) ?? null);
        setAgeVerifiedAt(data?.age_verified_at ?? savedAgeVerifiedAt);
        setGuidelinesAgreedAt(data?.community_guidelines_agreed_at ?? null);
      });
  }, [user]);

  useEffect(() => {
    setMembershipActive(false);
  }, [user?.id]);

  const load = useCallback(async () => {
    setFeedLoading(true);

    const { data, error } = await supabase
      .from("posts")
      .select(
        "id,user_id,target_user_id,image_url,caption,created_at,subject_name,latitude,longitude,location_name",
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
    if (user && ageVerifiedAt && guidelinesAgreedAt) load();
  }, [user, ageVerifiedAt, guidelinesAgreedAt, load]);

  const handleMembershipStatus = useCallback((active: boolean) => {
    setMembershipActive(active);
  }, []);

  const confirmAdultAge = useCallback(async () => {
    if (!user) return;

    setAgeConfirmBusy(true);

    try {
      const confirmedAt = new Date().toISOString();
      const displayName =
        typeof user.user_metadata?.display_name === "string" &&
        user.user_metadata.display_name.trim()
          ? user.user_metadata.display_name.trim()
          : user.email?.split("@")[0] || "Member";

      const { error: profileError } = await supabase.from("profiles").upsert({
        id: user.id,
        display_name: displayName,
        age_verified_at: confirmedAt,
        age_verification_method: "self_confirmation",
      });

      if (profileError) throw profileError;

      const { error: authError } = await supabase.auth.updateUser({
        data: {
          ...user.user_metadata,
          confirmed_18_plus: true,
          age_verified_at: confirmedAt,
          age_verification_method: "self_confirmation",
        },
      });

      if (authError) throw authError;

      setAgeVerifiedAt(confirmedAt);
      await supabase.auth.refreshSession();
      toast.success("18+ confirmed. Welcome in.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save your 18+ confirmation.");
    } finally {
      setAgeConfirmBusy(false);
    }
  }, [user]);

  const promptSubscribeForLimit = useCallback((message: string) => {
    setLimitNotice(message);
    toast.error(message);
  }, []);

  const handleSearchSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      const nextQuery = searchDraft.trim();

      if (!nextQuery) {
        setQuery("");
        setLimitNotice("");
        return;
      }

      if (nextQuery.toLowerCase() === query.trim().toLowerCase()) {
        return;
      }

      if (!membershipActive && !usageLimits.hasRemaining("search")) {
        promptSubscribeForLimit(
          "You used all 7 free searches this week. Subscribe for unlimited search.",
        );
        return;
      }

      try {
        const result = await usageLimits.recordUse("search");

        if (!result.allowed) {
          promptSubscribeForLimit(
            "You used all 7 free searches this week. Subscribe for unlimited search.",
          );
          return;
        }

        setQuery(nextQuery);
        setLimitNotice("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not count this search.");
      }
    },
    [membershipActive, promptSubscribeForLimit, query, searchDraft, usageLimits],
  );

  const recordLocationUse = useCallback(async () => {
    if (!membershipActive && !usageLimits.hasRemaining("location")) {
      promptSubscribeForLimit(
        "You used both free location uses this week. Subscribe for unlimited location.",
      );
      return false;
    }

    try {
      const result = await usageLimits.recordUse("location");

      if (!result.allowed) {
        promptSubscribeForLimit(
          "You used both free location uses this week. Subscribe for unlimited location.",
        );
        return false;
      }

      setLimitNotice("");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not count location use.");
      return false;
    }
  }, [membershipActive, promptSubscribeForLimit, usageLimits]);

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
      if (!membershipActive && !usageLimits.hasRemaining("location")) {
        promptSubscribeForLimit(
          "You used both free location uses this week. Subscribe for unlimited location.",
        );
        return;
      }

      recordLocationUse().then((allowed) => {
        if (allowed) setNearby(true);
      });
      return;
    }

    if (!membershipActive && !usageLimits.hasRemaining("location")) {
      promptSubscribeForLimit(
        "You used both free location uses this week. Subscribe for unlimited location.",
      );
      return;
    }

    if (!navigator.geolocation) {
      toast.error("Geolocation not supported");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const allowed = await recordLocationUse();
        if (!allowed) return;

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
  if (ageVerifiedAt === undefined) return <div className="min-h-screen" />;
  if (!ageVerifiedAt)
    return (
      <AgeVerificationGate
        title="Confirm you are 18+"
        body="Confirm that you are at least 18 years old before entering."
        actionLabel="I confirm I am 18+"
        busy={ageConfirmBusy}
        onConfirm={confirmAdultAge}
        onSignOut={() => supabase.auth.signOut()}
      />
    );
  if (!isSupportedGender(gender))
    return <GenderGate userId={user.id} onConfirmed={(nextGender) => setGender(nextGender)} />;
  if (guidelinesAgreedAt === undefined) return <div className="min-h-screen" />;
  if (!guidelinesAgreedAt)
    return <GuidelinesGate userId={user.id} onConfirmed={setGuidelinesAgreedAt} />;

  return (
    <PaymentGate userEmail={session?.user.email} onStatus={handleMembershipStatus}>
      {({ active, checkingOut, priceLabel, startCheckout }) => (
        <div
          className="min-h-screen"
          style={{ touchAction: "pan-y" }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <header className="sticky top-0 z-30 border-b border-border bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
            <div className="mx-auto max-w-md space-y-2 px-3 py-2 sm:max-w-2xl sm:px-4 sm:py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h1 className="truncate font-display text-[1.65rem] font-black leading-none text-primary sm:text-3xl">
                    Have You Hit
                  </h1>
                  <p className="mt-1 truncate text-[10px] font-black uppercase leading-tight text-primary sm:text-[11px]">
                    Dating meets the verdict feed
                  </p>
                </div>

                <div className="flex min-w-0 shrink-0 items-center justify-end gap-1">
                  <CommunityGuidelinesDialog triggerClassName="h-10 px-3 text-xs" />

                  {!active && activeView !== "feed" && (
                    <SubscribeButton
                      checkingOut={checkingOut}
                      onClick={startCheckout}
                      label={priceLabel}
                      className="hidden sm:inline-flex"
                    />
                  )}

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

              <nav className="grid grid-cols-4 gap-1 rounded-full bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setActiveView("feed")}
                  className={`flex h-9 items-center justify-center gap-1 rounded-full text-[11px] font-black transition sm:h-10 sm:text-xs ${
                    activeView === "feed"
                      ? "bg-background text-primary shadow-sm"
                      : "text-muted-foreground"
                  }`}
                >
                  <Users className="size-4" />
                  Feed
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView("dating")}
                  className={`flex h-9 items-center justify-center gap-1 rounded-full text-[11px] font-black transition sm:h-10 sm:text-xs ${
                    activeView === "dating"
                      ? "bg-background text-primary shadow-sm"
                      : "text-muted-foreground"
                  }`}
                >
                  <Heart className="size-4" />
                  Dating
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView("matches")}
                  className={`flex h-9 items-center justify-center gap-1 rounded-full text-[11px] font-black transition sm:h-10 sm:text-xs ${
                    activeView === "matches"
                      ? "bg-background text-primary shadow-sm"
                      : "text-muted-foreground"
                  }`}
                >
                  <MessageCircle className="size-4" />
                  Matches
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView("profile")}
                  className={`flex h-9 items-center justify-center gap-1 rounded-full text-[11px] font-black transition sm:h-10 sm:text-xs ${
                    activeView === "profile"
                      ? "bg-background text-primary shadow-sm"
                      : "text-muted-foreground"
                  }`}
                >
                  <UserCircle className="size-4" />
                  Profile
                </button>
              </nav>

              {activeView === "feed" && (
                <div className="space-y-3">
                  <form onSubmit={handleSearchSubmit} className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

                      <Input
                        value={searchDraft}
                        onChange={(e) => setSearchDraft(e.target.value)}
                        placeholder="Search tagged users..."
                        className="h-10 rounded-full border-0 bg-muted pl-9 pr-9"
                      />

                      {(searchDraft || query) && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchDraft("");
                            setQuery("");
                            setLimitNotice("");
                          }}
                          className="absolute right-2 top-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"
                          aria-label="Clear search"
                        >
                          <X className="size-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                      <UploadDialog userId={user.id} currentGender={gender} onUploaded={load} />

                      <Button
                        type="button"
                        variant={nearby ? "default" : "outline"}
                        onClick={toggleNearby}
                        disabled={!active && usageLimits.loading}
                        className="h-11 rounded-full gap-1.5 px-3"
                        aria-pressed={nearby}
                      >
                        <MapPin className="size-4" />
                        Nearby
                      </Button>

                      <Button
                        type="submit"
                        variant="default"
                        disabled={!active && usageLimits.loading}
                        className="h-11 w-11 shrink-0 rounded-full p-0"
                        aria-label="Run search"
                      >
                        <Search className="size-4" />
                      </Button>
                    </div>
                  </form>

                  {!active && (
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
                      <span className="rounded-full bg-muted px-3 py-1">
                        {usageLimits.remaining.search} searches left this week
                      </span>
                      <span className="rounded-full bg-muted px-3 py-1">
                        {usageLimits.remaining.location} nearby uses left this week
                      </span>
                      <SubscribeButton
                        checkingOut={checkingOut}
                        onClick={startCheckout}
                        label={priceLabel}
                      />
                    </div>
                  )}

                  {active && (
                    <div className="text-xs font-black uppercase text-primary">
                      Subscriber: unlimited search, nearby, and hit reveals
                    </div>
                  )}
                </div>
              )}

              {limitNotice && !active && (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3">
                  <p className="text-sm font-semibold text-foreground">{limitNotice}</p>
                  <SubscribeButton
                    checkingOut={checkingOut}
                    onClick={startCheckout}
                    label="Upgrade"
                  />
                </div>
              )}
            </div>
          </header>

          <div
            className="text-center text-sm font-semibold text-muted-foreground transition-all duration-200 overflow-hidden"
            style={{ height: activeView === "feed" && (pullY > 0 || refreshing) ? 40 : 0 }}
          >
            <div className="py-2">
              {refreshing ? "Refreshing…" : pullY > 70 ? "Release to refresh" : "Pull to refresh"}
            </div>
          </div>

          {activeView === "feed" && (
            <main className="mx-auto max-w-md space-y-4 px-3 py-4 sm:max-w-2xl sm:px-4 sm:py-6">
              {feedLoading && posts.length === 0 && (
                <div className="py-20 text-center text-muted-foreground">Loading the feed...</div>
              )}

              {!feedLoading && filtered.length === 0 && (
                <div className="rounded-2xl border border-border bg-card px-5 py-16 text-center">
                  <p className="mb-2 font-display text-3xl font-bold">
                    {posts.length === 0 ? "No posts yet" : "Nothing matches"}
                  </p>

                  <p className="text-sm text-muted-foreground">
                    {posts.length === 0
                      ? "Post another registered user to start the main feed."
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
          )}

          {activeView === "dating" && (
            <DatingSection
              currentUserId={user.id}
              currentGender={gender}
              active={active}
              checkingOut={checkingOut}
              priceLabel={priceLabel}
              startCheckout={startCheckout}
              onMatchesChanged={() => setMatchesRefreshKey((key) => key + 1)}
            />
          )}

          {activeView === "matches" && (
            <MatchesSection
              currentUserId={user.id}
              currentGender={gender}
              refreshKey={matchesRefreshKey}
            />
          )}

          {activeView === "profile" && <ProfileSection currentUserId={user.id} />}
        </div>
      )}
    </PaymentGate>
  );
}
