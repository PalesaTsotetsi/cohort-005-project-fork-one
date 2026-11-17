import { eq } from "drizzle-orm";
import type { SQLiteColumn, SQLiteSelect } from "drizzle-orm/sqlite-core";
import { courses, lessons, modules } from "~/db/schema";

// The Lesson a Bookmark or Note points at, and the Course it belongs to, so a
// row on the Saved page can link to its Lesson and name its Course.

export const savedLessonColumns = {
  lessonId: lessons.id,
  lessonTitle: lessons.title,
  courseTitle: courses.title,
  courseSlug: courses.slug,
};

export type SavedLesson = {
  lessonId: number;
  lessonTitle: string;
  courseTitle: string;
  courseSlug: string;
};

/** Joins a Bookmark or Note query through its Lesson to the Lesson's Course. */
export function joinSavedLesson<T extends SQLiteSelect>(
  query: T,
  lessonIdColumn: SQLiteColumn
) {
  return query
    .innerJoin(lessons, eq(lessonIdColumn, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id));
}
