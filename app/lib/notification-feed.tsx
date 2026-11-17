import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRevalidator } from "react-router";
import type { Feed, FeedItem, FeedStoreState } from "@knocklabs/client";
import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type NotificationKind,
} from "~/lib/notifications";

// ─── Notification Feed client seam ───
// The only importer of @knocklabs/client. The import is dynamic and inside an
// effect, so Knock never runs in the server render. One provider in the app
// layout opens the session user's Feed; the sidebar dot, the arrival toast and
// the /notifications page all read it through useNotificationFeed(). With no
// token, or any error from Knock, the Feed is "unavailable": there is no fake
// local Feed.

export type NotificationFeedStatus = "loading" | "ready" | "unavailable";

/** A Feed entry in Cadence's terms, built from the workflow's display data. */
export type FeedNotification = {
  id: string;
  kind: NotificationKind | null;
  category: NotificationCategory | null;
  actorName: string;
  /** The workflow's rendered body as plain text, starting with the actor. */
  title: string;
  course: string;
  lessonTitle: string | null;
  snippet: string | null;
  url: string;
  buttonLabel: string;
  insertedAt: string;
  seenAt: string | null;
  readAt: string | null;
};

export type ArrivalListener = (notifications: FeedNotification[]) => void;

export type NotificationFeed = {
  status: NotificationFeedStatus;
  /** Newest first, archived ones left out. */
  items: FeedNotification[];
  unreadCount: number;
  totalCount: number;
  /** True while there are older Notifications that loadOlder can add. */
  hasOlder: boolean;
  markRead: (id: string) => void;
  markUnread: (id: string) => void;
  markAllRead: () => void;
  markAllSeen: () => void;
  archive: (id: string) => void;
  /** Adds the next OLDER_PAGE_SIZE older Notifications. */
  loadOlder: () => void;
  /** Called with the Notifications that arrive live; returns an unsubscribe. */
  onArrival: (listener: ArrivalListener) => () => void;
};

export const FIRST_PAGE_SIZE = 12;
export const OLDER_PAGE_SIZE = 6;

export type NotificationFeedConnection = {
  userId: number | null;
  token: string | null;
  publicKey: string | null;
  feedChannelId: string | null;
};

const KINDS: NotificationKind[] = [
  "refund-request-raised",
  "refund-request-approved",
  "refund-request-declined",
  "open-refund-request",
  "seat-claimed",
  "new-enrollment",
  "discussion-question",
  "discussion-reply",
];

function isKind(key: string): key is NotificationKind {
  return KINDS.some((kind) => kind === key);
}

function isCategory(key: string): key is NotificationCategory {
  return NOTIFICATION_CATEGORIES.some((category) => category === key);
}

function readString(data: FeedItem["data"], key: string): string | null {
  const value = data?.[key];
  return typeof value === "string" ? value : null;
}

function plainText(html: string): string {
  return (
    new DOMParser().parseFromString(html, "text/html").body.textContent ?? ""
  ).trim();
}

function toFeedNotification(item: FeedItem): FeedNotification {
  const body = item.blocks.find((block) => block.name === "body");
  const actorName = readString(item.data, "actor_name") ?? "Someone";
  return {
    id: item.id,
    kind: isKind(item.source.key) ? item.source.key : null,
    category: item.source.categories.find(isCategory) ?? null,
    actorName,
    title:
      body && body.type !== "button_set" ? plainText(body.rendered) : actorName,
    course: readString(item.data, "course_title") ?? "",
    lessonTitle: readString(item.data, "lesson_title"),
    snippet: readString(item.data, "snippet"),
    url: readString(item.data, "url") ?? "/",
    buttonLabel: readString(item.data, "button_label") ?? "Open",
    insertedAt: item.inserted_at,
    seenAt: item.seen_at,
    readAt: item.read_at,
  };
}

type FeedSnapshot = {
  status: NotificationFeedStatus;
  raw: FeedItem[];
  unreadCount: number;
  totalCount: number;
  hasOlder: boolean;
};

const UNAVAILABLE: FeedSnapshot = {
  status: "unavailable",
  raw: [],
  unreadCount: 0,
  totalCount: 0,
  hasOlder: false,
};

const LOADING: FeedSnapshot = { ...UNAVAILABLE, status: "loading" };

function snapshotOf(state: FeedStoreState, failed: boolean): FeedSnapshot {
  if (failed || state.networkStatus === "error") return UNAVAILABLE;
  return {
    status: "ready",
    raw: state.items.filter((item) => item.archived_at === null),
    unreadCount: state.metadata.unread_count,
    totalCount: state.metadata.total_count,
    hasOlder: Boolean(state.pageInfo.after),
  };
}

function logFeedError(error: unknown) {
  console.warn(
    "Notification Feed unavailable:",
    error instanceof Error ? error.message : String(error)
  );
}

