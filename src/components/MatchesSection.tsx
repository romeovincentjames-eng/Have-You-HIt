import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { MessageCircle, RefreshCw, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Match = {
  id: string;
  user_a_id: string;
  user_b_id: string;
  created_at: string;
};

type Message = {
  id: string;
  match_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type ProfileName = {
  id: string;
  display_name: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function MatchesSection({
  currentUserId,
  refreshKey,
}: {
  currentUserId: string;
  refreshKey: number;
}) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  const selectedMatch = useMemo(
    () => matches.find((match) => match.id === selectedMatchId) ?? null,
    [matches, selectedMatchId],
  );

  const otherUserId = selectedMatch
    ? selectedMatch.user_a_id === currentUserId
      ? selectedMatch.user_b_id
      : selectedMatch.user_a_id
    : null;

  const loadMatches = useCallback(async () => {
    setLoadingMatches(true);

    try {
      const { data, error } = await supabase
        .from("matches")
        .select("id,user_a_id,user_b_id,created_at")
        .or(`user_a_id.eq.${currentUserId},user_b_id.eq.${currentUserId}`)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const nextMatches = (data as Match[] | null) ?? [];
      const ids = Array.from(
        new Set(
          nextMatches.map((match) =>
            match.user_a_id === currentUserId ? match.user_b_id : match.user_a_id,
          ),
        ),
      );

      const nextNames: Record<string, string> = {};
      if (ids.length) {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id,display_name")
          .in("id", ids);

        if (profilesError) throw profilesError;

        (profiles as ProfileName[] | null)?.forEach((profile) => {
          nextNames[profile.id] = profile.display_name;
        });
      }

      setMatches(nextMatches);
      setNames(nextNames);
      setSelectedMatchId((current) => {
        if (current && nextMatches.some((match) => match.id === current)) return current;
        return nextMatches[0]?.id ?? null;
      });
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not load matches"));
    } finally {
      setLoadingMatches(false);
    }
  }, [currentUserId]);

  const loadMessages = useCallback(async () => {
    if (!selectedMatchId) {
      setMessages([]);
      return;
    }

    setLoadingMessages(true);

    try {
      const { data, error } = await supabase
        .from("match_messages")
        .select("id,match_id,sender_id,body,created_at")
        .eq("match_id", selectedMatchId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      setMessages((data as Message[] | null) ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not load messages"));
    } finally {
      setLoadingMessages(false);
    }
  }, [selectedMatchId]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches, refreshKey]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const body = draft.trim();
    if (!body || !selectedMatchId) return;

    setSending(true);

    try {
      const { error } = await supabase.from("match_messages").insert({
        match_id: selectedMatchId,
        sender_id: currentUserId,
        body,
      });

      if (error) throw error;

      setDraft("");
      await loadMessages();
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not send message"));
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-md px-3 py-4 sm:max-w-2xl sm:px-4 sm:py-6">
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase text-primary">Mutual hits</p>
            <h2 className="font-display text-3xl font-black">Matches</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={loadMatches} className="rounded-full" aria-label="Refresh matches">
            {loadingMatches ? <RefreshCw className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          </Button>
        </div>

        {loadingMatches && matches.length === 0 && (
          <div className="rounded-2xl border border-border bg-card py-16 text-center text-sm text-muted-foreground">
            Loading matches...
          </div>
        )}

        {!loadingMatches && matches.length === 0 && (
          <div className="rounded-2xl border border-border bg-card px-5 py-16 text-center">
            <MessageCircle className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="font-display text-2xl font-bold">No matches yet</p>
            <p className="mt-2 text-sm text-muted-foreground">
              When two people hit each other, their chat opens here.
            </p>
          </div>
        )}

        {matches.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-[15rem_1fr]">
            <div className="flex gap-2 overflow-x-auto pb-1 sm:block sm:space-y-2 sm:overflow-visible sm:pb-0">
              {matches.map((match) => {
                const otherId =
                  match.user_a_id === currentUserId ? match.user_b_id : match.user_a_id;
                const selected = match.id === selectedMatchId;

                return (
                  <button
                    key={match.id}
                    type="button"
                    onClick={() => setSelectedMatchId(match.id)}
                    className={`min-w-40 rounded-2xl border px-3 py-3 text-left transition sm:w-full ${
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card hover:bg-muted"
                    }`}
                  >
                    <span className="block truncate text-sm font-black">
                      @{names[otherId] ?? "someone"}
                    </span>
                    <span className={`mt-1 block text-xs ${selected ? "opacity-80" : "text-muted-foreground"}`}>
                      {formatDistanceToNow(new Date(match.created_at), { addSuffix: true })}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="rounded-2xl border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-black">@{otherUserId ? names[otherUserId] ?? "someone" : "Match"}</p>
                <p className="text-xs text-muted-foreground">Messages are available after a mutual hit.</p>
              </div>

              <div className="flex max-h-[55svh] min-h-72 flex-col">
                <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
                  {loadingMessages && (
                    <p className="py-8 text-center text-sm text-muted-foreground">Loading messages...</p>
                  )}

                  {!loadingMessages && messages.length === 0 && (
                    <p className="py-8 text-center text-sm text-muted-foreground">Start the chat.</p>
                  )}

                  {messages.map((message) => {
                    const mine = message.sender_id === currentUserId;

                    return (
                      <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm ${
                            mine
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground"
                          }`}
                        >
                          <p className="break-words">{message.body}</p>
                          <p className={`mt-1 text-[10px] ${mine ? "opacity-80" : "text-muted-foreground"}`}>
                            {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <form onSubmit={sendMessage} className="flex gap-2 border-t border-border p-3">
                  <Input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Write a message..."
                    maxLength={1000}
                    className="h-10 rounded-full bg-muted border-0"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!draft.trim() || sending || !selectedMatchId}
                    className="h-10 w-10 shrink-0 rounded-full"
                    aria-label="Send message"
                  >
                    <Send className="size-4" />
                  </Button>
                </form>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
