import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isAtLeast18 } from "@/lib/age-verification";
import { readServerEnv } from "@/lib/server-env";
import type { User } from "@supabase/supabase-js";

type StripeDob = {
  day: number;
  month: number;
  year: number;
};

type StripeIdentityVerificationSession = {
  id: string;
  status: "requires_input" | "processing" | "verified" | "canceled";
  url?: string | null;
  metadata?: Record<string, string> | null;
  verified_outputs?: {
    dob?: StripeDob | null;
  } | null;
};

function getStripeIdentityConfig() {
  const stripeSecretKey = readServerEnv("STRIPE_SECRET_KEY", {
    isValid: (value) => value.startsWith("sk_"),
  });
  const publicSiteUrl = readServerEnv("PUBLIC_SITE_URL");

  if (!stripeSecretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY. Add your Stripe secret key for ID checks.");
  }

  if (!stripeSecretKey.startsWith("sk_")) {
    throw new Error("STRIPE_SECRET_KEY must be a Stripe secret key that starts with sk_.");
  }

  return { stripeSecretKey, publicSiteUrl };
}

function normalizeOrigin(origin: string | null | undefined, fallback: string | null | undefined) {
  const candidate = fallback || origin;
  if (!candidate) {
    throw new Error("Could not determine this app's public URL for Stripe Identity redirects.");
  }

  const url = new URL(candidate);
  return url.origin;
}

async function stripeIdentityRequest<T>(path: string, init: RequestInit = {}) {
  const { stripeSecretKey } = getStripeIdentityConfig();
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
    const message =
      body?.error?.message || `Stripe Identity request failed with ${response.status}`;
    throw new Error(message);
  }

  return body as T;
}

function dobToDate(dob: StripeDob | null | undefined) {
  if (!dob) return null;

  const date = new Date(dob.year, dob.month - 1, dob.day);
  const valid =
    date.getFullYear() === dob.year &&
    date.getMonth() === dob.month - 1 &&
    date.getDate() === dob.day;

  return valid ? date : null;
}

async function getAuthUser(userId: string) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error) throw error;
  return data.user;
}

function getUserMetadata(user: User | null) {
  return user?.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
}

function getDisplayName(user: User | null) {
  const metadata = getUserMetadata(user);
  const metadataName = metadata.display_name;

  if (typeof metadataName === "string" && metadataName.trim()) {
    return metadataName.trim();
  }

  return user?.email?.split("@")[0] || "Member";
}

async function ensureProfileRow(userId: string) {
  const user = await getAuthUser(userId);

  const { error } = await supabaseAdmin.from("profiles").upsert(
    {
      id: userId,
      display_name: getDisplayName(user),
    },
    {
      onConflict: "id",
      ignoreDuplicates: true,
    },
  );

  if (error) throw error;
  return user;
}

async function saveAgeVerificationToAuthUser(
  userId: string,
  user: User | null,
  ageVerifiedAt: string,
) {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...getUserMetadata(user),
      confirmed_18_plus: true,
      age_verified_at: ageVerifiedAt,
      age_verification_method: "stripe_identity",
      stripe_identity_verified_at: ageVerifiedAt,
    },
  });

  if (error) throw error;
}

async function updateIdentityStatus(options: {
  userId: string;
  sessionId: string;
  status: string;
  ageVerifiedAt?: string | null;
}) {
  const user = await ensureProfileRow(options.userId);
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({
      ...(options.ageVerifiedAt
        ? {
            gender: "confirmed_18_plus",
            age_verified_at: options.ageVerifiedAt,
            age_verification_method: "stripe_identity",
            stripe_identity_verified_at: options.ageVerifiedAt,
          }
        : {}),
      stripe_identity_session_id: options.sessionId,
      stripe_identity_status: options.status,
    })
    .eq("id", options.userId);

  if (error) throw error;

  if (options.ageVerifiedAt) {
    await saveAgeVerificationToAuthUser(options.userId, user, options.ageVerifiedAt);
  }
}

