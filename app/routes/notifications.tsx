import { useEffect, useRef, useState } from "react";
import { data, isRouteErrorResponse, Link } from "react-router";
import {
  AlertTriangle,
  Archive,
  Bell,
  BellOff,
  CheckCheck,
  Settings,
} from "lucide-react";
import type { Route } from "./+types/notifications";
import { getCurrentUserId } from "~/lib/session";
import {
  useNotificationFeed,
  type FeedNotification,
} from "~/lib/notification-feed";
import {
  categoryPills,
  filterFeed,
  type CategoryFilter,
} from "~/lib/notification-feed-view";
import { CATEGORY_LABELS } from "~/lib/notifications";
import { NotificationKindIcon } from "~/components/notification-kind-icon";
import { Button } from "~/components/ui/button";
import { cn, formatRelativeTime } from "~/lib/utils";

export function meta() {
  return [
    { title: "Notifications — Cadence" },
    { name: "description", content: "Your Notification Feed" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }
  return null;
}

function pillLabel(filter: CategoryFilter) {
  return filter === "all" ? "All" : CATEGORY_LABELS[filter];
}

export default function NotificationsPage() {
  const feed = useNotificationFeed();
  const [chosenCategory, setChosenCategory] = useState<CategoryFilter>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Opening the page marks everything seen (not read), once the Feed is ready
  // — and again if the DevUI switches to another user's Feed.
  const markAllSeenRef = useRef(feed.markAllSeen);
  markAllSeenRef.current = feed.markAllSeen;
  useEffect(() => {
    if (feed.status === "ready") markAllSeenRef.current();
  }, [feed.status]);

  const pills = categoryPills(feed.items);
  // A category whose last Notification was archived loses its pill.
  const category = pills.includes(chosenCategory) ? chosenCategory : "all";
  const shown = filterFeed(feed.items, { category, unreadOnly });
  const selected = feed.items.find((item) => item.id === selectedId) ?? null;

  function select(item: FeedNotification) {
    setSelectedId(item.id);
    if (item.readAt === null) feed.markRead(item.id);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-8 py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            {feed.status === "ready" && (
              <p className="text-sm text-muted-foreground">
                {feed.unreadCount} unread · {feed.totalCount} total
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {feed.status === "ready" && (
              <Button
                variant="outline"
                size="sm"
                onClick={feed.markAllRead}
                disabled={feed.unreadCount === 0}
              >
                <CheckCheck /> Mark all as read
              </Button>
            )}
            <Button variant="ghost" size="sm" asChild>
              <Link to="/settings#notifications">
                <Settings /> Settings
              </Link>
            </Button>
          </div>
        </div>
        {feed.status === "ready" && feed.items.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {pills.map((pill) => (
              <button
                key={pill}
                type="button"
                onClick={() => setChosenCategory(pill)}
                aria-pressed={category === pill}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  category === pill
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-accent"
                )}
              >
                {pillLabel(pill)}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(event) => setUnreadOnly(event.target.checked)}
              />
              Unread only
            </label>
          </div>
        )}
      </div>

      {feed.status === "unavailable" ? (
        <CenteredMessage
          icon={<BellOff className="size-12 text-muted-foreground/30" />}
          title="Notifications aren't available right now"
          body="Try again in a little while."
        />
      ) : feed.status === "loading" ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Loading notifications…
        </div>
      ) : feed.items.length === 0 ? (
        <CenteredMessage
          icon={<Bell className="size-12 text-muted-foreground/30" />}
          title="No notifications yet"
          body="You'll get one when someone replies to your question, decides your Refund Request, or does something else that concerns you."
        />
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="w-[26rem] shrink-0 overflow-y-auto border-r">
            {shown.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => select(item)}
                className={cn(
                  "flex w-full gap-3 border-b px-5 py-3 text-left",
                  selectedId === item.id ? "bg-accent" : "hover:bg-accent/50",
                  item.readAt === null && "border-l-2 border-l-primary"
                )}
              >
                <NotificationKindIcon kind={item.kind} boxed />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className={cn(
                        "truncate text-sm",
                        item.readAt === null && "font-semibold"
                      )}
                    >
                      {item.title}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatRelativeTime(item.insertedAt)}
                    </span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {item.course}
                  </div>
                </div>
              </button>
            ))}
            {shown.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Nothing matches this filter.
              </div>
            )}
            {feed.hasOlder && (
              <button
                type="button"
                onClick={feed.loadOlder}
                className="w-full py-3 text-sm font-medium text-primary hover:bg-accent"
              >
                Load older
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-10">
            {selected ? (
              <NotificationDetail
                notification={selected}
                onMarkUnread={() => feed.markUnread(selected.id)}
                onArchive={() => {
                  feed.archive(selected.id);
                  setSelectedId(null);
                }}
              />
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

function NotificationDetail({
  notification,
  onMarkUnread,
  onArchive,
}: {
  notification: FeedNotification;
  onMarkUnread: () => void;
  onArchive: () => void;
}) {
  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <NotificationKindIcon kind={notification.kind} />
        {notification.category && CATEGORY_LABELS[notification.category]} ·{" "}
        {new Date(notification.insertedAt).toLocaleString()}
      </div>
      <h2 className="mt-3 text-xl font-semibold">{notification.title}</h2>
      <div className="mt-1 text-sm text-muted-foreground">
        {notification.course}
      </div>
      {notification.snippet && (
        <blockquote className="mt-5 border-l-4 pl-4 text-base italic text-foreground/80">
          {notification.snippet}
        </blockquote>
      )}
      <div className="mt-8 flex items-center gap-2">
        <Button asChild>
          <Link to={notification.url}>{notification.buttonLabel} →</Link>
        </Button>
        <Button
          variant="outline"
          onClick={onMarkUnread}
          disabled={notification.readAt === null}
        >
          Mark unread
        </Button>
        <Button variant="outline" onClick={onArchive}>
          <Archive /> Archive
        </Button>
      </div>
    </div>
  );
}

function CenteredMessage({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      {icon}
      <div className="text-lg font-medium">{title}</div>
      <div className="max-w-sm text-sm text-muted-foreground">{body}</div>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
