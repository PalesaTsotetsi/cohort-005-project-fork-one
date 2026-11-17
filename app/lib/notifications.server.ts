import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Knock, { signUserToken as knockSignUserToken } from "@knocklabs/node";
import { logFailure } from "~/lib/log.server";
import type {
  Notification,
  NotificationKind,
  NotificationUser,
} from "~/lib/notifications";

// ─── Notifications server seam ───
// The only importer of @knocklabs/node. Routes hand each Notification a
// domain operation returned to sendNotification, which never throws. Knock
// delivers when KNOCK_SECRET_API_KEY is set; without it (local dev) each
// Notification is written to .outbox/notifications/ as a JSON file instead.

/** A person as Knock receives them: nothing beyond what the Feed may show. */
export type KnockUser = {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
};

/** The display data every workflow template reads. */
export type KnockData = {
  actor_name: string;
  course_title: string;
  url: string;
  button_label: string;
  snippet?: string;
  lesson_title?: string;
};

export type KnockTrigger = {
  /** Knock workflow key; each Notification kind has its own workflow. */
  workflow: NotificationKind;
  actor: KnockUser;
  recipients: KnockUser[];
  data: KnockData;
};

function toKnockUser(user: NotificationUser): KnockUser {
  return {
    id: String(user.id),
    name: user.name,
    email: user.email,
    avatar: user.avatarUrl,
  };
}

function displayData(
  notification: Notification
): Pick<KnockData, "button_label" | "snippet" | "lesson_title"> {
  switch (notification.kind) {
    case "refund-request-raised":
      return { button_label: "View course", snippet: notification.reason };
    case "refund-request-approved":
      return notification.note === null
        ? { button_label: "View course" }
        : { button_label: "View course", snippet: notification.note };
    case "refund-request-declined":
      return { button_label: "View course", snippet: notification.note };
    case "open-refund-request":
      return { button_label: "Review request", snippet: notification.reason };
    case "seat-claimed":
      return { button_label: "View team" };
    case "new-enrollment":
      return { button_label: "View students" };
    case "discussion-question":
      return {
        button_label: "Answer",
        snippet: notification.body,
        lesson_title: notification.lessonTitle,
      };
    case "discussion-reply":
      return {
        button_label: "View reply",
        snippet: notification.body,
        lesson_title: notification.lessonTitle,
      };
  }
}

/** Maps a Cadence Notification to the Knock workflow trigger it causes. */
export function toKnockTrigger(notification: Notification): KnockTrigger {
  return {
    workflow: notification.kind,
    actor: toKnockUser(notification.actor),
    recipients: notification.recipients.map(toKnockUser),
    data: {
      actor_name: notification.actor.name,
      course_title: notification.courseTitle,
      url: notification.url,
      ...displayData(notification),
    },
  };
}

// ─── Transports ───

export interface NotificationTransport {
  trigger(trigger: KnockTrigger, notification: Notification): Promise<void>;
}

/** Upserts a person in Knock before the browser reads their preferences. */
export interface IdentifyTransport {
  identify(user: KnockUser): Promise<void>;
}

export type RecordingTransport = NotificationTransport &
  IdentifyTransport & {
    triggers: KnockTrigger[];
    identified: KnockUser[];
  };

/** For tests: keeps every trigger and identify call instead of sending it. */
export function recordingTransport(): RecordingTransport {
  const triggers: KnockTrigger[] = [];
  const identified: KnockUser[] = [];
  return {
    triggers,
    identified,
    async trigger(trigger) {
      triggers.push(trigger);
    },
    async identify(user) {
      identified.push(user);
    },
  };
}

/** Without Knock keys: each Notification becomes a JSON file to read. */
export function outboxTransport(directory: string): NotificationTransport {
  return {
    async trigger(trigger, notification) {
      mkdirSync(directory, { recursive: true });
      const file = join(
        directory,
        `${Date.now()}-${trigger.workflow}-${randomUUID()}.json`
      );
      writeFileSync(
        file,
        JSON.stringify({ workflow: trigger.workflow, notification }, null, 2)
      );
    },
  };
}

// The SDK's own retries (with backoff and one idempotency key per call) cover
// a blip; the short timeout keeps a slow Knock from hanging the action.
const KNOCK_MAX_RETRIES = 2;
const KNOCK_TIMEOUT_MS = 3_000;

export function knockTransport(
  secretApiKey: string
): NotificationTransport & IdentifyTransport {
  const knock = new Knock({
    apiKey: secretApiKey,
    maxRetries: KNOCK_MAX_RETRIES,
    timeout: KNOCK_TIMEOUT_MS,
  });
  return {
    async trigger(trigger) {
      await knock.workflows.trigger(trigger.workflow, {
        actor: trigger.actor,
        recipients: trigger.recipients,
        data: trigger.data,
      });
    },
    async identify({ id, ...properties }) {
      await knock.users.update(id, properties);
    },
  };
}

