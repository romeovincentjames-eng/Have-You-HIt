import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Heart } from "lucide-react";

type Gender = "man" | "woman";

export function GenderGate({
  userId,
  onConfirmed,
}: {
  userId: string;
  onConfirmed: (gender: Gender) => void;
}) {
  const [gender, setGender] = useState<Gender | "">("");
  const [loading, setLoading] = useState(false);

  async function confirm() {
    if (gender !== "man" && gender !== "woman") return;

    setLoading(true);
    const { error } = await supabase
      .from("profiles")
      .update({ gender })
      .eq("id", userId);
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    onConfirmed(gender);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-card border border-border rounded-3xl p-8 shadow-xl shadow-primary/5">
        <div className="size-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
          <Heart className="size-7" />
        </div>
        <h1 className="font-display text-3xl font-black mb-2">Confirm your gender</h1>
        <p className="text-muted-foreground mb-6">
          Have You Hit is set up for men and women to match with each other only.
        </p>
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1 mb-5">
          {[
            { value: "man", label: "Man" },
            { value: "woman", label: "Woman" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setGender(option.value as Gender)}
              className={`h-11 rounded-xl text-sm font-black transition ${
                gender === option.value
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-muted-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <Button
          onClick={confirm}
          disabled={(gender !== "man" && gender !== "woman") || loading}
          className="w-full rounded-full h-12 font-semibold"
        >
          {loading ? "Saving..." : "Save and enter"}
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
