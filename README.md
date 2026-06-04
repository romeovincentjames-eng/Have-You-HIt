# Have You Hit — local project

This folder was rebuilt from the files you uploaded.

## Run in VS Code

1. Open this whole folder in VS Code.
2. Open the VS Code terminal.
3. Run:

```bash
npm install
npm run dev
```

If you use Bun, you can try:

```bash
bun install
bun run dev
```

Then open the local URL the terminal prints, usually:

```text
http://localhost:5173
```

## Supabase

The app uses Supabase auth, database tables, storage, votes, flags, comments, and photo uploads. The `.env` file is included from your upload.

The database migration files are inside:

```text
supabase/migrations/
```

If the app opens but uploads/login do not work, your Supabase project may need those migrations applied and the `photos` storage bucket/policies created.

## Paid access

Paid entry is wired through Stripe Checkout.

Add these environment variables before taking real payments:

```text
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_ID=price_1TeYmyAerhfqgEjd16F7tja3
STRIPE_WEBHOOK_SECRET=whsec_...
SUPABASE_SERVICE_ROLE_KEY=...
PUBLIC_SITE_URL=https://your-live-domain.com
STRIPE_CHECKOUT_MODE=subscription
VITE_MEMBERSHIP_PRICE_LABEL=$4.99/mo
```

Use `STRIPE_CHECKOUT_MODE=payment` for a one-time unlock, or `STRIPE_CHECKOUT_MODE=subscription` for a recurring Stripe Price.

Create a Stripe webhook endpoint for:

```text
/api/stripe/webhook
```

Listen to these events:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

The app also confirms a successful Checkout Session when Stripe redirects the user back, so local testing works before the webhook is public.
Stripe Identity ID scanning is currently hidden in the app. The age gate uses a saved 18+ self-confirmation instead.
# Have-You-HIt
