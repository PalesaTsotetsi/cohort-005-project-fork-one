// PROTOTYPE — throwaway. In-memory feed state mirroring Knock's model:
// each item has seenAt / readAt / archivedAt. Resets on reload or user switch.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
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
import {
  feedFor,
  simulatedFor,
  type FeedPerson,
  type NotificationKind,
  type ProtoNotification,
} from "./fixtures";

export const PAGE_SIZE = 6;

interface FeedState {
  person: FeedPerson | null;
  items: ProtoNotification[]; // excludes archived
  archived: ProtoNotification[];
  unseenCount: number;
  unreadCount: number;
  markAllSeen: () => void;
  markRead: (id: string) => void;
  markUnread: (id: string) => void;
  markAllRead: () => void;
  archive: (id: string) => void;
  unarchive: (id: string) => void;
  simulate: () => void;
  empty: boolean;
  setEmpty: (v: boolean) => void;
  toasts: boolean;
  setToasts: (v: boolean) => void;
}

const Ctx = createContext<FeedState | null>(null);

export function useFeed() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFeed outside FeedProvider");
  return v;
}

const stamp = () => new Date().toISOString();

export function FeedProvider({
  person,
  children,
}: {
  person: FeedPerson | null;
  children: React.ReactNode;
}) {
  const [all, setAll] = useState<ProtoNotification[]>(() => feedFor(person));
  const [empty, setEmpty] = useState(false);
  const [toasts, setToasts] = useState(true);

  // Reset when the DevUI switches user.
  const key = person ? `${person.id}-${person.role}-${person.isTeamAdmin}` : "none";
  useEffect(() => {
    setAll(feedFor(person));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const patch = useCallback(
    (pred: (n: ProtoNotification) => boolean, f: Partial<ProtoNotification>) =>
      setAll((xs) => xs.map((x) => (pred(x) ? { ...x, ...f } : x))),
    []
  );

  const visible = empty ? [] : all;
  const items = visible.filter((x) => !x.archivedAt);
  const archived = visible.filter((x) => x.archivedAt);

  const simulate = useCallback(() => {
    const fresh = simulatedFor(person);
    setEmpty(false);
    setAll((xs) => [fresh, ...xs]);
    if (toasts) {
      toast(fresh.title, {
        description: fresh.snippet,
        icon: <KindIcon kind={fresh.kind} />,
        position: "bottom-left",
      });
    }
  }, [person, toasts]);

  const value = useMemo<FeedState>(
    () => ({
      person,
      items,
      archived,
      unseenCount: items.filter((x) => !x.seenAt).length,
      unreadCount: items.filter((x) => !x.readAt).length,
      markAllSeen: () => patch((x) => !x.seenAt, { seenAt: stamp() }),
      markRead: (id) =>
        setAll((xs) =>
          xs.map((x) =>
            x.id === id
              ? { ...x, readAt: x.readAt ?? stamp(), seenAt: x.seenAt ?? stamp() }
              : x
          )
        ),
      markUnread: (id) => patch((x) => x.id === id, { readAt: null }),
      markAllRead: () =>
        setAll((xs) =>
          xs.map((x) => ({
            ...x,
            readAt: x.readAt ?? stamp(),
            seenAt: x.seenAt ?? stamp(),
          }))
        ),
      archive: (id) =>
        setAll((xs) =>
          xs.map((x) =>
            x.id === id
              ? { ...x, archivedAt: stamp(), readAt: x.readAt ?? stamp(), seenAt: x.seenAt ?? stamp() }
              : x
          )
        ),
      unarchive: (id) => patch((x) => x.id === id, { archivedAt: null }),
      simulate,
      empty,
      setEmpty,
      toasts,
      setToasts,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, empty, toasts, person, simulate]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ── small shared bits (icon + time); layouts stay per-variant ──

const kindStyle: Record<NotificationKind, { icon: typeof Bell; className: string; label: string }> = {
  "refund-raised": { icon: Receipt, className: "text-sky-600 bg-sky-500/10", label: "Refunds" },
  "refund-approved": { icon: CircleCheck, className: "text-emerald-600 bg-emerald-500/10", label: "Refunds" },
  "refund-declined": { icon: CircleX, className: "text-rose-600 bg-rose-500/10", label: "Refunds" },
  "refund-open": { icon: ShieldAlert, className: "text-amber-600 bg-amber-500/10", label: "Refunds" },
  "seat-claimed": { icon: UserPlus, className: "text-violet-600 bg-violet-500/10", label: "Team" },
  "new-enrollment": { icon: GraduationCap, className: "text-indigo-600 bg-indigo-500/10", label: "Enrollments" },
  "discussion-question": { icon: MessageCircleQuestion, className: "text-orange-600 bg-orange-500/10", label: "Discussions" },
  "discussion-reply": { icon: MessageSquareReply, className: "text-teal-600 bg-teal-500/10", label: "Discussions" },
};

export function kindLabel(kind: NotificationKind) {
  return kindStyle[kind].label;
}

export function KindIcon({ kind, boxed = false }: { kind: NotificationKind; boxed?: boolean }) {
  const { icon: Icon, className } = kindStyle[kind];
  if (!boxed) return <Icon className={`size-4 ${className.split(" ")[0]}`} />;
  return (
    <div className={`flex size-8 shrink-0 items-center justify-center rounded-full ${className}`}>
      <Icon className="size-4" />
    </div>
  );
}

export function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function dayBucket(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (startOf(today) - startOf(d)) / 86_400_000;
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return "This week";
  return "Earlier";
}
