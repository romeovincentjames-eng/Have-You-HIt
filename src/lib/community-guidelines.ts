import {
  BookOpenCheck,
  Flag,
  HeartHandshake,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const COMMUNITY_GUIDELINES_VERSION = "2026-06-04";

export type Guideline = {
  title: string;
  body: string;
  Icon: LucideIcon;
};

export const COMMUNITY_GUIDELINES: Guideline[] = [
  {
    title: "Keep it factual",
    body: "Share only truthful, first-hand experiences. Do not post rumors, assumptions, impersonations, or judgments based only on someone's looks.",
    Icon: BookOpenCheck,
  },
  {
    title: "Keep it private",
    body: "Do not share sensitive personal information, including last names, workplaces, phone numbers, addresses, social media handles, or private contact details.",
    Icon: LockKeyhole,
  },
  {
    title: "Keep it respectful",
    body: "No harassment, bullying, hate speech, threats, discriminatory language, personal attacks, or attempts to shame someone.",
    Icon: HeartHandshake,
  },
  {
    title: "Keep it clean",
    body: "Keep sexual content conversational, not graphic. If a safety concern requires explicit details, start with a clear content warning.",
    Icon: Sparkles,
  },
  {
    title: "Keep it 18+",
    body: "You must be at least 18 to use this app. Never post about, identify, or discuss someone who is under 18.",
    Icon: ShieldCheck,
  },
  {
    title: "Help enforce it",
    body: "Report posts or comments that break these rules. Content may be removed and violations can lead to warnings, suspensions, or permanent bans.",
    Icon: Flag,
  },
];
