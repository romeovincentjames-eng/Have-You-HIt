import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Flame, X, Flag, MessageCircle, Send, Trash2, MapPin } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Post = {
  id: string;
  user_id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
  subject_name: string;
  location_name: string | null;
};
type Profile = { id: string; display_name: string };
type Vote = { vote: "hit" | "not_hit"; user_id: string };
type Flagg = { flag: "green" | "red"; user_id: string };
type Comment = { id: string; user_id: string; body: string; created_at: string };

export function PostCard({
  post,
  currentUserId,
  authorName,
  onDeleted,
}: {
  post: Post;
  currentUserId: string;
  authorName: string;
  onDeleted: () => void;
}) {
  const [votes, setVotes] = useState<Vote[]>([]);
  const [flags, setFlags] = useState<Flagg[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commenters, setCommenters] = useState<Record<string, string>>({});
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState("");

  async function load() {
    const [
      { data: v, error: voteError },
      { data: f, error: flagError },
      { data: c, error: commentError },
    ] = await Promise.all([
      supabase.from("votes").select("vote,user_id").eq("post_id", post.id),
      supabase.from("flags").select("flag,user_id").eq("post_id", post.id),
      supabase
        .from("comments")
        .select("id,user_id,body,created_at")
        .eq("post_id", post.id)
        .order("created_at"),
    ]);

    const error = voteError || flagError || commentError;
    if (error) {
      toast.error(error.message);
      return;
    }

    setVotes((v as Vote[]) ?? []);
    setFlags((f as Flagg[]) ?? []);
    const cs = (c as Comment[]) ?? [];
    setComments(cs);
    const ids = Array.from(new Set(cs.map((x) => x.user_id)));
    if (ids.length) {
      const { data: profs, error: profilesError } = await supabase
        .from("profiles")
        .select("id,display_name")
        .in("id", ids);
      if (profilesError) {
        toast.error(profilesError.message);
        return;
      }

      const map: Record<string, string> = {};
      (profs as Profile[] | null)?.forEach((p) => (map[p.id] = p.display_name));
      setCommenters(map);
    }
  }

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [post.id]);

  const myVote = votes.find((v) => v.user_id === currentUserId)?.vote;
  const myFlag = flags.find((f) => f.user_id === currentUserId)?.flag;
  const hits = votes.filter((v) => v.vote === "hit").length;
  const misses = votes.filter((v) => v.vote === "not_hit").length;
  const greens = flags.filter((f) => f.flag === "green").length;
  const reds = flags.filter((f) => f.flag === "red").length;
  const total = hits + misses;
  const hitPct = total ? Math.round((hits / total) * 100) : 0;

  async function vote(v: "hit" | "not_hit") {
    const request =
      myVote === v
        ? supabase.from("votes").delete().eq("post_id", post.id).eq("user_id", currentUserId)
        : supabase
            .from("votes")
            .upsert(
              { post_id: post.id, user_id: currentUserId, vote: v },
              { onConflict: "post_id,user_id" },
            );

    const { error } = await request;
    if (error) {
      toast.error(error.message);
      return;
    }

    load();
  }
  async function flag(f: "green" | "red") {
    const request =
      myFlag === f
        ? supabase.from("flags").delete().eq("post_id", post.id).eq("user_id", currentUserId)
        : supabase
            .from("flags")
            .upsert(
              { post_id: post.id, user_id: currentUserId, flag: f },
              { onConflict: "post_id,user_id" },
            );

    const { error } = await request;
    if (error) {
      toast.error(error.message);
      return;
    }

    load();
  }
  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    const body = newComment.trim();
    if (!body) return;
    const { error } = await supabase
      .from("comments")
      .insert({ post_id: post.id, user_id: currentUserId, body });
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewComment("");
    load();
  }
  async function delComment(id: string) {
    const { error } = await supabase.from("comments").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }

    load();
  }
  async function deletePost() {
    if (!confirm("Delete this post?")) return;
    const { error } = await supabase.from("posts").delete().eq("id", post.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Deleted");
    onDeleted();
  }

  return (
    <article className="bg-card rounded-3xl overflow-hidden border border-border shadow-xl shadow-primary/5">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4">
        <div>
          <p className="font-semibold text-sm">@{authorName}</p>
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
          </p>
        </div>
        {post.user_id === currentUserId && (
          <button
            onClick={deletePost}
            className="text-muted-foreground hover:text-destructive p-2 rounded-full"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>

      {/* Image */}
      <div className="relative mt-3 bg-muted">
        <img
          src={post.image_url}
          alt={post.subject_name || post.caption || "post"}
          className="w-full aspect-[4/5] object-cover"
        />
        <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2">
          <div className="bg-background/90 backdrop-blur rounded-full px-3 py-1 text-sm font-bold truncate max-w-[70%]">
            {post.subject_name || "Unknown"}
          </div>
          {total > 0 && (
            <div className="bg-background/90 backdrop-blur rounded-full px-3 py-1 text-xs font-bold shrink-0">
              {hitPct}% Hit
            </div>
          )}
        </div>
        {post.location_name && (
          <div className="absolute bottom-3 left-3 bg-background/90 backdrop-blur rounded-full px-3 py-1 text-xs font-medium flex items-center gap-1 max-w-[90%] truncate">
            <MapPin className="size-3 shrink-0" />{" "}
            <span className="truncate">{post.location_name}</span>
          </div>
        )}
      </div>

      {/* Caption */}
      {post.caption && <p className="px-5 pt-4 text-[15px] leading-relaxed">{post.caption}</p>}

      {/* Verdict buttons */}
      <div className="px-5 pt-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => vote("hit")}
          className={`rounded-2xl py-3 font-bold text-sm flex items-center justify-center gap-2 transition ${
            myVote === "hit"
              ? "bg-hit text-hit-foreground shadow-lg shadow-hit/40"
              : "bg-muted hover:bg-accent"
          }`}
        >
          <Flame className="size-4" /> Hit · {hits}
        </button>
        <button
          onClick={() => vote("not_hit")}
          className={`rounded-2xl py-3 font-bold text-sm flex items-center justify-center gap-2 transition ${
            myVote === "not_hit" ? "bg-miss text-miss-foreground" : "bg-muted hover:bg-accent"
          }`}
        >
          <X className="size-4" /> Not Hit · {misses}
        </button>
      </div>

      {/* Flags */}
      <div className="px-5 pt-2 grid grid-cols-2 gap-2">
        <button
          onClick={() => flag("green")}
          className={`rounded-2xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition ${
            myFlag === "green" ? "bg-[var(--green-flag)] text-white" : "bg-muted hover:bg-accent"
          }`}
        >
          <Flag className="size-4 fill-current" /> Green · {greens}
        </button>
        <button
          onClick={() => flag("red")}
          className={`rounded-2xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition ${
            myFlag === "red" ? "bg-[var(--red-flag)] text-white" : "bg-muted hover:bg-accent"
          }`}
        >
          <Flag className="size-4 fill-current" /> Red · {reds}
        </button>
      </div>

      {/* Comments toggle */}
      <button
        onClick={() => setShowComments((s) => !s)}
        className="mt-3 px-5 pb-1 text-sm text-muted-foreground hover:text-foreground flex items-center gap-2 w-full"
      >
        <MessageCircle className="size-4" />
        {comments.length} {comments.length === 1 ? "comment" : "comments"}
      </button>

      {/* Comments */}
      {showComments && (
        <div className="px-5 pb-5 pt-2 space-y-3">
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {comments.map((c) => (
              <div
                key={c.id}
                className="bg-muted/60 rounded-2xl px-3 py-2 text-sm flex justify-between gap-2"
              >
                <div>
                  <span className="font-semibold">@{commenters[c.user_id] ?? "someone"}</span>{" "}
                  <span>{c.body}</span>
                </div>
                {c.user_id === currentUserId && (
                  <button
                    onClick={() => delComment(c.id)}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <Trash2 className="size-3" />
                  </button>
                )}
              </div>
            ))}
            {comments.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">
                Be the first to comment
              </p>
            )}
          </div>
          <form onSubmit={addComment} className="flex gap-2 pt-1">
            <Input
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment…"
              maxLength={500}
              className="rounded-full bg-muted border-0"
            />
            <Button
              type="submit"
              size="icon"
              className="rounded-full shrink-0"
              disabled={!newComment.trim()}
            >
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      )}
    </article>
  );
}
