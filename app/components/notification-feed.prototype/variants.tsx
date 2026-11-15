// PROTOTYPE — throwaway. Three structurally different Notification Feeds.
//   A  Bell popover   — bell in the sidebar header, badge = UNSEEN (clears on open),
//                       compact rows, click = go there, infinite scroll, no archive.
//   B  Slide-over     — "Notifications" nav item, pill = UNREAD, full-height drawer,
//                       Unread/All/Archived tabs, day groups, hover actions, Load more.
//   C  Inbox page     — "Notifications" nav item → /notifications, two-pane list/detail,
//                       click = select (shows full context), explicit CTA navigates,
//                       category filters.
import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router";
import {
  Archive,
  Bell,
  CheckCheck,
  Inbox,
  Undo2,
  X,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { UserAvatar } from "~/components/user-avatar";
import {
  dayBucket,
  KindIcon,
  kindLabel,
  PAGE_SIZE,
  timeAgo,
  useFeed,
} from "./state";
import type { ProtoNotification } from "./fixtures";

// ─────────────────────────── Variant A: Bell popover ───────────────────────────

function BellPopover() {
  const feed = useFeed();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    feed.markAllSeen();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const page = feed.items.slice(0, shown);
  const more = shown < feed.items.length;

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        onClick={() => {
          setOpen((o) => !o);
          setShown(PAGE_SIZE);
        }}
        title="Notifications"
        className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Bell className="size-5" />
        {feed.unseenCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white">
            {feed.unseenCount > 9 ? "9+" : feed.unseenCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-[calc(100%+1.25rem)] top-0 z-50 w-96 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
            {feed.unreadCount > 0 && (
              <button
                onClick={feed.markAllRead}
                className="text-xs font-medium text-primary hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>

          {feed.items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <Bell className="size-8 text-muted-foreground/40" />
              <div className="text-sm font-medium">You're all caught up</div>
              <div className="text-xs text-muted-foreground">
                We'll let you know when someone does something that concerns you.
              </div>
            </div>
          ) : (
            <div
              className="max-h-[28rem] overflow-y-auto"
              onScroll={(e) => {
                const el = e.currentTarget;
                if (more && el.scrollTop + el.clientHeight > el.scrollHeight - 40)
                  setShown((s) => s + PAGE_SIZE);
              }}
            >
              {page.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    feed.markRead(item.id);
                    setOpen(false);
                    navigate(item.href);
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 border-b px-4 py-3 text-left last:border-b-0 hover:bg-accent",
                    !item.readAt && "bg-primary/[0.04]"
                  )}
                >
                  <KindIcon kind={item.kind} boxed />
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-sm", !item.readAt && "font-semibold")}>
                      {item.title}
                    </div>
                    {item.snippet && (
                      <div className="truncate text-xs text-muted-foreground">
                        {item.snippet}
                      </div>
                    )}
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {item.course} · {timeAgo(item.insertedAt)}
                    </div>
                  </div>
                  {!item.readAt && (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                  )}
                </button>
              ))}
              {more && (
                <div className="py-3 text-center text-xs text-muted-foreground">
                  Scroll for older…
                </div>
              )}
              {!more && feed.items.length > PAGE_SIZE && (
                <div className="py-3 text-center text-xs text-muted-foreground">
                  That's everything.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Variant B: Slide-over inbox ───────────────────────────

type BTab = "unread" | "all" | "archived";

function DrawerNavItem() {
  const feed = useFeed();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<BTab>("unread");
  const [shown, setShown] = useState(PAGE_SIZE);

  useEffect(() => {
    if (!open) return;
    feed.markAllSeen();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const source =
    tab === "unread"
      ? feed.items.filter((x) => !x.readAt)
      : tab === "all"
        ? feed.items
        : feed.archived;
  const page = source.slice(0, shown);
  const groups = groupBy(page, (x) => dayBucket(x.insertedAt));

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          open
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <Inbox className="size-4" />
        Notifications
        {feed.unreadCount > 0 && (
          <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
            {feed.unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 left-56 z-40 bg-black/20"
            onClick={() => setOpen(false)}
          />
          <aside className="fixed bottom-0 left-56 top-0 z-50 flex w-[28rem] flex-col border-r bg-background shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b px-5">
              <span className="font-semibold">Notifications</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={feed.markAllRead}
                  disabled={feed.unreadCount === 0}
                  title="Mark all as read"
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-40"
                >
                  <CheckCheck className="size-4" /> Mark all read
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-accent"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <div className="flex gap-4 border-b px-5">
              {(
                [
                  ["unread", `Unread${feed.unreadCount ? ` (${feed.unreadCount})` : ""}`],
                  ["all", "All"],
                  ["archived", "Archived"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => {
                    setTab(k);
                    setShown(PAGE_SIZE);
                  }}
                  className={cn(
                    "-mb-px border-b-2 py-2.5 text-sm font-medium",
                    tab === k
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto">
              {source.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-8 py-20 text-center">
                  <Inbox className="size-10 text-muted-foreground/40" />
                  <div className="font-medium">
                    {tab === "unread"
                      ? "Nothing unread"
                      : tab === "archived"
                        ? "Nothing archived"
                        : "No notifications yet"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {tab === "unread" && feed.items.length > 0
                      ? "You've read everything. Older ones are under All."
                      : "When someone replies, enrolls, or decides a Refund Request, it shows up here."}
                  </div>
                </div>
              ) : (
                <>
                  {groups.map(([bucket, rows]) => (
                    <section key={bucket}>
                      <div className="sticky top-0 bg-muted/80 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                        {bucket}
                      </div>
                      {rows.map((item) => (
                        <div
                          key={item.id}
                          className="group relative flex cursor-pointer gap-3 border-b px-5 py-4 hover:bg-accent/60"
                          onClick={() => {
                            feed.markRead(item.id);
                            setOpen(false);
                            navigate(item.href);
                          }}
                        >
                          {!item.readAt && (
                            <span className="absolute left-1.5 top-1/2 size-2 -translate-y-1/2 rounded-full bg-primary" />
                          )}
                          <div className="relative shrink-0">
                            {item.actor ? (
                              <UserAvatar name={item.actor} avatarUrl={null} className="size-10" />
                            ) : (
                              <div className="flex size-10 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                                You
                              </div>
                            )}
                            <span className="absolute -bottom-1 -right-1 rounded-full bg-background p-0.5">
                              <KindIcon kind={item.kind} />
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm">
                              <span className={cn(!item.readAt && "font-semibold")}>
                                {item.title}
                              </span>
                            </div>
                            {item.snippet && (
                              <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                {item.snippet}
                              </div>
                            )}
                            <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="rounded bg-muted px-1.5 py-0.5">{item.course}</span>
                              <span>{timeAgo(item.insertedAt)}</span>
                            </div>
                          </div>
                          <div className="absolute right-3 top-3 hidden gap-1 rounded-md border bg-background p-0.5 shadow-sm group-hover:flex">
                            {tab !== "archived" && (
                              <button
                                title={item.readAt ? "Mark as unread" : "Mark as read"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  item.readAt ? feed.markUnread(item.id) : feed.markRead(item.id);
                                }}
                                className="rounded p-1 text-muted-foreground hover:bg-accent"
                              >
                                {item.readAt ? <Undo2 className="size-3.5" /> : <CheckCheck className="size-3.5" />}
                              </button>
                            )}
                            <button
                              title={tab === "archived" ? "Move back to inbox" : "Archive"}
                              onClick={(e) => {
                                e.stopPropagation();
                                tab === "archived" ? feed.unarchive(item.id) : feed.archive(item.id);
                              }}
                              className="rounded p-1 text-muted-foreground hover:bg-accent"
                            >
                              {tab === "archived" ? <Undo2 className="size-3.5" /> : <Archive className="size-3.5" />}
                            </button>
                          </div>
                        </div>
                      ))}
                    </section>
                  ))}
                  {shown < source.length && (
                    <div className="p-4">
                      <button
                        onClick={() => setShown((s) => s + PAGE_SIZE)}
                        className="w-full rounded-md border py-2 text-sm font-medium hover:bg-accent"
                      >
                        Load more ({source.length - shown} older)
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>
        </>
      )}
    </>
  );
}

// ─────────────────────────── Variant C: Inbox page ───────────────────────────

function InboxNavItem() {
  const feed = useFeed();
  return (
    <NavLink
      to="/notifications?variant=C"
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )
      }
    >
      <Bell className="size-4" />
      Notifications
      {feed.unreadCount > 0 && (
        <span className="ml-auto size-2 rounded-full bg-rose-600" title={`${feed.unreadCount} unread`} />
      )}
    </NavLink>
  );
}

export function InboxPage() {
  const feed = useFeed();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<string>("All");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE * 2);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    feed.markAllSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categories = ["All", ...Array.from(new Set(feed.items.map((x) => kindLabel(x.kind))))];
  const source = feed.items.filter(
    (x) => (filter === "All" || kindLabel(x.kind) === filter) && (!unreadOnly || !x.readAt)
  );
  const page = source.slice(0, shown);
  const selected = feed.items.find((x) => x.id === selectedId) ?? null;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            <p className="text-sm text-muted-foreground">
              {feed.unreadCount} unread · {feed.items.length} total
            </p>
          </div>
          <button
            onClick={feed.markAllRead}
            disabled={feed.unreadCount === 0}
            className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-40"
          >
            <CheckCheck className="size-4" /> Mark all as read
          </button>
        </div>
        {feed.items.length > 0 && (
          <div className="mt-4 flex items-center gap-2">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  filter === c ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
                )}
              >
                {c}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
              Unread only
            </label>
          </div>
        )}
      </div>

      {feed.items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <Bell className="size-12 text-muted-foreground/30" />
          <div className="text-lg font-medium">No notifications yet</div>
          <div className="max-w-sm text-sm text-muted-foreground">
            You'll get one when someone replies to your question, decides your Refund Request,
            or does something else that concerns you.
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="w-[26rem] shrink-0 overflow-y-auto border-r">
            {page.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedId(item.id);
                  feed.markRead(item.id);
                }}
                className={cn(
                  "flex w-full gap-3 border-b px-5 py-3 text-left",
                  selectedId === item.id ? "bg-accent" : "hover:bg-accent/50",
                  !item.readAt && "border-l-2 border-l-primary"
                )}
              >
                <KindIcon kind={item.kind} boxed />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={cn("truncate text-sm", !item.readAt && "font-semibold")}>
                      {item.title}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {timeAgo(item.insertedAt)}
                    </span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{item.course}</div>
                </div>
              </button>
            ))}
            {source.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">Nothing matches this filter.</div>
            )}
            {shown < source.length && (
              <button
                onClick={() => setShown((s) => s + PAGE_SIZE)}
                className="w-full py-3 text-sm font-medium text-primary hover:bg-accent"
              >
                Load older
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-10">
            {selected ? (
              <div className="max-w-xl">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <KindIcon kind={selected.kind} /> {kindLabel(selected.kind)} ·{" "}
                  {new Date(selected.insertedAt).toLocaleString()}
                </div>
                <h2 className="mt-3 text-xl font-semibold">{selected.title}</h2>
                <div className="mt-1 text-sm text-muted-foreground">{selected.course}</div>
                {selected.snippet && (
                  <blockquote className="mt-5 border-l-4 pl-4 text-base italic text-foreground/80">
                    {selected.snippet}
                  </blockquote>
                )}
                <div className="mt-8 flex items-center gap-2">
                  <button
                    onClick={() => navigate(selected.href)}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    {selected.cta} →
                  </button>
                  <button
                    onClick={() => feed.markUnread(selected.id)}
                    className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
                  >
                    Mark unread
                  </button>
                  <button
                    onClick={() => {
                      feed.archive(selected.id);
                      setSelectedId(null);
                    }}
                    className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-accent"
                  >
                    <Archive className="size-4" /> Archive
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Select a Notification to see it in full.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── registry ───────────────────────────

export const FEED_VARIANTS = {
  A: { name: "Bell popover", headerSlot: <BellPopover />, navSlot: null },
  B: { name: "Slide-over inbox", headerSlot: null, navSlot: <DrawerNavItem /> },
  C: { name: "Inbox page", headerSlot: null, navSlot: <InboxNavItem /> },
} as const;

export type FeedVariantKey = keyof typeof FEED_VARIANTS;

function groupBy<T>(xs: T[], key: (x: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    m.set(k, [...(m.get(k) ?? []), x]);
  }
  return [...m.entries()];
}

export type { ProtoNotification };
