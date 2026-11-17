import { and, eq } from "drizzle-orm";
import { coupons, courses, enrollments, purchases, users } from "~/db/schema";
import {
  courseStudentsUrl,
  othersThan,
  toNotificationUser,
  type Notification,
} from "~/lib/notifications";
import { getSeatAvailability, type Db } from "~/lib/refunds.server";

// ─── Claiming a Seat ───
// A Student claims an Unclaimed Seat on a Team Licence and gets an
// Enrollment. A claim tells the Team Admin (Seat claimed) and the course's
// Instructor (New Enrollment), never the person who claimed it. A refused
// claim changes nothing and causes no Notifications. The route sends them.

export const SEAT_ON_HOLD =
  "This seat can't be claimed right now. Ask the person who shared it with you.";
export const SEAT_REFUNDED =
  "This seat is no longer available. Ask the person who shared it with you.";

export type ClaimResult =
  | {
      ok: true;
      enrollment: typeof enrollments.$inferSelect;
      notifications: Notification[];
    }
  | { ok: false; error: string };

function getUser(db: Db, userId: number) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) {
    throw new Error("User not found");
  }
  return toNotificationUser(user);
}

/**
 * Claims the Seat `code` for `claimerId`, who is in `claimerCountry`. Refuses
 * a Seat that is unknown, already claimed, on hold, refunded, for a course
 * the claimer is already enrolled on, or bought in another country.
 */
export function claimSeat(
  db: Db,
  code: string,
  claimerId: number,
  claimerCountry: string,
  now: Date
): ClaimResult {
  const seat = db.select().from(coupons).where(eq(coupons.code, code)).get();
  if (!seat) {
    return { ok: false, error: "Coupon not found" };
  }

  if (seat.redeemedByUserId !== null) {
    return { ok: false, error: "Coupon has already been redeemed" };
  }

  const availability = getSeatAvailability(db, seat);
  if (availability === "on_hold") {
    return { ok: false, error: SEAT_ON_HOLD };
  }
  if (availability === "refunded") {
    return { ok: false, error: SEAT_REFUNDED };
  }

  const existingEnrollment = db
    .select()
    .from(enrollments)
    .where(
      and(
        eq(enrollments.userId, claimerId),
        eq(enrollments.courseId, seat.courseId)
      )
    )
    .get();
  if (existingEnrollment) {
    return { ok: false, error: "You are already enrolled in this course" };
  }

  const teamLicence = db
    .select()
    .from(purchases)
    .where(eq(purchases.id, seat.purchaseId))
    .get();
  if (!teamLicence) {
    return { ok: false, error: "Coupon not found" };
  }
  if (teamLicence.country && teamLicence.country !== claimerCountry) {
    return {
      ok: false,
      error:
        "This coupon can only be redeemed from the same country as the purchaser",
    };
  }

  const course = db
    .select()
    .from(courses)
    .where(eq(courses.id, seat.courseId))
    .get();
  if (!course) {
    return { ok: false, error: "Course not found" };
  }

  const enrollment = db.transaction((tx) => {
    tx.update(coupons)
      .set({ redeemedByUserId: claimerId, redeemedAt: now.toISOString() })
      .where(eq(coupons.id, seat.id))
      .run();
    return tx
      .insert(enrollments)
      .values({ userId: claimerId, courseId: seat.courseId })
      .returning()
      .get();
  });

  const actor = getUser(db, claimerId);
  const notifications: Notification[] = [];

  const teamAdmins = othersThan(actor, [getUser(db, teamLicence.userId)]);
  if (teamAdmins.length > 0) {
    notifications.push({
      kind: "seat-claimed",
      actor,
      recipients: teamAdmins,
      courseTitle: course.title,
      url: "/team",
    });
  }

  const instructors = othersThan(actor, [getUser(db, course.instructorId)]);
  if (instructors.length > 0) {
    notifications.push({
      kind: "new-enrollment",
      actor,
      recipients: instructors,
      courseTitle: course.title,
      url: courseStudentsUrl(course.id),
    });
  }

  return { ok: true, enrollment, notifications };
}
