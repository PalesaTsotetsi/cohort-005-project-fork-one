// ─── Notifications ───
// The Cadence-owned shape of the eight v1 Notifications (see GLOSSARY.md).
// Domain operations build these, fully resolved, and return them; routes hand
// them to sendNotification in notifications.server.ts. Nothing here knows
// about Knock, so it is safe to import anywhere, including the browser.

export type NotificationCategory =
  | "refunds"
  | "team"
  | "enrollments"
  | "discussions";

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  "refunds",
  "team",
  "enrollments",
  "discussions",
];

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  refunds: "Refunds",
  team: "Team",
  enrollments: "Enrollments",
  discussions: "Discussions",
};

/** A Notification Preference switch a person is shown, and what it covers. */
export type NotificationSwitch = {
  category: NotificationCategory;
  /** What this category covers for this person. */
  description: string;
};

/** A person as a Notification carries them: only what the Feed may show. */
export type NotificationUser = {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
};

type NotificationBase = {
  actor: NotificationUser;
  recipients: NotificationUser[];
  courseTitle: string;
  /** Where the detail pane's button goes, relative to the app. */
  url: string;
};

export type Notification =
  | (NotificationBase & { kind: "refund-request-raised"; reason: string })
  | (NotificationBase & { kind: "refund-request-approved"; note: string | null })
  | (NotificationBase & { kind: "refund-request-declined"; note: string })
  | (NotificationBase & { kind: "open-refund-request"; reason: string })
  | (NotificationBase & { kind: "seat-claimed" })
  | (NotificationBase & { kind: "new-enrollment" })
  | (NotificationBase & { kind: "discussion-question"; lessonTitle: string; body: string })
  | (NotificationBase & { kind: "discussion-reply"; lessonTitle: string; body: string });

export type NotificationKind = Notification["kind"];

/** Every Notification kind; the type check below fails if one is missing. */
export const NOTIFICATION_KINDS = [
  "refund-request-raised",
  "refund-request-approved",
  "refund-request-declined",
  "open-refund-request",
  "seat-claimed",
  "new-enrollment",
  "discussion-question",
  "discussion-reply",
] as const satisfies readonly NotificationKind[];

type UnlistedKind = Exclude<
  NotificationKind,
  (typeof NOTIFICATION_KINDS)[number]
>;
type AssertTrue<T extends true> = T;
export type EveryKindListed = AssertTrue<
  [UnlistedKind] extends [never] ? true : false
>;

export function toNotificationUser(user: {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
}): NotificationUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
  };
}

/**
 * Nobody is notified of their own action. Returns the recipients other than
 * the actor; callers drop the Notification when none are left.
 */
export function othersThan(
  actor: NotificationUser,
  recipients: NotificationUser[]
): NotificationUser[] {
  return recipients.filter((r) => r.id !== actor.id);
}

export function courseUrl(courseSlug: string) {
  return `/courses/${courseSlug}`;
}

export function lessonUrl(courseSlug: string, lessonId: number) {
  return `/courses/${courseSlug}/lessons/${lessonId}`;
}

export function courseStudentsUrl(courseId: number) {
  return `/instructor/${courseId}/students`;
}

export function adminRefundsUrl() {
  return "/admin/refunds";
}
