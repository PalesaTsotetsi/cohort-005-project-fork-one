import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_WORKFLOWS,
  toWorkflowBody,
  upsertNotificationWorkflows,
} from "~/lib/notification-workflows.server";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_KINDS,
} from "~/lib/notifications";

type WorkflowBody = ReturnType<typeof toWorkflowBody>;

const FEED_ID = "fde2f1f8-a85a-43cb-9778-5a5853031ad8";

function fakeManagementApi() {
  const puts: { url: string; body: WorkflowBody }[] = [];
  const categories: string[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/channels")) {
      return Response.json({
        entries: [
          { id: "other", key: "knock", type: "in_app_feed" },
          { id: FEED_ID, key: "cadence-feed", type: "in_app_feed" },
        ],
      });
    }
    const category = new URL(url).pathname.match(
      /^\/v1\/preference_categories\/(.+)$/
    );
    if (category) {
      categories.push(category[1]);
      return Response.json({ name: category[1] });
    }
    puts.push({ url, body: JSON.parse(String(init?.body)) as WorkflowBody });
    return Response.json({ workflow: {} });
  };
  return { fetch, puts, categories };
}

describe("upsertNotificationWorkflows", () => {
  it("writes one committed workflow per Notification kind to the given environment", async () => {
    const api = fakeManagementApi();

    const written = await upsertNotificationWorkflows({
      environment: "development",
      serviceToken: "knock_st_test",
      feedChannelId: FEED_ID,
      fetch: api.fetch,
    });

    expect(written).toEqual([...NOTIFICATION_KINDS]);
    for (const [index, kind] of NOTIFICATION_KINDS.entries()) {
      const url = new URL(api.puts[index].url);
      expect(url.pathname).toBe(`/v1/workflows/${kind}`);
      expect(url.searchParams.get("environment")).toBe("development");
      expect(url.searchParams.get("commit")).toBe("true");
    }
  });

  it("gives each workflow its category and a single feed step on the feed channel that opens {{ url }}", async () => {
    const api = fakeManagementApi();

    await upsertNotificationWorkflows({
      environment: "development",
      serviceToken: "knock_st_test",
      feedChannelId: FEED_ID,
      fetch: api.fetch,
    });

    const reply = api.puts.find((put) =>
      put.url.includes("/discussion-reply?")
    );
    expect(reply?.body.workflow.categories).toEqual(["discussions"]);
    expect(reply?.body.workflow.steps).toEqual([
      {
        type: "channel",
        ref: "in_app_feed_1",
        channel_key: "cadence-feed",
        template: {
          markdown_body:
            NOTIFICATION_WORKFLOWS["discussion-reply"].markdownBody,
          action_url: "{{ url }}",
        },
      },
    ]);
  });

  it("adds every Notification Category to Knock's catalog before writing workflows", async () => {
    const api = fakeManagementApi();

    await upsertNotificationWorkflows({
      environment: "development",
      serviceToken: "knock_st_test",
      feedChannelId: FEED_ID,
      fetch: api.fetch,
    });

    expect(api.categories).toEqual([...NOTIFICATION_CATEGORIES]);
  });

  it("fails before writing anything when the feed channel id is unknown", async () => {
    const api = fakeManagementApi();

    await expect(
      upsertNotificationWorkflows({
        environment: "development",
        serviceToken: "knock_st_test",
        feedChannelId: "missing",
        fetch: api.fetch,
      })
    ).rejects.toThrow("missing");
    expect(api.puts).toEqual([]);
    expect(api.categories).toEqual([]);
  });
});

describe("NOTIFICATION_WORKFLOWS", () => {
  it("names each workflow by the key toKnockTrigger triggers", () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(NOTIFICATION_WORKFLOWS[kind].key).toBe(kind);
    }
  });

  it("reads names only from trigger data, never from Knock's user records", () => {
    for (const kind of NOTIFICATION_KINDS) {
      const body = NOTIFICATION_WORKFLOWS[kind].markdownBody;
      expect(body.startsWith("**{{ actor_name }}**")).toBe(true);
      expect(body).not.toMatch(/recipient\.|actor\./);
    }
  });
});
