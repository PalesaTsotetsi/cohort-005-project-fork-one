import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Knock from "@knocklabs/node";
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

export type RecordingTransport = NotificationTransport & {
  triggers: KnockTrigger[];
};

/** For tests: keeps every trigger instead of sending it. */
export function recordingTransport(): RecordingTransport {
  const triggers: KnockTrigger[] = [];
  return {
    triggers,
    async trigger(trigger) {
      triggers.push(trigger);
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

export function knockTransport(secretApiKey: string): NotificationTransport {
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
  };
}

const OUTBOX_DIRECTORY = join(".outbox", "notifications");

/** Reads the key on every call, so the .env loaded at startup applies. */
export function defaultTransport(): NotificationTransport {
  const secretApiKey = process.env.KNOCK_SECRET_API_KEY;
  return secretApiKey
    ? knockTransport(secretApiKey)
    : outboxTransport(OUTBOX_DIRECTORY);
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
    console.error(
      JSON.stringify({
        event: "notification_failed",
        kind: notification.kind,
        recipientIds: notification.recipients.map((r) => r.id),
        error: error instanceof Error ? error.message : String(error),
      })
    );
  }
}
