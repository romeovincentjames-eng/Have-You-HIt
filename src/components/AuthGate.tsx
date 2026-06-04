import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const ADULT_CONFIRMATION = "confirmed_18_plus";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function AuthGate() {
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);

  async function saveAdultConfirmation(userId: string) {
    const { error } = await supabase
      .from("profiles")
      .update({ gender: ADULT_CONFIRMATION })
      .eq("id", userId);

    if (error) {
      toast.error("Signed in, but the 18+ confirmation could not be saved yet.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (mode === "signup" && !adultConfirmed) {
      toast.error("Please confirm you are 18 or older before entering.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName || email.split("@")[0],
              confirmed_18_plus: true,
              confirmed_18_plus_at: new Date().toISOString(),
            },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;
        if (data.user && data.session) {
          await saveAdultConfirmation(data.user.id);
        }
        toast.success("Welcome to the group chat 💅");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Something went wrong"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display text-5xl sm:text-6xl font-black text-primary leading-[0.95]">
            Have You Hit
          </h1>
          <p className="mt-4 text-lg font-black uppercase leading-tight text-primary">
            This is in protest of the Tea app
          </p>
          <p className="mt-3 text-muted-foreground">
            Post a pic. Hit or Not Hit? Green flags, red flags, and the receipts.
          </p>
        </div>
        <div className="rounded-3xl bg-card border border-border p-6 shadow-xl shadow-primary/10">
          <div className="flex gap-2 mb-6 rounded-full bg-muted p-1">
            {(["signup", "signin"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-full py-2 text-sm font-semibold transition ${
                  mode === m ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
                }`}
              >
                {m === "signup" ? "Join the chat" : "Sign in"}
              </button>
            ))}
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <Label htmlFor="name">Display name</Label>
                <Input
                  id="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="bestie"
                  maxLength={40}
                />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {mode === "signup" && (
              <label className="flex items-start gap-3 rounded-2xl border-2 border-primary bg-primary/10 p-4 cursor-pointer">
                <Checkbox
                  checked={adultConfirmed}
                  onCheckedChange={(value) => setAdultConfirmed(value === true)}
                  className="mt-1 size-5"
                  aria-label="Confirm you are 18 years old or older"
                />

                <span>
                  <span className="flex items-center gap-2 text-primary">
                    <ShieldCheck className="size-5 shrink-0" />
                    <span className="text-xl font-black uppercase leading-tight">
                      I confirm I am 18 years old or older
                    </span>
                  </span>
                  <span className="mt-2 block text-sm font-semibold text-foreground">
                    I understand this app is for adults only.
                  </span>
                </span>
              </label>
            )}

            <Button
              type="submit"
              disabled={loading || (mode === "signup" && !adultConfirmed)}
              className="w-full rounded-full h-11 text-base font-semibold"
            >
              {loading ? "..." : mode === "signup" ? "Start hitting" : "Let me in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
