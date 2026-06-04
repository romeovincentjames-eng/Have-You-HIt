export type MembershipStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused";

export type MembershipSummary = {
  status: string | null;
  current_period_end: string | null;
};

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export function isMembershipActive(membership: MembershipSummary | null | undefined) {
  if (!membership?.status || !ACTIVE_STATUSES.has(membership.status)) {
    return false;
  }

  if (!membership.current_period_end) {
    return true;
  }

  return new Date(membership.current_period_end).getTime() > Date.now();
}
