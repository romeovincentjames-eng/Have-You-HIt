import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CommunityGuidelinesIntro,
  CommunityGuidelinesList,
} from "@/components/CommunityGuidelines";
import { COMMUNITY_GUIDELINES_VERSION } from "@/lib/community-guidelines";
import { toast } from "sonner";

export function GuidelinesGate({
  userId,
  onConfirmed,
}: {
  userId: string;
  onConfirmed: (agreedAt: string) => void;
}) {
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);

  async function confirm() {
    if (!checked) return;

    const agreedAt = new Date().toISOString();

    setLoading(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        community_guidelines_agreed_at: agreedAt,
        community_guidelines_version: COMMUNITY_GUIDELINES_VERSION,
      })
      .eq("id", userId);
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    onConfirmed(agreedAt);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-card border border-border rounded-3xl p-6 shadow-xl shadow-primary/5">
        <CommunityGuidelinesIntro />

        <ScrollArea className="mt-5 max-h-[52vh] pr-3">
          <CommunityGuidelinesList />
        </ScrollArea>

        <label className="mt-5 flex items-start gap-3 rounded-2xl border-2 border-primary bg-primary/10 p-4 cursor-pointer">
          <Checkbox
            checked={checked}
            onCheckedChange={(value) => setChecked(value === true)}
            className="mt-1 size-5"
            aria-label="Agree to follow the community guidelines"
          />
          <span>
            <span className="block text-lg font-black uppercase leading-tight text-primary">
              I agree to follow the Community Guidelines
            </span>
            <span className="mt-1 block text-sm font-semibold text-foreground">
              I understand posts or comments that break these rules may be removed and can lead to
              account action.
            </span>
          </span>
        </label>

        <Button
          onClick={confirm}
          disabled={!checked || loading}
          className="mt-5 w-full rounded-full h-12 font-semibold"
        >
          {loading ? "Saving..." : "I agree"}
        </Button>

        <button
          onClick={() => supabase.auth.signOut()}
          className="w-full text-center mt-4 text-xs text-muted-foreground hover:text-foreground"
        >
          Not me - sign out
        </button>
      </div>
    </div>
  );
}
