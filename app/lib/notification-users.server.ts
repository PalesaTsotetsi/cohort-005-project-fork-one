import { eq } from "drizzle-orm";
import { users } from "~/db/schema";
import { toNotificationUser, type NotificationUser } from "~/lib/notifications";
import type { Queryable } from "~/lib/refunds.server";

/** Loads a person as a Notification carries them; throws if they don't exist. */
export function getNotificationUser(
  db: Queryable,
  userId: number
): NotificationUser {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new Error("User not found");
  return toNotificationUser(user);
}