const OUTBOX_DIRECTORY = join(".outbox", "notifications");

/**
 * Knock, when KNOCK_SECRET_API_KEY is set. Reads the key on every call, so
 * the .env loaded at startup applies.
 */
function knockTransportFromEnv():
  (NotificationTransport & IdentifyTransport) | null {
  const secretApiKey = process.env.KNOCK_SECRET_API_KEY;
  return secretApiKey ? knockTransport(secretApiKey) : null;
}

export function defaultTransport(): NotificationTransport {
  return knockTransportFromEnv() ?? outboxTransport(OUTBOX_DIRECTORY);
}

/**
 * Sends after the write has already happened, so it never throws: a failed
 * Notification is logged as one structured line and the action still
 * succeeds. There is no re-send.
 */
export async function sendNotification(
  notification: Notification,
  transport: NotificationTransport = defaultTransport()
): Promise<void> {
  try {
    await transport.trigger(toKnockTrigger(notification), notification);
  } catch (error) {
    logFailure(
      "notification_failed",
      {
        kind: notification.kind,
        recipientIds: notification.recipients.map((r) => r.id),
      },
      error
    );
  }
}

/**
 * Sends each Notification in turn, like sendNotification: never throws, and
 * one failing doesn't stop the rest.
 */
export async function sendNotifications(
  notifications: Notification[],
  transport: NotificationTransport = defaultTransport()
): Promise<void> {
  for (const notification of notifications) {
    await sendNotification(notification, transport);
  }
}

/**
 * Only Knock can identify: without KNOCK_SECRET_API_KEY there is nothing to
 * identify with, so this is null and preferences are unavailable.
 */
export function defaultIdentifyTransport(): IdentifyTransport | null {
  return knockTransportFromEnv();
}

/**
 * Sends the person's id, name, email and avatar to Knock, so the browser can
 * read and write their preferences. Never throws: resolves false when there
 * is no key or Knock fails (logged as one structured line), and the caller
 * shows preferences as unavailable.
 */
export async function identifyNotificationUser(
  user: NotificationUser,
  transport: IdentifyTransport | null = defaultIdentifyTransport()
): Promise<boolean> {
  if (transport === null) return false;
  try {
    await transport.identify(toKnockUser(user));
    return true;
  } catch (error) {
    logFailure("identify_failed", { userId: user.id }, error);
    return false;
  }
}

// ─── Feed access for the browser ───
// Enhanced security is on in Knock, so the browser reads a person's Feed and
// preferences only with a token signed for that person.

const USER_TOKEN_LIFETIME_SECONDS = 60 * 60;

/**
 * The signing key is kept on one line: either base64 of the PEM, or the PEM
 * with its newlines written as a literal "\n".
 */
function toPem(signingKey: string): string {
  const key = signingKey.trim();
  if (key.startsWith("-----BEGIN")) return key.replaceAll("\\n", "\n");
  return Buffer.from(key, "base64").toString("utf8");
}

/** Mints an RS256 token for this user that expires in about an hour. */
export function signUserToken(
  userId: number,
  signingKey: string
): Promise<string> {
  return knockSignUserToken(String(userId), {
    signingKey: toPem(signingKey),
    expiresInSeconds: USER_TOKEN_LIFETIME_SECONDS,
  });
}

/** What the browser needs to open the session user's Notification Feed. */
export type NotificationFeedConfig = {
  /** null when the Feed can't be opened; the browser then reports it unavailable. */
  token: string | null;
  publicKey: string | null;
  feedChannelId: string | null;
};

/**
 * Reads the keys on every call. Without a user, the signing key, the public
 * key or the feed channel id there is no token. A key that fails to sign is
 * logged as one line and also gives no token, so the page still renders.
 */
export async function notificationFeedConfig(
  userId: number | null
): Promise<NotificationFeedConfig> {
  const publicKey = process.env.KNOCK_PUBLIC_API_KEY || null;
  const feedChannelId = process.env.KNOCK_FEED_CHANNEL_ID || null;
  const signingKey = process.env.KNOCK_SIGNING_KEY;
  if (userId === null || !signingKey || !publicKey || !feedChannelId) {
    return { token: null, publicKey, feedChannelId };
  }
  try {
    const token = await signUserToken(userId, signingKey);
    return { token, publicKey, feedChannelId };
  } catch (error) {
    logFailure("user_token_failed", { userId }, error);
    return { token: null, publicKey, feedChannelId };
  }
}

// The environment default preference set ("Enrollments off") is written
// through Knock's Management API; see notification-defaults.server.ts.
export {
  setEnrollmentsOffByDefault,
  type EnvironmentDefaultsResult,
} from "~/lib/notification-defaults.server";
export {
  upsertNotificationWorkflows,
  NOTIFICATION_WORKFLOWS,
} from "~/lib/notification-workflows.server";
