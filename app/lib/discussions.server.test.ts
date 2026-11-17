import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { postToDiscussion } from "./discussions.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let moduleId: number;
let lessonId: number;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  moduleId = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get().id;

  lessonId = addLesson("Generics", 1);
});

function addLesson(title: string, position: number) {
  return db
    .insert(schema.lessons)
    .values({ moduleId, title, position })
    .returning()
    .get().id;
}

describe("posting a Discussion Question", () => {
  it("notifies the course's Instructor, quoting the question", () => {
    const result = postToDiscussion(
      db,
      base.user.id,
      lessonId,
      null,
      "  Why does this not infer?  "
    );

    expect(result.notifications).toEqual([
      {
        kind: "discussion-question",
        actor: {
          id: base.user.id,
          name: "Test User",
          email: "test@example.com",
          avatarUrl: null,
        },
        recipients: [
          {
            id: base.instructor.id,
            name: "Test Instructor",
            email: "instructor@example.com",
            avatarUrl: null,
          },
        ],
        courseTitle: "Test Course",
        url: `/courses/test-course/lessons/${lessonId}`,
        lessonTitle: "Generics",
        body: "Why does this not infer?",
      },
    ]);
  });

  it("notifies nobody when the Instructor posts it", () => {
    const result = postToDiscussion(
      db,
      base.instructor.id,
      lessonId,
      null,
      "A question on my own lesson"
    );

    expect(result.notifications).toEqual([]);
  });
});

describe("posting a Discussion Reply", () => {
  function askQuestion() {
    return postToDiscussion(db, base.user.id, lessonId, null, "How?").comment;
  }

  it("notifies the question's author, quoting the reply", () => {
    const question = askQuestion();

    const result = postToDiscussion(
      db,
      base.instructor.id,
      lessonId,
      question.id,
      "  Like this.  "
    );

    expect(result.comment.parentId).toBe(question.id);
    expect(result.notifications).toEqual([
      {
        kind: "discussion-reply",
        actor: {
          id: base.instructor.id,
          name: "Test Instructor",
          email: "instructor@example.com",
          avatarUrl: null,
        },
        recipients: [
          {
            id: base.user.id,
            name: "Test User",
            email: "test@example.com",
            avatarUrl: null,
          },
        ],
        courseTitle: "Test Course",
        url: `/courses/test-course/lessons/${lessonId}`,
        lessonTitle: "Generics",
        body: "Like this.",
      },
    ]);
  });

  it("notifies the question's author when a Platform Admin replies", () => {
    const question = askQuestion();
    const admin = db
      .insert(schema.users)
      .values({ name: "Pat Admin", email: "pat@example.com", role: UserRole.Admin })
      .returning()
      .get();

    const result = postToDiscussion(db, admin.id, lessonId, question.id, "Yes.");

    expect(
      result.notifications.map((n) => ({
        kind: n.kind,
        actor: n.actor.id,
        recipients: n.recipients.map((r) => r.id),
      }))
    ).toEqual([
      { kind: "discussion-reply", actor: admin.id, recipients: [base.user.id] },
    ]);
  });

  it("notifies nobody when the author replies to their own question", () => {
    const question = askQuestion();

    const result = postToDiscussion(
      db,
      base.user.id,
      lessonId,
      question.id,
      "Never mind, solved it."
    );

    expect(result.notifications).toEqual([]);
  });
});

describe("posting validation", () => {
  it("refuses an empty body", () => {
    expect(() =>
      postToDiscussion(db, base.user.id, lessonId, null, "   ")
    ).toThrow("Comment cannot be empty");
  });

  it("refuses a body over 5000 characters", () => {
    expect(() =>
      postToDiscussion(db, base.user.id, lessonId, null, "x".repeat(5001))
    ).toThrow("Comment must be 5000 characters or fewer");
  });

  it("refuses a lesson that doesn't exist", () => {
    expect(() => postToDiscussion(db, base.user.id, 9999, null, "Hi")).toThrow(
      "Lesson not found"
    );
  });

  it("refuses a reply to a question that doesn't exist", () => {
    expect(() =>
      postToDiscussion(db, base.user.id, lessonId, 9999, "Hi")
    ).toThrow("Parent comment not found");
  });

  it("refuses a reply to a question on a different lesson", () => {
    const otherLessonId = addLesson("Other", 2);
    const question = postToDiscussion(
      db,
      base.user.id,
      otherLessonId,
      null,
      "Q"
    ).comment;

    expect(() =>
      postToDiscussion(db, base.instructor.id, lessonId, question.id, "A")
    ).toThrow("Parent comment belongs to a different lesson");
  });

  it("refuses a reply to a reply", () => {
    const question = postToDiscussion(db, base.user.id, lessonId, null, "Q")
      .comment;
    const reply = postToDiscussion(
      db,
      base.instructor.id,
      lessonId,
      question.id,
      "A"
    ).comment;

    expect(() =>
      postToDiscussion(db, base.user.id, lessonId, reply.id, "Thanks")
    ).toThrow("Replies can only be one level deep");
  });
});
