import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CreditCard, Lock, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import {
  createCheckoutSession,
  getMyMembership,
  syncCheckoutSession,
} from "@/functions/billing.functions";
import { isMembershipActive, type MembershipSummary } from "@/lib/membership";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type PaymentGateProps = {
  children: ReactNode;
  onActive: () => void;
  userEmail?: string | null;
};

const priceLabel = import.meta.env.VITE_MEMBERSHIP_PRICE_LABEL || "$4.99";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function PaymentGate({ children, onActive, userEmail }: PaymentGateProps) {
  const [membership, setMembership] = useState<MembershipSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const active = useMemo(() => isMembershipActive(membership), [membership]);

  const loadMembership = useCallback(async () => {
    setLoading(true);

    try {
      setMembership(await getMyMembership());
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not check membership"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembership();
  }, [loadMembership]);

  useEffect(() => {
    if (active) onActive();
  }, [active, onActive]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    const sessionId = params.get("session_id");

    if (checkout === "cancelled") {
      toast.message("Checkout cancelled");
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    if (checkout !== "success" || !sessionId) return;
    const checkoutSessionId = sessionId;

    async function syncPayment() {
      setSyncing(true);

      try {
        const updated = await syncCheckoutSession({ data: { sessionId: checkoutSessionId } });
        setMembership(updated);
        toast.success("Membership unlocked");
        window.history.replaceState({}, "", window.location.pathname);
      } catch (err) {
        toast.error(getErrorMessage(err, "Could not confirm payment yet"));
      } finally {
        setSyncing(false);
      }
    }

    syncPayment();
  }, []);

  async function startCheckout() {
    setCheckingOut(true);

    try {
      const { url } = await createCheckoutSession({ data: { origin: window.location.origin } });
      window.location.assign(url);
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not start checkout"));
      setCheckingOut(false);
    }
  }

  if (loading || syncing) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center text-muted-foreground">
          <RefreshCw className="size-6 animate-spin mx-auto mb-3" />
          {syncing ? "Confirming payment..." : "Checking membership..."}
        </div>
      </div>
    );
  }

  if (active) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl bg-card border border-border p-7 shadow-xl shadow-primary/10">
        <div className="size-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-5">
          <Lock className="size-7" />
        </div>

        <h1 className="font-display text-4xl font-black leading-tight mb-3">Paid members only</h1>
        <p className="text-muted-foreground mb-6">
          Unlock Have You Hit to post pics, vote, flag, and join the comments.
        </p>

        <div className="rounded-2xl bg-muted/60 p-4 mb-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">Have You Hit access</p>
              <p className="text-xs text-muted-foreground">Secure checkout powered by Stripe</p>
            </div>
            <p className="font-display text-3xl font-black text-primary">{priceLabel}</p>
          </div>
        </div>

        <div className="space-y-2 mb-6 text-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-green-flag" />
            <span>Feed, uploads, votes, flags, and comments</span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-green-flag" />
            <span>Payment confirmation stays on the server</span>
          </div>
        </div>

        <Button
          type="button"
          onClick={startCheckout}
          disabled={checkingOut}
          className="w-full rounded-full h-12 gap-2 font-semibold"
        >
          {checkingOut ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : (
            <CreditCard className="size-4" />
          )}
          {checkingOut ? "Opening checkout..." : "Unlock access"}
        </Button>

        {userEmail && (
          <p className="text-center text-xs text-muted-foreground mt-4">Signed in as {userEmail}</p>
        )}

        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="w-full mt-4 text-xs text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5"
        >
          <LogOut className="size-3" />
          Sign out
        </button>
      </div>
    </div>
  );
}
