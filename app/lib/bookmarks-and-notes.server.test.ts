import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import {
  isBookmarked,
  listBookmarks,
  toggleBookmark,
} from "./bookmarks.server";
import { getNote, listNotes, saveNote } from "./notes.server";
import { approveRefundRequest, raiseRefundRequest } from "./refunds.server";
import { fakeNotifications } from "./notifications.fake.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

function minutesAfter(minutes: number) {
  return new Date(NOW.getTime() + minutes * 60_000);
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonIds: number[];

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2, 3].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: UserRole.Student,
    })
    .returning()
    .get();
}

describe("toggling a Bookmark", () => {
  it("bookmarks a Lesson with no Bookmark, and un-bookmarks it on the next toggle", () => {
    const [lesson] = lessonIds;

    expect(toggleBookmark(db, base.user.id, lesson, NOW)).toBe(true);
    expect(isBookmarked(db, base.user.id, lesson)).toBe(true);

    expect(toggleBookmark(db, base.user.id, lesson, NOW)).toBe(false);
    expect(isBookmarked(db, base.user.id, lesson)).toBe(false);
  });

  it("never leaves a Student with two Bookmarks on the same Lesson", () => {
    const [lesson] = lessonIds;
    toggleBookmark(db, base.user.id, lesson, NOW);

    expect(() =>
      db
        .insert(schema.bookmarks)
        .values({ userId: base.user.id, lessonId: lesson })
        .run()
    ).toThrow();
    expect(listBookmarks(db, base.user.id)).toHaveLength(1);
  });
});

describe("saving a Note", () => {
  it("creates a Note on a Lesson with none, with the body trimmed", () => {
    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "  Rewatch 3:10  ",
      NOW
    );

    expect(result.ok).toBe(true);
    expect(getNote(db, base.user.id, lessonIds[0])).toMatchObject({
      body: "Rewatch 3:10",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
  });

  it("replaces the body and moves the last-edited time on when saved again", () => {
    saveNote(db, base.user.id, lessonIds[0], "First draft", NOW);
    saveNote(db, base.user.id, lessonIds[0], "Second draft", minutesAfter(5));

    expect(getNote(db, base.user.id, lessonIds[0])).toMatchObject({
      body: "Second draft",
      createdAt: NOW.toISOString(),
      updatedAt: minutesAfter(5).toISOString(),
    });
    expect(listNotes(db, base.user.id)).toHaveLength(1);
  });

  it("never leaves a Student with two Notes on the same Lesson", () => {
    saveNote(db, base.user.id, lessonIds[0], "Mine", NOW);

    expect(() =>
      db
        .insert(schema.notes)
        .values({ userId: base.user.id, lessonId: lessonIds[0], body: "Dupe" })
        .run()
    ).toThrow();
  });

  it("accepts a Note of exactly 2,000 characters", () => {
    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "a".repeat(2000),
      NOW
    );

    expect(result.ok).toBe(true);
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toHaveLength(2000);
  });

  it("refuses a Note over 2,000 characters with a message, and stores nothing", () => {
    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "a".repeat(2001),
      NOW
    );

    expect(result).toEqual({
      ok: false,
      error: "A note can be at most 2,000 characters.",
    });
    expect(getNote(db, base.user.id, lessonIds[0])).toBeUndefined();
  });

  it("keeps characters like # and * exactly as typed", () => {
    saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "# not a heading\n*not bold*",
      NOW
    );

    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe(
      "# not a heading\n*not bold*"
    );
  });
});

describe("the Saved lists", () => {
  it("hold only the Student's own rows, newest first, each with its Lesson and Course", () => {
    const other = addStudent("Priya");
    const [first, second, third] = lessonIds;

    toggleBookmark(db, base.user.id, first, NOW);
    toggleBookmark(db, base.user.id, second, minutesAfter(1));
    toggleBookmark(db, other.id, third, minutesAfter(2));

    saveNote(db, base.user.id, first, "Older note", NOW);
    saveNote(db, base.user.id, second, "Newer note", minutesAfter(1));
    saveNote(db, other.id, third, "Priya's note", minutesAfter(2));
    // Re-saving moves a Note to the top.
    saveNote(db, base.user.id, first, "Edited note", minutesAfter(3));

    expect(listBookmarks(db, base.user.id)).toEqual([
      expect.objectContaining({
        lessonId: second,
        lessonTitle: "Lesson 2",
        courseTitle: "Test Course",
        courseSlug: "test-course",
      }),
      expect.objectContaining({ lessonId: first, lessonTitle: "Lesson 1" }),
    ]);

    expect(listNotes(db, base.user.id)).toEqual([
      expect.objectContaining({
        lessonId: first,
        body: "Edited note",
        courseTitle: "Test Course",
        courseSlug: "test-course",
      }),
      expect.objectContaining({ lessonId: second, body: "Newer note" }),
    ]);
  });
});

describe("an approved Refund", () => {
  it("leaves the Student's Bookmarks and Notes in place", async () => {
    const notifications = fakeNotifications();
    const platformAdmin = db
      .insert(schema.users)
      .values({
        name: "Pat Admin",
        email: "pat@example.com",
        role: UserRole.Admin,
      })
      .returning()
      .get();
    const purchase = db
      .insert(schema.purchases)
      .values({
        userId: base.user.id,
        courseId: base.course.id,
        amountPaid: 7900,
        createdAt: NOW.toISOString(),
      })
      .returning()
      .get();
    db.insert(schema.enrollments)
      .values({ userId: base.user.id, courseId: base.course.id })
      .run();

    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    saveNote(db, base.user.id, lessonIds[0], "Keep me", NOW);

    const raised = await raiseRefundRequest(
      db,
      purchase.id,
      base.user.id,
      "Not for me.",
      NOW,
      notifications
    );
    if (!raised.ok) throw new Error(raised.error);
    const approved = await approveRefundRequest(
      db,
      raised.refundRequestId,
      platformAdmin.id,
      null,
      NOW,
      notifications
    );

    expect(approved.ok).toBe(true);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(true);
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe("Keep me");
  });
});
