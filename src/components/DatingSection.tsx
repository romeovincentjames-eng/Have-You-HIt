import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Heart, ImagePlus, Loader2, MapPin, RefreshCw, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SubscribeButton } from "@/components/PaymentGate";

type DatingProfile = {
  user_id: string;
  image_url: string;
  bio: string | null;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  created_at: string;
  updated_at: string;
};

type ProfileName = {
  id: string;
  display_name: string;
};

type DatingVote = {
  target_user_id: string;
  vote: "hit" | "not_hit";
};

type InboundHit = {
  voter_id: string;
};

type Loc = { lat: number; lng: number; label: string | null };

const IMAGE_FILE_NAME = /\.(avif|gif|heic|heif|jpe?g|png|webp)$/i;

function safeRandomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return "id-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

function isImageFile(file: File) {
  return file.type.startsWith("image/") || IMAGE_FILE_NAME.test(file.name);
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function reverseGeocode(lat: number, lng: number) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`,
      { headers: { Accept: "application/json" } },
    );
    const json = await response.json();
    const address = json.address ?? {};

    return (
      [address.city || address.town || address.village || address.suburb, address.state, address.country]
        .filter(Boolean)
        .join(", ") ||
      json.display_name ||
      null
    );
  } catch {
    return null;
  }
}

function SelfProfileDialog({
  currentUserId,
  currentProfile,
  onSaved,
}: {
  currentUserId: string;
  currentProfile: DatingProfile | null;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [loc, setLoc] = useState<Loc | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;

    setFile(null);
    setPreview(currentProfile?.image_url ?? null);
    setBio(currentProfile?.bio ?? "");
    setLoc(
      currentProfile?.latitude != null && currentProfile.longitude != null
        ? {
            lat: currentProfile.latitude,
            lng: currentProfile.longitude,
            label: currentProfile.location_name,
          }
        : null,
    );

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [currentProfile, open]);

  function pick(nextFile: File | null) {
    if (!nextFile) {
      setFile(null);
      setPreview(currentProfile?.image_url ?? null);
      return;
    }

    if (!isImageFile(nextFile)) {
      toast.error("Choose an image file.");
      return;
    }

    if (nextFile.size > 8 * 1024 * 1024) {
      toast.error("Keep it under 8MB.");
      return;
    }

    setFile(nextFile);

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setPreview(reader.result);
      }
    };
    reader.onerror = () => toast.error("Preview could not load. Choose another photo.");
    reader.readAsDataURL(nextFile);
  }

  async function tagLocation() {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported");
      return;
    }

    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const label = await reverseGeocode(lat, lng);

        setLoc({ lat, lng, label });
        setLocLoading(false);
        toast.success(label ? `Tagged: ${label}` : "Location tagged");
      },
      (err) => {
        setLocLoading(false);
        toast.error(err.message || "Could not get location");
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  async function saveProfile() {
    if (!file && !currentProfile?.image_url) {
      toast.error("Add a photo of yourself first.");
      return;
    }

    setSaving(true);

    try {
      let imageUrl = currentProfile?.image_url ?? "";

      if (file) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `dating/${currentUserId}/${safeRandomId()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("photos").upload(path, file, {
          ...(file.type ? { contentType: file.type } : {}),
          upsert: false,
        });

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("photos").getPublicUrl(path);
        imageUrl = publicUrl;
      }

      const { error } = await supabase.from("dating_profiles").upsert(
        {
          user_id: currentUserId,
          image_url: imageUrl,
          bio: bio.trim() || null,
          latitude: loc?.lat ?? null,
          longitude: loc?.lng ?? null,
          location_name: loc?.label ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

      if (error) throw error;

      toast.success(currentProfile ? "Dating profile updated" : "Dating profile posted");
      setOpen(false);
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not save dating profile"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-10 rounded-full gap-2 px-4 text-sm font-semibold">
          <ImagePlus className="size-4" />
          {currentProfile ? "Update self post" : "Post yourself"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92svh] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Dating post</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block">
            <div className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-muted/60">
              {preview ? (
                <img src={preview} alt="Your dating profile preview" className="h-full w-full object-cover" />
              ) : (
                <div className="px-4 text-center text-muted-foreground">
                  <Upload className="mx-auto mb-2 size-8" />
                  <p className="text-sm font-semibold">Choose your profile photo</p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => pick(event.target.files?.[0] ?? null)}
            />
          </label>

          <Textarea
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            maxLength={500}
            rows={4}
            placeholder="A little about you..."
            className="resize-none rounded-2xl"
          />

          <Button
            type="button"
            variant="outline"
            onClick={tagLocation}
            disabled={locLoading}
            className="h-10 w-full rounded-full gap-2"
          >
            {locLoading ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
            {loc ? (loc.label ?? `${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)}`) : "Tag profile location"}
          </Button>

          <Button onClick={saveProfile} disabled={saving} className="h-11 w-full rounded-full font-semibold">
            {saving ? "Saving..." : "Save dating post"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DatingSection({
  currentUserId,
  active,
  checkingOut,
  priceLabel,
  startCheckout,
  onMatchesChanged,
}: {
  currentUserId: string;
  active: boolean;
  checkingOut: boolean;
  priceLabel: string;
  startCheckout: () => Promise<void>;
  onMatchesChanged: () => void;
}) {
  const [myProfile, setMyProfile] = useState<DatingProfile | null>(null);
  const [profiles, setProfiles] = useState<DatingProfile[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [myVotes, setMyVotes] = useState<Record<string, "hit" | "not_hit">>({});
  const [inboundHits, setInboundHits] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const [
        { data: ownProfile, error: ownError },
        { data: datingProfiles, error: profilesError },
        { data: votes, error: votesError },
        { data: hits, error: hitsError },
      ] = await Promise.all([
        supabase.from("dating_profiles").select("*").eq("user_id", currentUserId).maybeSingle(),
        supabase
          .from("dating_profiles")
          .select("*")
          .neq("user_id", currentUserId)
          .order("updated_at", { ascending: false })
          .limit(80),
        supabase.from("dating_votes").select("target_user_id,vote").eq("voter_id", currentUserId),
        supabase
          .from("dating_votes")
          .select("voter_id")
          .eq("target_user_id", currentUserId)
          .eq("vote", "hit"),
      ]);

      const error = ownError || profilesError || votesError || hitsError;
      if (error) throw error;

      const visibleProfiles = (datingProfiles as DatingProfile[] | null) ?? [];
      const incoming = ((hits as InboundHit[] | null) ?? []).map((hit) => hit.voter_id);
      const nameIds = Array.from(
        new Set([
          currentUserId,
          ...visibleProfiles.map((profile) => profile.user_id),
          ...incoming,
        ]),
      );

      const nextNames: Record<string, string> = {};
      if (nameIds.length) {
        const { data: profileNames, error: namesError } = await supabase
          .from("profiles")
          .select("id,display_name")
          .in("id", nameIds);

        if (namesError) throw namesError;

        (profileNames as ProfileName[] | null)?.forEach((profile) => {
          nextNames[profile.id] = profile.display_name;
        });
      }

      const nextVotes: Record<string, "hit" | "not_hit"> = {};
      ((votes as DatingVote[] | null) ?? []).forEach((vote) => {
        nextVotes[vote.target_user_id] = vote.vote;
      });

      setMyProfile((ownProfile as DatingProfile | null) ?? null);
      setProfiles(visibleProfiles);
      setNames(nextNames);
      setMyVotes(nextVotes);
      setInboundHits(incoming);
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not load dating profiles"));
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    load();
  }, [load]);

  const inboundNames = useMemo(
    () => inboundHits.map((id) => ({ id, name: names[id] ?? "someone" })),
    [inboundHits, names],
  );

  async function vote(targetUserId: string, voteValue: "hit" | "not_hit") {
    if (!myProfile) {
      toast.error("Post yourself first so matches have someone to hit back.");
      return;
    }

    try {
      const { error } = await supabase.from("dating_votes").upsert(
        {
          voter_id: currentUserId,
          target_user_id: targetUserId,
          vote: voteValue,
        },
        { onConflict: "voter_id,target_user_id" },
      );

      if (error) throw error;

      if (voteValue === "hit" && inboundHits.includes(targetUserId)) {
        toast.success("It is a match. Open Matches to message.");
        onMatchesChanged();
      } else {
        toast.success(voteValue === "hit" ? "Hit sent" : "Not hit saved");
      }

      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not save your vote"));
    }
  }

  return (
    <main className="mx-auto w-full max-w-md px-3 py-4 sm:max-w-2xl sm:px-4 sm:py-6">
      <section className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="h-20 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
              {myProfile ? (
                <img src={myProfile.image_url} alt="Your dating profile" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <Heart className="size-6" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase text-primary">Dating profile</p>
              <h2 className="mt-1 truncate font-display text-2xl font-black">
                {names[currentUserId] ?? "You"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {myProfile ? "People can vote on your self-post and match with you." : "Post yourself to start matching."}
              </p>
            </div>
          </div>

          {myProfile?.bio && <p className="mt-3 text-sm leading-relaxed">{myProfile.bio}</p>}
          {myProfile?.location_name && (
            <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <MapPin className="size-3" />
              <span className="truncate">{myProfile.location_name}</span>
            </p>
          )}

          <div className="mt-4">
            <SelfProfileDialog currentUserId={currentUserId} currentProfile={myProfile} onSaved={load} />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase text-primary">Who would hit</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {inboundHits.length} {inboundHits.length === 1 ? "person" : "people"} would hit you.
              </p>
            </div>
            {!active && (
              <SubscribeButton checkingOut={checkingOut} onClick={startCheckout} label={priceLabel} />
            )}
          </div>

          {active ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {inboundNames.length ? (
                inboundNames.map((profile) => (
                  <span key={profile.id} className="rounded-full bg-muted px-3 py-1 text-xs font-bold">
                    @{profile.name}
                  </span>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No hits yet.</p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm font-semibold text-foreground">
              Upgrade to reveal every profile that would hit you.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-black">People</h2>
          <Button variant="ghost" size="icon" onClick={load} className="rounded-full" aria-label="Refresh dating profiles">
            {loading ? <RefreshCw className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          </Button>
        </div>

        {loading && profiles.length === 0 && (
          <div className="rounded-2xl border border-border bg-card py-16 text-center text-sm text-muted-foreground">
            Loading dating profiles...
          </div>
        )}

        {!loading && profiles.length === 0 && (
          <div className="rounded-2xl border border-border bg-card px-5 py-16 text-center">
            <p className="font-display text-2xl font-bold">No self-posts yet</p>
            <p className="mt-2 text-sm text-muted-foreground">When people post themselves, they will show up here.</p>
          </div>
        )}

        {profiles.map((profile) => {
          const name = names[profile.user_id] ?? "someone";
          const myVote = myVotes[profile.user_id];
          const alreadyHitYou = active && inboundHits.includes(profile.user_id);

          return (
            <article key={profile.user_id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="relative bg-muted">
                <img src={profile.image_url} alt={`${name} dating profile`} className="w-full aspect-[4/5] object-cover" />
                <div className="absolute left-3 right-3 top-3 flex items-start justify-between gap-2">
                  <div className="min-w-0 rounded-full bg-background/90 px-3 py-1 text-sm font-bold backdrop-blur">
                    <span className="block truncate">@{name}</span>
                  </div>
                  {alreadyHitYou && (
                    <div className="shrink-0 rounded-full bg-primary px-3 py-1 text-xs font-black text-primary-foreground">
                      Hit you
                    </div>
                  )}
                </div>
                {profile.location_name && (
                  <div className="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] rounded-full bg-background/90 px-3 py-1 text-xs font-semibold backdrop-blur">
                    <span className="flex min-w-0 items-center gap-1">
                      <MapPin className="size-3 shrink-0" />
                      <span className="truncate">{profile.location_name}</span>
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-3 p-4">
                {profile.bio && <p className="text-sm leading-relaxed">{profile.bio}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => vote(profile.user_id, "hit")}
                    className={`min-h-11 rounded-full px-3 text-sm font-black transition ${
                      myVote === "hit"
                        ? "bg-hit text-hit-foreground shadow-lg shadow-hit/30"
                        : "bg-muted hover:bg-accent"
                    }`}
                  >
                    Hit
                  </button>
                  <button
                    type="button"
                    onClick={() => vote(profile.user_id, "not_hit")}
                    className={`min-h-11 rounded-full px-3 text-sm font-black transition ${
                      myVote === "not_hit"
                        ? "bg-miss text-miss-foreground"
                        : "bg-muted hover:bg-accent"
                    }`}
                  >
                    <span className="inline-flex items-center justify-center gap-1">
                      <X className="size-4" />
                      Not hit
                    </span>
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
