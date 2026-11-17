import {
  Bell,
  CircleCheck,
  CircleX,
  GraduationCap,
  MessageCircleQuestion,
  MessageSquareReply,
  Receipt,
  ShieldAlert,
  UserPlus,
} from "lucide-react";
import type { NotificationKind } from "~/lib/notifications";
import { cn } from "~/lib/utils";

const KIND_STYLES: Record<
  NotificationKind,
  { icon: typeof Bell; text: string; background: string }
> = {
  "refund-request-raised": {
    icon: Receipt,
    text: "text-sky-600",
    background: "bg-sky-500/10",
  },
  "refund-request-approved": {
    icon: CircleCheck,
    text: "text-emerald-600",
    background: "bg-emerald-500/10",
  },
  "refund-request-declined": {
    icon: CircleX,
    text: "text-rose-600",
    background: "bg-rose-500/10",
  },
  "open-refund-request": {
    icon: ShieldAlert,
    text: "text-amber-600",
    background: "bg-amber-500/10",
  },
  "seat-claimed": {
    icon: UserPlus,
    text: "text-violet-600",
    background: "bg-violet-500/10",
  },
  "new-enrollment": {
    icon: GraduationCap,
    text: "text-indigo-600",
    background: "bg-indigo-500/10",
  },
  "discussion-question": {
    icon: MessageCircleQuestion,
    text: "text-orange-600",
    background: "bg-orange-500/10",
  },
  "discussion-reply": {
    icon: MessageSquareReply,
    text: "text-teal-600",
    background: "bg-teal-500/10",
  },
};

const UNKNOWN_STYLE = {
  icon: Bell,
  text: "text-muted-foreground",
  background: "bg-muted",
};

/** The category-coloured icon for a Notification; boxed in the Feed list. */
export function NotificationKindIcon({
  kind,
  boxed = false,
}: {
  kind: NotificationKind | null;
  boxed?: boolean;
}) {
  const { icon: Icon, text, background } =
    kind === null ? UNKNOWN_STYLE : KIND_STYLES[kind];

  if (!boxed) return <Icon className={cn("size-4", text)} />;

  return (
    <div
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full",
        text,
        background
      )}
    >
      <Icon className="size-4" />
    </div>
  );
}
