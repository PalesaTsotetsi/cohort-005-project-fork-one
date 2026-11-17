import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Notification, NotificationUser } from "./notifications";
import {
  outboxTransport,
  recordingTransport,
  sendNotification,
  toKnockTrigger,
  type NotificationTransport,
} from "./notifications.server";

const emma: NotificationUser = {
  id: 7,
  name: "Emma Wilson",
  email: "emma@example.com",
  avatarUrl: "https://example.com/emma.png",
};

const sarah: NotificationUser = {
  id: 2,
  name: "Sarah Chen",
  email: "sarah@example.com",
  avatarUrl: null,
};

const pat: NotificationUser = {
  id: 1,
  name: "Pat Admin",
  email: "pat@example.com",
  avatarUrl: null,
};

// What Knock should receive for each person above: string ids, avatar, and
// nothing else.
const emmaInKnock = {
  id: "7",
  name: "Emma Wilson",
  email: "emma@example.com",
  avatar: "https://example.com/emma.png",
};
const sarahInKnock = {
  id: "2",
  name: "Sarah Chen",
  email: "sarah@example.com",
  avatar: null,
};
const patInKnock = {
  id: "1",
  name: "Pat Admin",
  email: "pat@example.com",
  avatar: null,
};

const course = {
  courseTitle: "Introduction to TypeScript",
  url: "/courses/intro-ts",
};

describe("toKnockTrigger", () => {
  it("maps a Discussion Question to its workflow, people and lesson data", () => {
    const trigger = toKnockTrigger({
      kind: "discussion-question",
      actor: emma,
      recipients: [sarah],
      courseTitle: "Introduction to TypeScript",
      url: "/courses/intro-ts/lessons/12",
      lessonTitle: "Generics",
      body: "Why does this not infer?",
    });

    expect(trigger).toEqual({
      workflow: "discussion-question",
      actor: {
        id: "7",
        name: "Emma Wilson",
        email: "emma@example.com",
        avatar: "https://example.com/emma.png",
      },
      recipients: [
        { id: "2", name: "Sarah Chen", email: "sarah@example.com", avatar: null },
      ],
      data: {
        actor_name: "Emma Wilson",
        course_title: "Introduction to TypeScript",
        url: "/courses/intro-ts/lessons/12",
        button_label: "Answer",
        snippet: "Why does this not infer?",
        lesson_title: "Generics",
      },
    });
  });

  it("maps a Discussion Reply to its workflow, people and lesson data", () => {
    expect(
      toKnockTrigger({
        kind: "discussion-reply",
        actor: sarah,
        recipients: [emma],
        courseTitle: "Introduction to TypeScript",
        url: "/courses/intro-ts/lessons/12",
        lessonTitle: "Generics",
        body: "Add a type parameter.",
      })
    ).toEqual({
      workflow: "discussion-reply",
      actor: sarahInKnock,
      recipients: [emmaInKnock],
      data: {
        actor_name: "Sarah Chen",
        course_title: "Introduction to TypeScript",
        url: "/courses/intro-ts/lessons/12",
        button_label: "View reply",
        snippet: "Add a type parameter.",
        lesson_title: "Generics",
      },
    });
  });

  it("maps a raised Refund Request to the buyer, quoting the reason", () => {
    expect(
      toKnockTrigger({
        kind: "refund-request-raised",
        actor: emma,
        recipients: [emma],
        ...course,
        reason: "Not what I expected",
      })
    ).toEqual({
      workflow: "refund-request-raised",
      actor: emmaInKnock,
      recipients: [emmaInKnock],
      data: {
        actor_name: "Emma Wilson",
        course_title: "Introduction to TypeScript",
        url: "/courses/intro-ts",
        button_label: "View course",
        snippet: "Not what I expected",
      },
    });
  });

  it("maps an approved Refund Request with a decision note as its snippet", () => {
    expect(
      toKnockTrigger({
        kind: "refund-request-approved",
        actor: pat,
        recipients: [emma],
        ...course,
        note: "Sorry it didn't work out",
      })
    ).toEqual({
      workflow: "refund-request-approved",
      actor: patInKnock,
      recipients: [emmaInKnock],
      data: {
        actor_name: "Pat Admin",
        course_title: "Introduction to TypeScript",
        url: "/courses/intro-ts",
        button_label: "View course",
        snippet: "Sorry it didn't work out",
      },
    });
  });

  it("maps an approved Refund Request without a note to no snippet", () => {
    expect(
      toKnockTrigger({
        kind: "refund-request-approved",
        actor: pat,
        recipients: [emma],
        ...course,
        note: null,
      }).data
    ).toEqual({
      actor_name: "Pat Admin",
      course_title: "Introduction to TypeScript",
      url: "/courses/intro-ts",
      button_label: "View course",
    });
  });

  it("maps a declined Refund Request, quoting the decision note", () => {
    expect(
      toKnockTrigger({
        kind: "refund-request-declined",
        actor: pat,
        recipients: [emma],
        ...course,
        note: "You watched most of it",
      })
    ).toEqual({
      workflow: "refund-request-declined",
      actor: patInKnock,
      recipients: [emmaInKnock],
      data: {
        actor_name: "Pat Admin",
        course_title: "Introduction to TypeScript",
        url: "/courses/intro-ts",
        button_label: "View course",
        snippet: "You watched most of it",
      },
    });
  });

  it("maps a New Open Refund Request to the Platform Admins, quoting the reason", () => {
    expect(
      toKnockTrigger({
        kind: "open-refund-request",
        actor: emma,
        recipients: [pat],
        courseTitle: "Introduction to TypeScript",
        url: "/admin/refunds",
        reason: "Not what I expected",
      })
    ).toEqual({
      workflow: "open-refund-request",
      actor: emmaInKnock,
      recipients: [patInKnock],
      data: {
        actor_name: "Emma Wilson",
        course_title: "Introduction to TypeScript",
        url: "/admin/refunds",
        button_label: "Review request",
        snippet: "Not what I expected",
      },
    });
  });

  it("maps a Seat claimed to the Team Admin with no snippet", () => {
    expect(
      toKnockTrigger({
        kind: "seat-claimed",
        actor: emma,
        recipients: [pat],
        courseTitle: "Introduction to TypeScript",
        url: "/team",
      })
    ).toEqual({
      workflow: "seat-claimed",
      actor: emmaInKnock,
      recipients: [patInKnock],
      data: {
        actor_name: "Emma Wilson",
        course_title: "Introduction to TypeScript",
        url: "/team",
        button_label: "View team",
      },
    });
  });

  it("maps a New Enrollment to the Instructor with no snippet", () => {
    expect(
      toKnockTrigger({
        kind: "new-enrollment",
        actor: emma,
        recipients: [sarah],
        courseTitle: "Introduction to TypeScript",
        url: "/instructor/3/students",
      })
    ).toEqual({
      workflow: "new-enrollment",
      actor: emmaInKnock,
      recipients: [sarahInKnock],
      data: {
        actor_name: "Emma Wilson",
        course_title: "Introduction to TypeScript",
        url: "/instructor/3/students",
        button_label: "View students",
      },
    });
  });
});

