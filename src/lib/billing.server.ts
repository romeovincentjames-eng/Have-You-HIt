import { supabaseAdmin } from "@/integrations/supabase/client.server";

type CheckoutMode = "payment" | "subscription";

type StripeCheckoutSession = {
  id: string;
  mode: CheckoutMode;
  status: string | null;
  payment_status: string | null;
  client_reference_id: string | null;
  customer: string | { id: string } | null;
  customer_details?: { email?: string | null } | null;
  subscription: string | StripeSubscription | null;
  metadata?: Record<string, string> | null;
};

type StripeSubscription = {
  id: string;
  customer: string | { id: string } | null;
  status: string;
  current_period_end?: number | null;
  metadata?: Record<string, string> | null;
};

type StripeEvent = {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
};

type MembershipUpsert = {
  user_id: string;
  status: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_checkout_session_id?: string | null;
  current_period_end?: string | null;
  paid_at?: string | null;
};

function getBillingConfig() {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const stripePriceId = process.env.STRIPE_PRICE_ID;
  const publicSiteUrl = process.env.PUBLIC_SITE_URL;
  const checkoutMode = (process.env.STRIPE_CHECKOUT_MODE || "payment") as CheckoutMode;

  if (!stripeSecretKey) {
    throw new Error(
      "Missing STRIPE_SECRET_KEY. Add your Stripe secret key before taking payments.",
    );
  }

  if (!stripePriceId) {
    throw new Error("Missing STRIPE_PRICE_ID. Add the Stripe Price ID you want members to buy.");
  }

  if (checkoutMode !== "payment" && checkoutMode !== "subscription") {
    throw new Error("STRIPE_CHECKOUT_MODE must be payment or subscription.");
  }

  return { stripeSecretKey, stripePriceId, publicSiteUrl, checkoutMode };
}

