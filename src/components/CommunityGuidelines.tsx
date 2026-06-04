import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { COMMUNITY_GUIDELINES } from "@/lib/community-guidelines";
import { cn } from "@/lib/utils";

export function CommunityGuidelinesList({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("divide-y divide-border", className)}>
      {COMMUNITY_GUIDELINES.map(({ title, body, Icon }) => (
        <section key={title} className={cn("flex gap-3", compact ? "py-3" : "py-4")}>
          <div
            className={cn(
              "shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center",
              compact ? "size-9" : "size-11",
            )}
          >
            <Icon className={compact ? "size-4" : "size-5"} />
          </div>

          <div>
            <h3
              className={cn(
                "font-black uppercase tracking-normal leading-tight",
                compact ? "text-sm" : "text-base",
              )}
            >
              {title}
            </h3>
            <p
              className={cn(
                "mt-1 text-muted-foreground leading-snug",
                compact ? "text-xs" : "text-sm",
              )}
            >
              {body}
            </p>
          </div>
        </section>
      ))}
    </div>
  );
}

export function CommunityGuidelinesIntro({ className }: { className?: string }) {
  return (
    <div className={cn("text-center", className)}>
      <h2 className="font-display text-3xl font-black uppercase leading-none text-primary">
        Community Guidelines
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Have You Hit is for adults to share factual, respectful experiences while protecting
        privacy.
      </p>
    </div>
  );
}

export function CommunityGuidelinesDialog({ triggerClassName }: { triggerClassName?: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className={cn("rounded-full gap-2 h-11 px-4", triggerClassName)}>
          <ShieldCheck className="size-4" />
          Rules
        </Button>
      </DialogTrigger>

      <DialogContent className="rounded-3xl max-w-lg">
        <DialogHeader>
          <DialogTitle className="sr-only">Community Guidelines</DialogTitle>
        </DialogHeader>

        <CommunityGuidelinesIntro />

        <ScrollArea className="mt-5 max-h-[62vh] pr-3">
          <CommunityGuidelinesList />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
