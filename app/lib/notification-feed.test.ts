import { describe, expect, it } from "vitest";
import type { PreferenceSet } from "@knocklabs/client";
import { enabledFromPreferenceSet } from "./notification-feed";

function preferenceSet(categories: PreferenceSet["categories"]): PreferenceSet {
  return {
    id: "default",
    categories,
    workflows: null,
    channel_types: null,
    channels: null,
  };
}

describe("enabledFromPreferenceSet", () => {
  it("shows every category on when Knock says nothing about any of them", () => {
    expect(enabledFromPreferenceSet(preferenceSet({}))).toEqual({
      refunds: true,
      team: true,
      enrollments: true,
      discussions: true,
    });
  });

  it("shows Enrollments off only when Knock's set turns its Feed off", () => {
    const set = preferenceSet({
      enrollments: { channel_types: { in_app_feed: false } },
    });
    expect(enabledFromPreferenceSet(set).enrollments).toBe(false);
  });

  it("reads a category set to a plain boolean", () => {
    const set = preferenceSet({ discussions: false });
    expect(enabledFromPreferenceSet(set).discussions).toBe(false);
  });
});