async function applyIdentitySession(session: StripeIdentityVerificationSession) {
  let userId = session.metadata?.user_id;

  if (!userId) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("stripe_identity_session_id", session.id)
      .maybeSingle();

    if (error) throw error;
    userId = data?.id;
  }

  if (!userId) {
    return {
      verified: false,
      status: session.status,
      ageVerifiedAt: null,
      reason: "missing_user",
    };
  }

  if (session.status !== "verified") {
    await updateIdentityStatus({
      userId,
      sessionId: session.id,
      status: session.status,
    });

    return {
      verified: false,
      status: session.status,
      ageVerifiedAt: null,
      reason: "not_verified",
    };
  }

  const dob = dobToDate(session.verified_outputs?.dob);

  if (!dob) {
    await updateIdentityStatus({
      userId,
      sessionId: session.id,
      status: "verified_missing_dob",
    });

    return {
      verified: false,
      status: "verified_missing_dob",
      ageVerifiedAt: null,
      reason: "missing_dob",
    };
  }

  if (!isAtLeast18(dob)) {
    await updateIdentityStatus({
      userId,
      sessionId: session.id,
      status: "under_18",
    });

    return {
      verified: false,
      status: "under_18",
      ageVerifiedAt: null,
      reason: "under_18",
    };
  }

  const ageVerifiedAt = new Date().toISOString();

  await updateIdentityStatus({
    userId,
    sessionId: session.id,
    status: "verified_18_plus",
    ageVerifiedAt,
  });

  return {
    verified: true,
    status: "verified_18_plus",
    ageVerifiedAt,
    reason: null,
  };
}

async function retrieveIdentitySession(sessionId: string) {
  return stripeIdentityRequest<StripeIdentityVerificationSession>(
    `/v1/identity/verification_sessions/${encodeURIComponent(sessionId)}?expand[]=verified_outputs`,
  );
}

async function getSavedIdentitySessionId(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("stripe_identity_session_id")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data?.stripe_identity_session_id ?? null;
}

export async function createIdentityVerificationSessionForUser(options: {
  userId: string;
  email?: string | null;
  origin?: string | null;
  requestOrigin?: string | null;
}) {
  const { publicSiteUrl } = getStripeIdentityConfig();
  const origin = normalizeOrigin(options.origin, publicSiteUrl || options.requestOrigin);
  const existingSessionId = await getSavedIdentitySessionId(options.userId);

  if (existingSessionId) {
    const existingSession = await retrieveIdentitySession(existingSessionId);
    const result = await applyIdentitySession(existingSession);

    if (result.verified) {
      throw new Error("This account is already ID verified. Refresh the page to continue.");
    }

    if (result.reason === "under_18") {
      throw new Error("Stripe verified this ID, but the date of birth is under 18.");
    }

    if (existingSession.status === "processing") {
      throw new Error("Stripe is still checking this ID. Try again in a minute.");
    }

    if (existingSession.status === "requires_input" && existingSession.url) {
      return { id: existingSession.id, url: existingSession.url };
    }
  }

  const body = new URLSearchParams();

  body.set("type", "document");
  body.set("client_reference_id", options.userId);
  body.set("return_url", `${origin}/?identity=return`);
  body.set("metadata[user_id]", options.userId);
  body.set("options[document][require_matching_selfie]", "true");

  if (options.email) {
    body.set("provided_details[email]", options.email);
  }

  const session = await stripeIdentityRequest<StripeIdentityVerificationSession>(
    "/v1/identity/verification_sessions",
    {
      method: "POST",
      body,
    },
  );

  if (!session.url) {
    throw new Error("Stripe Identity did not return a verification URL.");
  }

  await updateIdentityStatus({
    userId: options.userId,
    sessionId: session.id,
    status: session.status,
  });

  return { id: session.id, url: session.url };
}

export async function syncIdentityVerificationForUser(userId: string) {
  const sessionId = await getSavedIdentitySessionId(userId);

  if (!sessionId) {
    throw new Error("No Stripe Identity verification session found for this account.");
  }

  const session = await retrieveIdentitySession(sessionId);
  const result = await applyIdentitySession(session);

  if (!result.verified) {
    if (result.reason === "under_18") {
      throw new Error("Stripe verified this ID, but the date of birth is under 18.");
    }

    if (result.reason === "missing_dob") {
      throw new Error("Stripe verified this ID, but did not return a date of birth.");
    }

    throw new Error("Stripe Identity has not verified this ID yet.");
  }

  return result;
}

export async function handleIdentityVerificationSessionEvent(
  eventSession: StripeIdentityVerificationSession,
) {
  const session = await retrieveIdentitySession(eventSession.id);
  return applyIdentitySession(session);
}
