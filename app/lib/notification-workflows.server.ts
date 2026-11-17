// ─── Knock workflows as code ───
// One Knock workflow per Notification kind: one in-app feed step, its
// Notification Category, and the click action {{ url }}. Templates read names
// only from trigger data, so they stay as they were at send time.
// Written through Knock's Management API with an account service token
// (https://docs.knock.app/mapi-reference/workflows/upsert). Upserting is safe
// to repeat: Knock commits only when something changed.
// Re-exported from notifications.server.ts, the notifications seam.

import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_KINDS,
  type NotificationCategory,
  type NotificationKind,
} from "~/lib/notifications";

const MANAGEMENT_API_URL = "https://control.knock.app/v1";

type Fetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export type WorkflowDefinition = {
  key: NotificationKind;
  name: string;
  category: NotificationCategory;
  /** The Feed title: one line, starting with who did it. */
  markdownBody: string;
};

export const NOTIFICATION_WORKFLOWS: Record<
  NotificationKind,
  WorkflowDefinition
> = {
  "refund-request-raised": {
    key: "refund-request-raised",
    name: "Refund Request raised",
    category: "refunds",
    markdownBody:
      "**{{ actor_name }}** raised a Refund Request for {{ course_title }}",
  },
  "refund-request-approved": {
    key: "refund-request-approved",
    name: "Refund Request approved",
    category: "refunds",
    markdownBody:
      "**{{ actor_name }}** approved your Refund Request for {{ course_title }}",
  },
  "refund-request-declined": {
    key: "refund-request-declined",
    name: "Refund Request declined",
    category: "refunds",
    markdownBody:
      "**{{ actor_name }}** declined your Refund Request for {{ course_title }}",
  },
  "open-refund-request": {
    key: "open-refund-request",
    name: "New Open Refund Request",
    category: "refunds",
    markdownBody:
      "**{{ actor_name }}** raised a Refund Request for {{ course_title }}",
  },
  "seat-claimed": {
    key: "seat-claimed",
    name: "Seat claimed",
    category: "team",
    markdownBody: "**{{ actor_name }}** claimed a Seat for {{ course_title }}",
  },
  "new-enrollment": {
    key: "new-enrollment",
    name: "New Enrollment",
    category: "enrollments",
    markdownBody: "**{{ actor_name }}** enrolled in {{ course_title }}",
  },
  "discussion-question": {
    key: "discussion-question",
    name: "Discussion Question",
    category: "discussions",
    markdownBody:
      "**{{ actor_name }}** asked a question on “{{ lesson_title }}”",
  },
  "discussion-reply": {
    key: "discussion-reply",
    name: "Discussion Reply",
    category: "discussions",
    markdownBody:
      "**{{ actor_name }}** replied to your question on “{{ lesson_title }}”",
  },
};

/** The Management API body for one workflow. */
export function toWorkflowBody(
  definition: WorkflowDefinition,
  channelKey: string
) {
  return {
    workflow: {
      name: definition.name,
      categories: [definition.category],
      steps: [
        {
          type: "channel",
          ref: "in_app_feed_1",
          channel_key: channelKey,
          template: {
            markdown_body: definition.markdownBody,
            action_url: "{{ url }}",
          },
        },
      ],
    },
  };
}

export type UpsertWorkflowsOptions = {
  /** Knock environment slug; Management API writes go to development. */
  environment: string;
  serviceToken: string;
  /** The in-app feed channel's id (KNOCK_FEED_CHANNEL_ID). */
  feedChannelId: string;
  fetch?: Fetch;
};

async function request(
  fetch: Fetch,
  url: string,
  serviceToken: string,
  init: RequestInit = {}
): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${serviceToken}`,
      Accept: "application/json",
      ...(init.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
    },
  });
  if (!response.ok) {
    throw new Error(
      `Knock Management API ${init.method ?? "GET"} ${url} failed: ${response.status} ${await response.text()}`
    );
  }
  return response.json();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Finds the feed channel's key; workflow steps name channels by key. */
async function feedChannelKey(
  fetch: Fetch,
  serviceToken: string,
  feedChannelId: string
): Promise<string> {
  const body = await request(
    fetch,
    `${MANAGEMENT_API_URL}/channels`,
    serviceToken
  );
  const entries =
    isRecord(body) && Array.isArray(body.entries) ? body.entries : [];
  const channel = entries.find(
    (entry): entry is Record<string, unknown> =>
      isRecord(entry) && entry.id === feedChannelId
  );
  if (!channel || typeof channel.key !== "string") {
    throw new Error(`No Knock channel has the id ${feedChannelId}.`);
  }
  return channel.key;
}

/**
 * Creates or updates every Notification workflow in an environment and
 * commits each one. Returns the workflow keys it wrote.
 */
export async function upsertNotificationWorkflows({
  environment,
  serviceToken,
  feedChannelId,
  fetch = globalThis.fetch,
}: UpsertWorkflowsOptions): Promise<NotificationKind[]> {
  const channelKey = await feedChannelKey(fetch, serviceToken, feedChannelId);
  // A workflow may only name categories already in Knock's preference
  // category catalog, so make sure every Notification Category is there.
  for (const category of NOTIFICATION_CATEGORIES) {
    await request(
      fetch,
      `${MANAGEMENT_API_URL}/preference_categories/${encodeURIComponent(category)}?${new URLSearchParams({ environment })}`,
      serviceToken,
      { method: "PUT", body: "{}" }
    );
  }
  const written: NotificationKind[] = [];
  for (const kind of NOTIFICATION_KINDS) {
    const definition = NOTIFICATION_WORKFLOWS[kind];
    const params = new URLSearchParams({
      environment,
      commit: "true",
      commit_message: `Cadence: ${definition.name}`,
    });
    await request(
      fetch,
      `${MANAGEMENT_API_URL}/workflows/${encodeURIComponent(kind)}?${params}`,
      serviceToken,
      {
        method: "PUT",
        body: JSON.stringify(toWorkflowBody(definition, channelKey)),
      }
    );
    written.push(kind);
  }
  return written;
}
