import type { FeedNotification } from "~/lib/notification-feed";
import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
} from "~/lib/notifications";

// ─── Notification Feed page logic ───
// The pure parts of /notifications: which category pills show and which
// Notifications a filter keeps. The page component only renders the result.

export type CategoryFilter = "all" | NotificationCategory;

/** "all", then each Notification Category the person has Notifications in. */
export function categoryPills(items: FeedNotification[]): CategoryFilter[] {
  const present = new Set(items.map((item) => item.category));
  return [
    "all",
    ...NOTIFICATION_CATEGORIES.filter((category) => present.has(category)),
  ];
}

export type FeedFilter = { category: CategoryFilter; unreadOnly: boolean };

/** The Notifications a filter keeps, in the Feed's newest-first order. */
export function filterFeed(
  items: FeedNotification[],
  { category, unreadOnly }: FeedFilter
): FeedNotification[] {
  return items.filter(
    (item) =>
      (category === "all" || item.category === category) &&
      (!unreadOnly || item.readAt === null)
  );
}
