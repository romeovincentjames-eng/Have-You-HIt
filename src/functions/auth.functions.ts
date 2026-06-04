import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function isExistingAccountError(errorMessage: string) {
  return /already|registered|exists/i.test(errorMessage);
}

export const createConfirmedAccount = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().email(),
      password: z.string().min(6),
      displayName: z.string().max(40).optional(),
      gender: z.enum(["man", "woman"]),
      postingConsentAgreedAt: z.string().datetime(),
      communityGuidelinesAgreedAt: z.string().datetime(),
      communityGuidelinesVersion: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("../integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();
    const displayName = data.displayName?.trim() || email.split("@")[0] || "Member";

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        display_name: displayName,
        gender: data.gender,
        posting_consent_agreed: true,
        posting_consent_agreed_at: data.postingConsentAgreedAt,
        community_guidelines_agreed: true,
        community_guidelines_agreed_at: data.communityGuidelinesAgreedAt,
        community_guidelines_version: data.communityGuidelinesVersion,
      },
    });

    if (createError) {
      if (isExistingAccountError(createError.message)) {
        throw new Error("That email already has an account. Use Sign in instead.");
      }

      throw createError;
    }

    if (!created.user) {
      throw new Error("Could not create the account.");
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
      {
        id: created.user.id,
        display_name: displayName,
        gender: data.gender,
        posting_consent_agreed_at: data.postingConsentAgreedAt,
        community_guidelines_agreed_at: data.communityGuidelinesAgreedAt,
        community_guidelines_version: data.communityGuidelinesVersion,
      },
      { onConflict: "id" },
    );

    if (profileError) throw profileError;

    return { userId: created.user.id };
  });
