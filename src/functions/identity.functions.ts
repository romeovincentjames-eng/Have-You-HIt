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

export const createIdentityVerificationSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      origin: z.string().url().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { createIdentityVerificationSessionForUser } = await import("../lib/identity.server");
    const { userId, claims } = context as AuthContext;
    const request = getRequest();
    const requestOrigin = request ? new URL(request.url).origin : null;

    return createIdentityVerificationSessionForUser({
      userId,
      email: claims?.email,
      origin: data.origin,
      requestOrigin,
    });
  });

export const syncIdentityVerificationSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { syncIdentityVerificationForUser } = await import("../lib/identity.server");
    const { userId } = context as AuthContext;
    return syncIdentityVerificationForUser(userId);
  });
