// ─── Environment default preference set ───
// "Enrollments off" lives only in a Knock environment's default preference
// set: every person reads Enrollments as off until they turn it on. Knock's
// main API can't write that set; its Management API can, with an account
// service token (https://docs.knock.app/mapi-reference/environments/defaults).
// The PUT replaces the whole set, so this reads the current set, merges
// Enrollments off into it, and writes only when something would change.
// Re-exported from notifications.server.ts, the notifications seam.

const MANAGEMENT_API_URL = "https://control.knock.app/v1";

type PreferenceSet = Record<string, unknown>;

type Fetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export type EnvironmentDefaultsOptions = {
  /** Knock environment slug, e.g. "development" or "production". */
  environment: string;
  /** Account service token (knock_st_…), not an environment secret key. */
  serviceToken: string;
  fetch?: Fetch;
};

export type EnvironmentDefaultsResult = {
  changed: boolean;
  preferenceSet: PreferenceSet;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Merges Enrollments off into a set, keeping everything else in it. */
export function withEnrollmentsOff(
  current: PreferenceSet | null
): PreferenceSet {
  const set = current ?? {};
  const categories = isRecord(set.categories) ? set.categories : {};
  const enrollments = isRecord(categories.enrollments)
    ? categories.enrollments
    : {};
  const channelTypes = isRecord(enrollments.channel_types)
    ? enrollments.channel_types
    : {};
  return {
    ...set,
    categories: {
      ...categories,
      enrollments: {
        ...enrollments,
        channel_types: { ...channelTypes, in_app_feed: false },
      },
    },
  };
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys(value[key])])
  );
}

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

/**
 * Sets categories.enrollments.channel_types.in_app_feed to false in an
 * environment's default preference set. Safe to run again: a second run
 * finds the set already right and writes nothing.
 */
export async function setEnrollmentsOffByDefault({
  environment,
  serviceToken,
  fetch = globalThis.fetch,
}: EnvironmentDefaultsOptions): Promise<EnvironmentDefaultsResult> {
  const url = `${MANAGEMENT_API_URL}/environments/${encodeURIComponent(environment)}/defaults`;
  const current = await request(fetch, url, serviceToken);
  const currentSet =
    isRecord(current) && isRecord(current.preference_set)
      ? current.preference_set
      : null;
  const preferenceSet = withEnrollmentsOff(currentSet);
  if (currentSet !== null && sameJson(currentSet, preferenceSet)) {
    return { changed: false, preferenceSet };
  }
  await request(fetch, url, serviceToken, {
    method: "PUT",
    body: JSON.stringify({ preference_set: preferenceSet }),
  });
  return { changed: true, preferenceSet };
}
