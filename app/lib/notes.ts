import { z } from "zod";

export const MAX_NOTE_LENGTH = 2000;

// A Note body is plain text, trimmed, and capped. Shared by the Lesson page's
// form schema and the notes service so the cap lives in one place.
export const noteBodySchema = z
  .string()
  .trim()
  .min(1, "Write something before saving your note.")
  .max(
    MAX_NOTE_LENGTH,
    `A note can be at most ${MAX_NOTE_LENGTH.toLocaleString("en-US")} characters.`
  );
