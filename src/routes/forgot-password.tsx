import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { ArrowLeft, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Forgot Password | Have You Hit" },
      {
        name: "description",
        content: "Request a password reset link for Have You Hit.",
      },
    ],
  }),
  component: ForgotPasswordPage,
});

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo,
      });

      if (error) throw error;

      setSent(true);
      toast.success("Password reset link sent.");
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not send the reset email."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <a
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
        >
          <ArrowLeft className="size-4" />
          Back to sign in
        </a>

        <div className="rounded-3xl border border-border bg-card p-6 shadow-xl shadow-primary/10">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Mail className="size-6" />
            </div>
            <h1 className="font-display text-4xl font-black leading-none text-primary">
              Reset password
            </h1>
            <p className="mt-3 text-sm font-medium text-muted-foreground">
              Enter your email and we’ll send you a link to make a new password.
            </p>
          </div>

          {sent ? (
            <div className="space-y-4 text-center">
              <p className="rounded-2xl bg-primary/10 p-4 text-sm font-semibold text-foreground">
                Check your email for the reset link. It may take a minute to arrive.
              </p>
              <Button asChild className="h-11 w-full rounded-full text-base font-semibold">
                <a href="/">Back to sign in</a>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="h-11 w-full rounded-full text-base font-semibold"
              >
                {loading ? "Sending..." : "Send reset link"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
