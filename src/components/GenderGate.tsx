import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

export function GenderGate({ userId, onConfirmed }: { userId: string; onConfirmed: () => void }) {
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);

  async function confirm() {
    if (!checked) return;
    setLoading(true);
    const { error } = await supabase
      .from("profiles")
      .update({ gender: "confirmed_18_plus" })
      .eq("id", userId);
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    onConfirmed();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-card border border-border rounded-3xl p-8 shadow-xl shadow-primary/5">
        <div className="size-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
          <ShieldCheck className="size-7" />
        </div>
        <h1 className="font-display text-3xl font-black mb-2">18+ community</h1>
        <p className="text-muted-foreground mb-6">
          Confirm below to enter. This app is for adults only. Keep posts and comments respectful.
        </p>
        <label className="flex items-start gap-3 cursor-pointer bg-muted/60 rounded-2xl p-4 mb-5">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-1 size-5 accent-primary"
          />
          <span className="text-sm font-medium">
            I confirm I am at least 18 years old and agree to follow the community rules.
          </span>
        </label>
        <Button
          onClick={confirm}
          disabled={!checked || loading}
          className="w-full rounded-full h-12 font-semibold"
        >
          {loading ? "Verifying…" : "Enter Have You Hit"}
        </Button>
        <button
          onClick={() => supabase.auth.signOut()}
          className="w-full text-center mt-4 text-xs text-muted-foreground hover:text-foreground"
        >
          Not me — sign out
        </button>
      </div>
    </div>
  );
}
