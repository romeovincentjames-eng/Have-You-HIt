import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = await request.text();
        const signature = request.headers.get("stripe-signature");

        try {
          const { handleStripeEvent, verifyStripeSignature } =
            await import("../../../lib/billing.server");
          await verifyStripeSignature(payload, signature);
          await handleStripeEvent(JSON.parse(payload));
          return Response.json({ received: true });
        } catch (error) {
          console.error(error);
          return Response.json({ error: "Invalid Stripe webhook" }, { status: 400 });
        }
      },
    },
  },
});
