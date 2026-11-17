import { and, desc, eq } from "drizzle-orm";
import { notes } from "~/db/schema";
import { joinSavedLesson, savedLessonColumns } from "~/lib/saved-lesson.server";
import type { Db } from "~/lib/comments.server";
import { noteBodySchema } from "~/lib/notes";

// ─── Notes ───
// A Student's own plain-text writing about a Lesson, private to the Student who
// wrote it. One per Student per Lesson, enforced by the unique index on
// (user_id, lesson_id). See GLOSSARY.md.
//
// Nothing outside the owning Student's Lesson page and Saved page may read a
// Note body: no Instructor or Platform Admin view. Every function here is
// scoped to one Student's own rows.
//
// Every function takes the database first so tests can hand in an in-memory
// one. Content access is the caller's job: the Lesson action checks it before
// calling in here.

type Note = typeof notes.$inferSelect;

export function getNote(db: Db, userId: number, lessonId: number) {
  return db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.lessonId, lessonId)))
    .get();
}

export type SaveNoteResult =
  { ok: true; note: Note } | { ok: false; error: string };

/**
 * Creates the Student's Note on a Lesson, or replaces its body if one exists.
 * Either way `updatedAt` becomes `now`; `createdAt` is kept on a re-save.
 * A body over the cap is refused, never truncated.
 */
export function saveNote(
  db: Db,
  userId: number,
  lessonId: number,
  body: string,
  now: Date
): SaveNoteResult {
  const parsed = noteBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const at = now.toISOString();
  const note = db
    .insert(notes)
    .values({
      userId,
      lessonId,
      body: parsed.data,
      createdAt: at,
      updatedAt: at,
    })
    .onConflictDoUpdate({
      target: [notes.userId, notes.lessonId],
      set: { body: parsed.data, updatedAt: at },
    })
    .returning()
    .get();

  return { ok: true, note };
}

/** The Student's Notes, last edited first, each with its Lesson and Course. */
export function listNotes(db: Db, userId: number) {
  const query = db
    .select({
      id: notes.id,
      body: notes.body,
      updatedAt: notes.updatedAt,
      ...savedLessonColumns,
    })
    .from(notes)
    .$dynamic();

  return joinSavedLesson(query, notes.lessonId)
    .where(eq(notes.userId, userId))
    .orderBy(desc(notes.updatedAt), desc(notes.id))
    .all();
}
