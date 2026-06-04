import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CreditCard, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import {
  createCheckoutSession,
  getMyMembership,
  syncCheckoutSession,
} from "@/functions/billing.functions";
import { isMembershipActive, type MembershipSummary } from "@/lib/membership";

export type PaymentGateState = {
  active: boolean;
  checkingOut: boolean;
  priceLabel: string;
  startCheckout: () => Promise<void>;
};

type PaymentGateProps = {
  children: ReactNode | ((state: PaymentGateState) => ReactNode);
  onStatus?: (active: boolean) => void;
  userEmail?: string | null;
};

const priceLabel = import.meta.env.VITE_MEMBERSHIP_PRICE_LABEL || "$4.99";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function PaymentGate({ children, onStatus }: PaymentGateProps) {
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
    if (!loading) {
      onStatus?.(active);
    }
  }, [active, loading, onStatus]);

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

  const state: PaymentGateState = {
    active,
    checkingOut,
    priceLabel,
    startCheckout,
  };

  return <>{typeof children === "function" ? children(state) : children}</>;
}

export function SubscribeButton({
  checkingOut,
  onClick,
  label = "Subscribe",
  className = "",
}: {
  checkingOut: boolean;
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={checkingOut}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-3 py-2 text-xs font-black uppercase leading-none text-primary-foreground shadow-sm shadow-primary/20 transition hover:opacity-90 disabled:opacity-60 ${className}`}
    >
      {checkingOut ? (
        <RefreshCw className="size-3 animate-spin" />
      ) : (
        <CreditCard className="size-3" />
      )}
      {checkingOut ? "Opening..." : label}
    </button>
  );
}