function useKnockFeed(
  connection: NotificationFeedConnection
): NotificationFeed {
  const { userId, token, publicKey, feedChannelId } = connection;
  const canConnect =
    userId !== null &&
    token !== null &&
    publicKey !== null &&
    feedChannelId !== null;

  const [snapshot, setSnapshot] = useState<FeedSnapshot>(
    canConnect ? LOADING : UNAVAILABLE
  );
  const feedRef = useRef<Feed | null>(null);
  const listenersRef = useRef(new Set<ArrivalListener>());

  // Every loader run signs a new token. Reconnecting on each one would drop
  // the live socket on every navigation, so the connection keys on the user
  // and keys only, and the newest token is handed over when Knock asks.
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const { revalidate } = useRevalidator();
  const revalidateRef = useRef(revalidate);
  revalidateRef.current = revalidate;
  const hasToken = token !== null;

  useEffect(() => {
    const firstToken = tokenRef.current;
    if (userId === null || !firstToken || !publicKey || !feedChannelId) {
      setSnapshot(UNAVAILABLE);
      return;
    }

    let cancelled = false;
    let failed = false;
    let cleanup = () => {};
    setSnapshot(LOADING);

    async function connect(
      id: number,
      userToken: string,
      key: string,
      channelId: string
    ) {
      const { default: Knock } = await import("@knocklabs/client");
      if (cancelled) return;

      const knock = new Knock(key);
      knock.authenticate({ id: String(id) }, userToken, {
        identificationStrategy: "skip",
        onUserTokenExpiring: async (expiringToken) => {
          if (tokenRef.current === expiringToken) await revalidateRef.current();
          const fresh = tokenRef.current;
          return fresh && fresh !== expiringToken ? fresh : undefined;
        },
      });
      const feed = knock.feeds.initialize(channelId, {
        archived: "exclude",
        page_size: FIRST_PAGE_SIZE,
      });
      feedRef.current = feed;

      const unsubscribe = feed.store.subscribe((state) => {
        // Before the first fetch settles the store is empty, not ready.
        if (state.networkStatus === "loading" && state.items.length === 0)
          return;
        setSnapshot(snapshotOf(state, failed));
      });
      const onRealtime = (payload: { items: FeedItem[] }) => {
        const arrived = payload.items.map(toFeedNotification);
        if (arrived.length === 0) return;
        listenersRef.current.forEach((listener) => listener(arrived));
      };
      feed.on("items.received.realtime", onRealtime);

      cleanup = () => {
        unsubscribe();
        feed.off("items.received.realtime", onRealtime);
        feed.dispose();
        knock.teardown();
        if (feedRef.current === feed) feedRef.current = null;
      };
      if (cancelled) {
        cleanup();
        return;
      }

      const result = await feed.fetch();
      if (cancelled) return;
      if (!result || result.status === "error") {
        failed = true;
        setSnapshot(UNAVAILABLE);
        return;
      }
      setSnapshot(snapshotOf(feed.getState(), failed));
      feed.listenForUpdates();
    }

    connect(userId, firstToken, publicKey, feedChannelId).catch((error) => {
      if (cancelled) return;
      failed = true;
      logFeedError(error);
      setSnapshot(UNAVAILABLE);
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [userId, hasToken, publicKey, feedChannelId]);

  const withItem = useCallback(
    (id: string, act: (feed: Feed, item: FeedItem) => Promise<unknown>) => {
      const feed = feedRef.current;
      const item = feed?.getState().items.find((i) => i.id === id);
      if (!feed || !item) return;
      act(feed, item).catch(logFeedError);
    },
    []
  );

  const withFeed = useCallback((act: (feed: Feed) => Promise<unknown>) => {
    const feed = feedRef.current;
    if (!feed) return;
    act(feed).catch(logFeedError);
  }, []);

  const onArrival = useCallback((listener: ArrivalListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const items = useMemo(
    () => snapshot.raw.map(toFeedNotification),
    [snapshot.raw]
  );

  return useMemo(
    () => ({
      status: snapshot.status,
      items,
      unreadCount: snapshot.unreadCount,
      totalCount: snapshot.totalCount,
      hasOlder: snapshot.hasOlder,
      markRead: (id) => withItem(id, (feed, item) => feed.markAsRead(item)),
      markUnread: (id) => withItem(id, (feed, item) => feed.markAsUnread(item)),
      archive: (id) => withItem(id, (feed, item) => feed.markAsArchived(item)),
      markAllRead: () => withFeed((feed) => feed.markAllAsRead()),
      markAllSeen: () => withFeed((feed) => feed.markAllAsSeen()),
      loadOlder: () =>
        withFeed((feed) => feed.fetchNextPage({ page_size: OLDER_PAGE_SIZE })),
      onArrival,
    }),
    [snapshot, items, withItem, withFeed, onArrival]
  );
}

const unavailableFeed: NotificationFeed = {
  status: "unavailable",
  items: [],
  unreadCount: 0,
  totalCount: 0,
  hasOlder: false,
  markRead: () => {},
  markUnread: () => {},
  markAllRead: () => {},
  markAllSeen: () => {},
  archive: () => {},
  loadOlder: () => {},
  onArrival: () => () => {},
};

const NotificationFeedContext =
  createContext<NotificationFeed>(unavailableFeed);

/**
 * Opens the session user's Feed once for the whole app. When the user or
 * token changes (the DevUI switcher re-runs the loaders) it reconnects.
 */
export function NotificationFeedProvider({
  connection,
  children,
}: {
  connection: NotificationFeedConnection;
  children: React.ReactNode;
}) {
  const feed = useKnockFeed(connection);
  return (
    <NotificationFeedContext.Provider value={feed}>
      {children}
    </NotificationFeedContext.Provider>
  );
}

export function useNotificationFeed(): NotificationFeed {
  return useContext(NotificationFeedContext);
}