function stripeId(value: string | { id: string } | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function timestampToIso(value: number | null | undefined) {
  if (!value) return null;
  return new Date(value * 1000).toISOString();
}

function normalizeOrigin(origin: string | null | undefined, fallback: string | null | undefined) {
  const candidate = fallback || origin;
  if (!candidate) {
    throw new Error("Could not determine this app's public URL for Stripe redirects.");
  }

  const url = new URL(candidate);
  return url.origin;
}

async function stripeRequest<T>(path: string, init: RequestInit = {}) {
  const { stripeSecretKey } = getBillingConfig();
  const response = await fetch(`https://api.stripe.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      ...(init.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...init.headers,
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = body?.error?.message || `Stripe request failed with ${response.status}`;
    throw new Error(message);
  }

  return body as T;
}

async function upsertMembership(values: MembershipUpsert) {
  const { data, error } = await supabaseAdmin
    .from("memberships")
    .upsert(
      {
        ...values,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("user_id,status,current_period_end,stripe_subscription_id")
    .single();

  if (error) throw error;
  return data;
}

async function getSubscription(subscriptionId: string) {
  return stripeRequest<StripeSubscription>(
    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
  );
}

export async function createCheckoutSessionForUser(options: {
  userId: string;
  email?: string | null;
  origin?: string | null;
  requestOrigin?: string | null;
}) {
  const { stripePriceId, publicSiteUrl, checkoutMode } = getBillingConfig();
  const origin = normalizeOrigin(options.origin, publicSiteUrl || options.requestOrigin);
  const body = new URLSearchParams();

  body.set("mode", checkoutMode);
  body.set("line_items[0][price]", stripePriceId);
  body.set("line_items[0][quantity]", "1");
  body.set("success_url", `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  body.set("cancel_url", `${origin}/?checkout=cancelled`);
  body.set("client_reference_id", options.userId);
  body.set("metadata[user_id]", options.userId);
  body.set("allow_promotion_codes", "true");

  if (options.email) {
    body.set("customer_email", options.email);
  }

  if (checkoutMode === "payment") {
    body.set("customer_creation", "always");
    body.set("payment_intent_data[metadata][user_id]", options.userId);
  } else {
    body.set("subscription_data[metadata][user_id]", options.userId);
  }

  const session = await stripeRequest<StripeCheckoutSession>("/v1/checkout/sessions", {
    method: "POST",
    body,
  });

  const url = (session as StripeCheckoutSession & { url?: string }).url;
  if (!url) {
    throw new Error("Stripe did not return a checkout URL.");
  }

  return { url };
}

export async function getMembershipForUser(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("memberships")
    .select("status,current_period_end,stripe_subscription_id,updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function syncCheckoutSessionForUser(options: { userId: string; sessionId: string }) {
  const session = await stripeRequest<StripeCheckoutSession>(
    `/v1/checkout/sessions/${encodeURIComponent(options.sessionId)}?expand[]=subscription`,
  );

  const checkoutUserId = session.client_reference_id || session.metadata?.user_id;
  if (checkoutUserId !== options.userId) {
    throw new Error("That checkout session does not belong to this account.");
  }

  if (session.mode === "payment") {
    if (session.payment_status !== "paid") {
      throw new Error("Payment has not completed yet.");
    }

    return upsertMembership({
      user_id: options.userId,
      status: "active",
      stripe_customer_id: stripeId(session.customer),
      stripe_checkout_session_id: session.id,
      stripe_subscription_id: null,
      current_period_end: null,
      paid_at: new Date().toISOString(),
    });
  }

  const subscription =
    typeof session.subscription === "string"
      ? await getSubscription(session.subscription)
      : session.subscription;

  if (!subscription) {
    throw new Error("Stripe did not attach a subscription to this checkout session.");
  }

  return upsertMembership({
    user_id: options.userId,
    status: subscription.status,
    stripe_customer_id: stripeId(subscription.customer) || stripeId(session.customer),
    stripe_subscription_id: subscription.id,
    stripe_checkout_session_id: session.id,
    current_period_end: timestampToIso(subscription.current_period_end),
    paid_at: ["active", "trialing"].includes(subscription.status) ? new Date().toISOString() : null,
  });
}

async function upsertFromSubscription(subscription: StripeSubscription) {
  let userId = subscription.metadata?.user_id;

  if (!userId) {
    const { data, error } = await supabaseAdmin
      .from("memberships")
      .select("user_id")
      .eq("stripe_subscription_id", subscription.id)
      .maybeSingle();

    if (error) throw error;
    userId = data?.user_id;
  }

  if (!userId) return null;

  return upsertMembership({
    user_id: userId,
    status: subscription.status,
    stripe_customer_id: stripeId(subscription.customer),
    stripe_subscription_id: subscription.id,
    current_period_end: timestampToIso(subscription.current_period_end),
  });
}

export async function handleStripeEvent(event: StripeEvent) {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as StripeCheckoutSession;
      const userId = session.client_reference_id || session.metadata?.user_id;
      if (!userId) return null;

      if (session.mode === "subscription" && session.subscription) {
        const subscription =
          typeof session.subscription === "string"
            ? await getSubscription(session.subscription)
            : session.subscription;
        return upsertFromSubscription(subscription);
      }

      if (session.payment_status === "paid") {
        return upsertMembership({
          user_id: userId,
          status: "active",
          stripe_customer_id: stripeId(session.customer),
          stripe_checkout_session_id: session.id,
          stripe_subscription_id: null,
          current_period_end: null,
          paid_at: new Date().toISOString(),
        });
      }

      return null;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return upsertFromSubscription(event.data.object as StripeSubscription);

    default:
      return null;
  }
}

export async function verifyStripeSignature(payload: string, signatureHeader: string | null) {
  const signingSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signingSecret) {
    throw new Error("Missing STRIPE_WEBHOOK_SECRET.");
  }

  if (!signatureHeader) {
    throw new Error("Missing Stripe-Signature header.");
  }

  const timestamp = signatureHeader
    .split(",")
    .map((part) => part.trim().split("="))
    .find(([key]) => key === "t")?.[1];
  const signatures = signatureHeader
    .split(",")
    .map((part) => part.trim().split("="))
    .filter(([key]) => key === "v1")
    .map(([, value]) => value);

  if (!timestamp || signatures.length === 0) {
    throw new Error("Invalid Stripe signature header.");
  }

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) {
    throw new Error("Stripe webhook timestamp is outside the allowed tolerance.");
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`));
  const expected = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  if (!signatures.some((signature) => constantTimeEqual(signature, expected))) {
    throw new Error("Stripe webhook signature verification failed.");
  }
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
