import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type AuthContext = {
  userId: string;
  supabase: SupabaseClient<Database>;
  claims?: {
    email?: string;
  };
};

export const getMyMembership = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as AuthContext;
    const { data, error } = await supabase
      .from("memberships")
      .select("status,current_period_end,stripe_subscription_id,updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  });

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      origin: z.string().url().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { createCheckoutSessionForUser } = await import("../lib/billing.server");
    const { userId, claims } = context as AuthContext;
    const request = getRequest();
    const requestOrigin = request ? new URL(request.url).origin : null;

    return createCheckoutSessionForUser({
      userId,
      email: claims?.email,
      origin: data.origin,
      requestOrigin,
    });
  });

export const syncCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      sessionId: z.string().min(1),
    }),
  )
  .handler(async ({ data, context }) => {
    const { syncCheckoutSessionForUser } = await import("../lib/billing.server");
    const { userId } = context as AuthContext;
    return syncCheckoutSessionForUser({ userId, sessionId: data.sessionId });
  });