describe("sendNotification", () => {
  const question: Notification = {
    kind: "discussion-question",
    actor: emma,
    recipients: [sarah],
    courseTitle: "Introduction to TypeScript",
    url: "/courses/intro-ts/lessons/12",
    lessonTitle: "Generics",
    body: "Why does this not infer?",
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hands the Notification's trigger to the transport", async () => {
    const transport = recordingTransport();

    await sendNotification(question, transport);

    expect(transport.triggers).toHaveLength(1);
    expect(transport.triggers[0]).toMatchObject({
      workflow: "discussion-question",
      recipients: [{ id: "2" }],
      data: { button_label: "Answer", snippet: "Why does this not infer?" },
    });
  });

  it("resolves and logs one structured line when the transport fails", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing: NotificationTransport = {
      async trigger() {
        throw new Error("Knock is down");
      },
    };

    await expect(sendNotification(question, failing)).resolves.toBeUndefined();

    expect(errorLog).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(errorLog.mock.calls[0][0]));
    expect(line).toEqual({
      event: "notification_failed",
      kind: "discussion-question",
      recipientIds: [2],
      error: "Knock is down",
    });
  });

  it("writes the Notification and its workflow to the outbox", async () => {
    const directory = mkdtempSync(join(tmpdir(), "notifications-"));

    await sendNotification(question, outboxTransport(directory));

    const files = readdirSync(directory);
    expect(files).toHaveLength(1);
    const written = JSON.parse(readFileSync(join(directory, files[0]), "utf8"));
    expect(written).toEqual({ workflow: "discussion-question", notification: question });
  });
});
