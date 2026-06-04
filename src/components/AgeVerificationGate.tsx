import { Button } from "@/components/ui/button";
import { IdCard, Loader2, ShieldCheck } from "lucide-react";

export function AgeVerificationGate({
  title = "Verify your age",
  body = "Use secure ID verification before entering.",
  actionLabel = "Start secure ID check",
  busy = false,
  onStartIdentity,
  onSignOut,
}: {
  title?: string;
  body?: string;
  actionLabel?: string;
  busy?: boolean;
  onStartIdentity: () => Promise<void> | void;
  onSignOut?: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-card border border-border rounded-3xl p-6 shadow-xl shadow-primary/5">
        <div className="size-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
          <IdCard className="size-7" />
        </div>

        <h1 className="font-display text-3xl font-black mb-2">{title}</h1>
        <p className="text-muted-foreground mb-5">{body}</p>

        <div className="rounded-2xl bg-muted/60 p-4 mb-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                Third-party ID check powered by Stripe Identity
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Stripe checks the ID and date of birth. This app saves only the verification result.
              </p>
            </div>
          </div>
        </div>

        <Button
          type="button"
          onClick={onStartIdentity}
          disabled={busy}
          className="w-full rounded-full h-12 gap-2 font-semibold"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <IdCard className="size-4" />}
          {busy ? "Opening..." : actionLabel}
        </Button>

        {onSignOut && (
          <button
            onClick={onSignOut}
            disabled={busy}
            className="w-full text-center mt-4 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Not me - sign out
          </button>
        )}
      </div>
    </div>
  );
}
