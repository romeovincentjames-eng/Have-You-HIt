import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, KeyRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set New Password | Have You Hit" },
      {
        name: "description",
        content: "Set a new password for Have You Hit.",
      },
    ],
  }),
  component: ResetPasswordPage,
});

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingLink, setCheckingLink] = useState(true);
  const [canReset, setCanReset] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function prepareResetSession() {
      try {
        const url = new URL(window.location.href);
        const errorDescription =
          url.searchParams.get("error_description") ||
          url.hash.match(/error_description=([^&]+)/)?.[1];

        if (errorDescription) {
          throw new Error(decodeURIComponent(errorDescription.replace(/\+/g, " ")));
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          if (mounted) setCanReset(true);
          return;
        }

        const code = url.searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;

          window.history.replaceState({}, document.title, "/reset-password");
          if (mounted) setCanReset(true);
          return;
        }

        const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
        const accessToken = hash.get("access_token");
        const refreshToken = hash.get("refresh_token");

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) throw error;

          window.history.replaceState({}, document.title, "/reset-password");
          if (mounted) setCanReset(true);
          return;
        }

        if (mounted) setCanReset(false);
      } catch (err) {
        toast.error(getErrorMessage(err, "This reset link is not valid anymore."));
        if (mounted) setCanReset(false);
      } finally {
        if (mounted) setCheckingLink(false);
      }
    }

    prepareResetSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setCanReset(true);
        setCheckingLink(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      toast.success("Password updated. You can sign in now.");
      await supabase.auth.signOut();
      navigate({ to: "/" });
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not update your password."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <a
          href="/forgot-password"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
        >
          <ArrowLeft className="size-4" />
          Get another link
        </a>

        <div className="rounded-3xl border border-border bg-card p-6 shadow-xl shadow-primary/10">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <KeyRound className="size-6" />
            </div>
            <h1 className="font-display text-4xl font-black leading-none text-primary">
              New password
            </h1>
            <p className="mt-3 text-sm font-medium text-muted-foreground">
              Choose a password you’ll remember.
            </p>
          </div>

          {checkingLink ? (
            <p className="rounded-2xl bg-muted p-4 text-center text-sm font-semibold text-muted-foreground">
              Checking your reset link...
            </p>
          ) : !canReset ? (
            <div className="space-y-4 text-center">
              <p className="rounded-2xl bg-muted p-4 text-sm font-semibold text-muted-foreground">
                This reset link is expired or missing. Send yourself a new one.
              </p>
              <Button asChild className="h-11 w-full rounded-full text-base font-semibold">
                <a href="/forgot-password">Send new link</a>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              <div>
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="h-11 w-full rounded-full text-base font-semibold"
              >
                {loading ? "Saving..." : "Save new password"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
