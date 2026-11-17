import { eq } from "drizzle-orm";
import { comments, courses, lessons, modules, users } from "~/db/schema";
import { MAX_COMMENT_LENGTH, MIN_COMMENT_LENGTH } from "~/lib/comments";
import {
  lessonUrl,
  othersThan,
  toNotificationUser,
  type Notification,
} from "~/lib/notifications";
import type { Db } from "~/lib/refunds.server";

// ─── Discussions ───
// Posting a Discussion Question or a Discussion Reply, from the lesson page or
// the unanswered-questions page. Validation failures throw an Error whose
// message the person can act on. The operation returns the Notifications the
// post causes; the route sends them.

type Comment = typeof comments.$inferSelect;

export type PostResult = {
  comment: Comment;
  notifications: Notification[];
};

/** Trims the body and throws when it is empty or too long. */
export function assertValidBody(body: string) {
  const trimmed = body.trim();
  if (trimmed.length < MIN_COMMENT_LENGTH) {
    throw new Error("Comment cannot be empty");
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    throw new Error(
      `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`
    );
  }
  return trimmed;
}

function getLessonWithCourse(db: Db, lessonId: number) {
  return db
    .select({
      lessonTitle: lessons.title,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      instructorId: courses.instructorId,
    })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(lessons.id, lessonId))
    .get();
}

function getUser(db: Db, userId: number) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) {
    throw new Error("User not found");
  }
  return toNotificationUser(user);
}

/**
 * Posts a Discussion Question (`questionId` null) or a Discussion Reply to
 * the question `questionId`. A question notifies the course's Instructor and
 * a reply notifies the question's author, never the person who posted it.
 */
export function postToDiscussion(
  db: Db,
  posterId: number,
  lessonId: number,
  questionId: number | null,
  body: string
): PostResult {
  const trimmed = assertValidBody(body);

  const lesson = getLessonWithCourse(db, lessonId);
  if (!lesson) {
    throw new Error("Lesson not found");
  }

  let question: Comment | undefined;
  if (questionId !== null) {
    question = db
      .select()
      .from(comments)
      .where(eq(comments.id, questionId))
      .get();
    if (!question) {
      throw new Error("Parent comment not found");
    }
    if (question.lessonId !== lessonId) {
      throw new Error("Parent comment belongs to a different lesson");
    }
    if (question.parentId !== null) {
      throw new Error("Replies can only be one level deep");
    }
  }

  const comment = db
    .insert(comments)
    .values({ userId: posterId, lessonId, parentId: questionId, body: trimmed })
    .returning()
    .get();

  const actor = getUser(db, posterId);
  const recipients = othersThan(actor, [
    getUser(db, question ? question.userId : lesson.instructorId),
  ]);
  if (recipients.length === 0) {
    return { comment, notifications: [] };
  }

  const common = {
    actor,
    recipients,
    courseTitle: lesson.courseTitle,
    url: lessonUrl(lesson.courseSlug, lessonId),
    lessonTitle: lesson.lessonTitle,
    body: trimmed,
  };

  return {
    comment,
    notifications: [
      question
        ? { kind: "discussion-reply", ...common }
        : { kind: "discussion-question", ...common },
    ],
  };
}
