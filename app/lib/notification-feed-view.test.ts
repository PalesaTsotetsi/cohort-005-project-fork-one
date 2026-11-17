import { describe, expect, it } from "vitest";
import type { FeedNotification } from "./notification-feed";
import type { NotificationCategory } from "./notifications";
import { categoryPills, filterFeed } from "./notification-feed-view";

function notification(
  id: string,
  category: NotificationCategory | null,
  readAt: string | null = null
): FeedNotification {
  return {
    id,
    kind: null,
    category,
    actorName: "Liam",
    title: `Liam did ${id}`,
    course: "Introduction to TypeScript",
    lessonTitle: null,
    snippet: null,
    url: "/courses/intro-ts",
    buttonLabel: "View course",
    insertedAt: "2026-11-17T10:00:00Z",
    seenAt: null,
    readAt,
  };
}

describe("categoryPills", () => {
  it("shows only All when there are no Notifications", () => {
    expect(categoryPills([])).toEqual(["all"]);
  });

  it("shows All, then only the categories present, in the fixed category order", () => {
    const items = [
      notification("1", "discussions"),
      notification("2", "refunds"),
      notification("3", "discussions"),
    ];
    expect(categoryPills(items)).toEqual(["all", "refunds", "discussions"]);
  });

  it("ignores Notifications with no known category", () => {
    expect(categoryPills([notification("1", null)])).toEqual(["all"]);
  });
});

describe("filterFeed", () => {
  const items = [
    notification("1", "refunds"),
    notification("2", "discussions", "2026-11-17T11:00:00Z"),
    notification("3", "discussions"),
    notification("4", null, "2026-11-17T11:00:00Z"),
  ];
  const ids = (kept: FeedNotification[]) => kept.map((item) => item.id);

  it("keeps everything, in order, for All", () => {
    expect(
      ids(filterFeed(items, { category: "all", unreadOnly: false }))
    ).toEqual(["1", "2", "3", "4"]);
  });

  it("keeps only the chosen category", () => {
    expect(
      ids(filterFeed(items, { category: "discussions", unreadOnly: false }))
    ).toEqual(["2", "3"]);
  });

  it("keeps only unread Notifications when Unread only is on", () => {
    expect(
      ids(filterFeed(items, { category: "all", unreadOnly: true }))
    ).toEqual(["1", "3"]);
  });

  it("combines category and Unread only", () => {
    expect(
      ids(filterFeed(items, { category: "discussions", unreadOnly: true }))
    ).toEqual(["3"]);
  });

  it("keeps nothing when the category has no Notifications", () => {
    expect(filterFeed(items, { category: "team", unreadOnly: false })).toEqual(
      []
    );
  });
});
