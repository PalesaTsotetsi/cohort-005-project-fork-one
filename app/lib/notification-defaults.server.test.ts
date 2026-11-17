import { describe, expect, it } from "vitest";
import { setEnrollmentsOffByDefault } from "./notifications.server";

// A stand-in for Knock's Management API environment defaults endpoints
// (GET and PUT /v1/environments/{slug}/defaults). It keeps one stored
// preference set per environment and records every write, so tests can see
// what the environment ends up with without ever calling Knock.
function fakeManagementApi(
  initial: Record<string, unknown> = {},
  serviceToken = "knock_st_test"
) {
  const stored = new Map<string, unknown>(Object.entries(initial));
  const writes: { environment: string; preferenceSet: unknown }[] = [];

  const fetch = async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const url = new URL(String(input));
    const match = url.pathname.match(/^\/v1\/environments\/([^/]+)\/defaults$/);
    if (url.origin !== "https://control.knock.app" || !match) {
      return new Response("Not found", { status: 404 });
    }
    const headers = new Headers(init?.headers);
    if (headers.get("authorization") !== `Bearer ${serviceToken}`) {
      return new Response("Unauthorized", { status: 401 });
    }
    const environment = decodeURIComponent(match[1]);
    const method = init?.method ?? "GET";
    if (method === "GET") {
      return Response.json({
        preference_set: stored.get(environment) ?? null,
        created_at: null,
        updated_at: null,
      });
    }
    if (method === "PUT") {
      const body: { preference_set: unknown } = JSON.parse(String(init?.body));
      stored.set(environment, body.preference_set);
      writes.push({ environment, preferenceSet: body.preference_set });
      return Response.json({ preference_set: body.preference_set });
    }
    return new Response("Method not allowed", { status: 405 });
  };

  return { fetch, stored, writes };
}

const enrollmentsOff = {
  categories: { enrollments: { channel_types: { in_app_feed: false } } },
};

describe("setEnrollmentsOffByDefault", () => {
  it("turns Enrollments off in an environment with no defaults yet", async () => {
    const knock = fakeManagementApi();

    await setEnrollmentsOffByDefault({
      environment: "development",
      serviceToken: "knock_st_test",
      fetch: knock.fetch,
    });

    expect(knock.stored.get("development")).toEqual(enrollmentsOff);
  });

  it("keeps every other default already set in the environment", async () => {
    const knock = fakeManagementApi({
      development: {
        channel_types: { email: true },
        categories: {
          refunds: false,
          enrollments: { channel_types: { email: true } },
        },
        workflows: { "seat-claimed": false },
      },
    });

    await setEnrollmentsOffByDefault({
      environment: "development",
      serviceToken: "knock_st_test",
      fetch: knock.fetch,
    });

    expect(knock.stored.get("development")).toEqual({
      channel_types: { email: true },
      categories: {
        refunds: false,
        enrollments: { channel_types: { email: true, in_app_feed: false } },
      },
      workflows: { "seat-claimed": false },
    });
  });

  it("turns Enrollments off when the environment had it on", async () => {
    const knock = fakeManagementApi({
      development: {
        categories: { enrollments: { channel_types: { in_app_feed: true } } },
      },
    });

    const result = await setEnrollmentsOffByDefault({
      environment: "development",
      serviceToken: "knock_st_test",
      fetch: knock.fetch,
    });

    expect(result.changed).toBe(true);
    expect(knock.stored.get("development")).toEqual(enrollmentsOff);
  });

  it("leaves the same result when run twice, writing only once", async () => {
    const knock = fakeManagementApi({
      development: { categories: { refunds: false } },
    });
    const options = {
      environment: "development",
      serviceToken: "knock_st_test",
      fetch: knock.fetch,
    };

    const first = await setEnrollmentsOffByDefault(options);
    const afterFirst = knock.stored.get("development");
    const second = await setEnrollmentsOffByDefault(options);

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(knock.stored.get("development")).toEqual(afterFirst);
    expect(knock.stored.get("development")).toEqual({
      categories: {
        refunds: false,
        enrollments: { channel_types: { in_app_feed: false } },
      },
    });
    expect(knock.writes).toHaveLength(1);
  });

  it("only touches the environment it is given", async () => {
    const knock = fakeManagementApi({
      production: { categories: { refunds: false } },
    });

    await setEnrollmentsOffByDefault({
      environment: "development",
      serviceToken: "knock_st_test",
      fetch: knock.fetch,
    });

    expect(knock.stored.get("production")).toEqual({
      categories: { refunds: false },
    });
  });

  it("fails loudly when Knock rejects the service token", async () => {
    const knock = fakeManagementApi({}, "knock_st_real");

    await expect(
      setEnrollmentsOffByDefault({
        environment: "development",
        serviceToken: "knock_st_wrong",
        fetch: knock.fetch,
      })
    ).rejects.toThrow(/401/);
    expect(knock.writes).toHaveLength(0);
  });
});
