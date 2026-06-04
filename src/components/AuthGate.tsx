import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AgeVerificationGate } from "@/components/AgeVerificationGate";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CommunityGuidelinesList } from "@/components/CommunityGuidelines";
import { ADULT_CONFIRMATION, type AgeVerificationResult } from "@/lib/age-verification";
import { COMMUNITY_GUIDELINES_VERSION } from "@/lib/community-guidelines";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function AuthGate() {
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [guidelinesOpened, setGuidelinesOpened] = useState(false);
  const [guidelinesExpanded, setGuidelinesExpanded] = useState(false);
  const [guidelinesAgreed, setGuidelinesAgreed] = useState(false);
  const [showIdCheck, setShowIdCheck] = useState(false);
  const [loading, setLoading] = useState(false);

  function toggleGuidelines() {
    setGuidelinesOpened(true);
    setGuidelinesExpanded((current) => !current);
  }

  async function saveSignupConfirmations(
    userId: string,
    agreedAt: string,
    verification: AgeVerificationResult,
  ) {
    const { error } = await supabase
      .from("profiles")
      .update({
        gender: ADULT_CONFIRMATION,
        community_guidelines_agreed_at: agreedAt,
        community_guidelines_version: COMMUNITY_GUIDELINES_VERSION,
        age_verified_at: verification.verifiedAt,
        age_verification_method: verification.method,
      })
      .eq("id", userId);

    if (error) {
      toast.error("Signed in, but your confirmations could not be saved yet.");
    }
  }

  function startSignup() {
    if (!guidelinesOpened) {
      toast.error("Please open the Community Guidelines before entering.");
      return;
    }

    if (!guidelinesAgreed) {
      toast.error("Please agree to the Community Guidelines before entering.");
      return;
    }

    setShowIdCheck(true);
  }

  async function createAccountAfterAgeCheck(verification: AgeVerificationResult) {
    setLoading(true);
    try {
      const agreedAt = new Date().toISOString();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName || email.split("@")[0],
            confirmed_18_plus: true,
            confirmed_18_plus_at: verification.verifiedAt,
            age_verified_at: verification.verifiedAt,
            age_verification_method: verification.method,
            community_guidelines_agreed: true,
            community_guidelines_agreed_at: agreedAt,
            community_guidelines_version: COMMUNITY_GUIDELINES_VERSION,
          },
          emailRedirectTo: `${window.location.origin}/`,
        },
      });
      if (error) throw error;
      if (data.user && data.session) {
        await saveSignupConfirmations(data.user.id, agreedAt, verification);
      }
      toast.success("Welcome to the group chat");
    } catch (err) {
      toast.error(getErrorMessage(err, "Something went wrong"));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (mode === "signup") {
      startSignup();
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err) {
      toast.error(getErrorMessage(err, "Something went wrong"));
    } finally {
      setLoading(false);
    }
  }

  if (showIdCheck && mode === "signup") {
    return (
      <AgeVerificationGate
        title="Scan your ID"
        body="Before your account is created, verify that you are 18 or older."
        actionLabel="Create my account"
        busy={loading}
        onBack={() => setShowIdCheck(false)}
        onVerified={createAccountAfterAgeCheck}
      />
    );
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
              <div className="border-y border-border py-3">
                <button
                  type="button"
                  onClick={toggleGuidelines}
                  aria-expanded={guidelinesExpanded}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl px-1 py-2 text-left text-primary"
                >
                  <span>
                    <span className="block text-xs font-black uppercase">Community Guidelines</span>
                    <span className="mt-1 block text-sm font-semibold text-foreground">
                      Open and read before joining.
                    </span>
                  </span>
                  <ChevronDown
                    className={`size-5 shrink-0 transition-transform ${
                      guidelinesExpanded ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {guidelinesExpanded && <CommunityGuidelinesList compact className="mt-2" />}
              </div>
            )}

            {mode === "signup" && (
              <label
                className={`flex items-start gap-3 rounded-2xl border-2 p-4 ${
                  guidelinesOpened
                    ? "cursor-pointer border-primary bg-primary/10"
                    : "cursor-not-allowed border-border bg-muted/60 opacity-70"
                }`}
              >
                <Checkbox
                  checked={guidelinesAgreed}
                  disabled={!guidelinesOpened}
                  onCheckedChange={(value) => setGuidelinesAgreed(value === true)}
                  className="mt-1 size-5"
                  aria-label="Agree to follow the Community Guidelines"
                />

                <span>
                  <span className="text-xl font-black uppercase leading-tight text-primary">
                    I agree to follow the Community Guidelines
                  </span>
                  <span className="mt-2 block text-sm font-semibold text-foreground">
                    {guidelinesOpened
                      ? "I will keep posts factual, private, respectful, clean, and 18+."
                      : "Open the guidelines above before checking this."}
                  </span>
                </span>
              </label>
            )}

            <Button
              type="submit"
              disabled={loading || (mode === "signup" && (!guidelinesOpened || !guidelinesAgreed))}
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
