import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";
import { Grid2X2, Heart, ImageIcon, MapPin, RefreshCw, UserCircle } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type AppProfile = {
  id: string;
  display_name: string;
  gender: string | null;
};

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

type FeedPost = {
  id: string;
  user_id: string;
  target_user_id: string | null;
  image_url: string;
  caption: string | null;
  created_at: string;
  subject_name: string;
  location_name: string | null;
};

type ProfileName = {
  id: string;
  display_name: string;
};

type ProfileItem = {
  id: string;
  image_url: string;
  title: string;
  subtitle: string;
  caption: string | null;
  location_name: string | null;
  created_at: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function UserProfilePanel({
  userId,
  currentUserId,
  dialog = false,
}: {
  userId: string;
  currentUserId?: string;
  dialog?: boolean;
}) {
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [datingProfile, setDatingProfile] = useState<DatingProfile | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({});
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const [
        { data: profileData, error: profileError },
        { data: datingData, error: datingError },
        { data: postData, error: postsError },
      ] = await Promise.all([
        supabase.from("profiles").select("id,display_name,gender").eq("id", userId).maybeSingle(),
        supabase.from("dating_profiles").select("*").eq("user_id", userId).maybeSingle(),
        supabase
          .from("posts")
          .select("id,user_id,target_user_id,image_url,caption,created_at,subject_name,location_name")
          .or(`user_id.eq.${userId},target_user_id.eq.${userId}`)
          .order("created_at", { ascending: false })
          .limit(120),
      ]);

      const error = profileError || datingError || postsError;
      if (error) throw error;

      const nextPosts = (postData as FeedPost[] | null) ?? [];
      const authorIds = Array.from(new Set(nextPosts.map((post) => post.user_id)));
      const nextAuthorNames: Record<string, string> = {};

      if (authorIds.length) {
        const { data: authors, error: authorsError } = await supabase
          .from("profiles")
          .select("id,display_name")
          .in("id", authorIds);

        if (authorsError) throw authorsError;

        (authors as ProfileName[] | null)?.forEach((author) => {
          nextAuthorNames[author.id] = author.display_name;
        });
      }

      setProfile((profileData as AppProfile | null) ?? null);
      setDatingProfile((datingData as DatingProfile | null) ?? null);
      setPosts(nextPosts);
      setAuthorNames(nextAuthorNames);
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not load this profile"));
      setProfile(null);
      setDatingProfile(null);
      setPosts([]);
      setAuthorNames({});
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const displayName = profile?.display_name ?? "someone";
  const ownProfile = currentUserId === userId;

  const items = useMemo<ProfileItem[]>(() => {
    const datingItem = datingProfile
      ? [
          {
            id: `dating-${datingProfile.user_id}`,
            image_url: datingProfile.image_url,
            title: "Dating post",
            subtitle: datingProfile.location_name ?? "Self-post",
            caption: datingProfile.bio,
            location_name: datingProfile.location_name,
            created_at: datingProfile.updated_at,
          },
        ]
      : [];

    const feedItems = posts.map((post) => {
      const authoredByProfile = post.user_id === userId;
      const authorName = authorNames[post.user_id] ?? "someone";

      return {
        id: post.id,
        image_url: post.image_url,
        title: post.subject_name ? `@${post.subject_name}` : "Have You Hit post",
        subtitle: authoredByProfile ? `Posted by @${displayName}` : `Tagged by @${authorName}`,
        caption: post.caption,
        location_name: post.location_name,
        created_at: post.created_at,
      };
    });

    return [...datingItem, ...feedItems];
  }, [authorNames, datingProfile, displayName, posts, userId]);

  useEffect(() => {
    setSelectedItemId((current) => {
      if (current && items.some((item) => item.id === current)) return current;
      return items[0]?.id ?? null;
    });
  }, [items]);

  const selectedItem = items.find((item) => item.id === selectedItemId) ?? items[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted text-muted-foreground">
            {datingProfile ? (
              <img src={datingProfile.image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserCircle className="size-8" />
            )}
          </div>

          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-primary">
              {ownProfile ? "Your profile" : "Profile"}
            </p>
            <h2 className="truncate font-display text-3xl font-black leading-none">@{displayName}</h2>
          </div>
        </div>

        <Button variant="ghost" size="icon" onClick={load} className="shrink-0 rounded-full" aria-label="Refresh profile">
          {loading ? <RefreshCw className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        </Button>
      </div>

      {loading && items.length === 0 && (
        <div className="rounded-2xl border border-border bg-card py-16 text-center text-sm text-muted-foreground">
          Loading profile...
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="rounded-2xl border border-border bg-card px-5 py-16 text-center">
          <ImageIcon className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="font-display text-2xl font-bold">No posts yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {ownProfile ? "Your posts will show up here." : "This profile has no posts yet."}
          </p>
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-1.5">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedItemId(item.id)}
                className={`relative overflow-hidden rounded-lg bg-muted ring-offset-background transition ${
                  selectedItem?.id === item.id ? "ring-2 ring-primary ring-offset-2" : ""
                }`}
              >
                <img src={item.image_url} alt={item.title} className="aspect-square w-full object-cover" />
              </button>
            ))}
          </div>

          {selectedItem && (
            <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="relative bg-muted">
                <img
                  src={selectedItem.image_url}
                  alt={selectedItem.title}
                  className="aspect-[4/5] w-full object-cover"
                />
                <div className="absolute left-3 top-3 max-w-[calc(100%-1.5rem)] rounded-full bg-background/90 px-3 py-1 text-xs font-black backdrop-blur">
                  {selectedItem.title}
                </div>
              </div>

              <div className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">{selectedItem.subtitle}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(selectedItem.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  {selectedItem.id.startsWith("dating-") && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-black uppercase text-primary">
                      <Heart className="size-3" />
                      Dating
                    </span>
                  )}
                </div>

                {selectedItem.caption && <p className="text-sm leading-relaxed">{selectedItem.caption}</p>}

                {selectedItem.location_name && (
                  <p className="flex min-w-0 items-center gap-1 text-xs font-semibold text-muted-foreground">
                    <MapPin className="size-3 shrink-0" />
                    <span className="truncate">{selectedItem.location_name}</span>
                  </p>
                )}
              </div>
            </article>
          )}
        </>
      )}

      {!dialog && (
        <div className="flex items-center gap-2 text-xs font-black uppercase text-primary">
          <Grid2X2 className="size-4" />
          {items.length} {items.length === 1 ? "post" : "posts"}
        </div>
      )}
    </div>
  );
}

export function UserProfileDialog({
  userId,
  currentUserId,
  trigger,
}: {
  userId: string;
  currentUserId?: string;
  trigger: ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92svh] max-w-[calc(100vw-1rem)] rounded-2xl p-4 sm:max-w-md sm:p-6">
        <DialogHeader>
          <DialogTitle className="sr-only">Profile</DialogTitle>
        </DialogHeader>
        <UserProfilePanel userId={userId} currentUserId={currentUserId} dialog />
      </DialogContent>
    </Dialog>
  );
}

export function ProfileSection({ currentUserId }: { currentUserId: string }) {
  return (
    <main className="mx-auto w-full max-w-md px-3 py-4 sm:max-w-2xl sm:px-4 sm:py-6">
      <UserProfilePanel userId={currentUserId} currentUserId={currentUserId} />
    </main>
  );
}
