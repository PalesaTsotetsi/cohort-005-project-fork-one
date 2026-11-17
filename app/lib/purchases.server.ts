import { and, eq } from "drizzle-orm";
import crypto from "crypto";
import {
  coupons,
  courses,
  enrollments,
  purchases,
  teamMembers,
  teams,
  TeamMemberRole,
  users,
} from "~/db/schema";
import {
  courseStudentsUrl,
  othersThan,
  toNotificationUser,
  type Notification,
} from "~/lib/notifications";
import type { Db } from "~/lib/refunds.server";

// ─── Purchases ───
// Buying a course. An Individual Purchase gives the buyer an Enrollment and
// returns the Notifications that Enrollment causes; the route sends them.
// A Team Licence grants Seats and enrolls nobody, so it causes none.

type Purchase = typeof purchases.$inferSelect;
type Enrollment = typeof enrollments.$inferSelect;

export type IndividualPurchaseResult = {
  purchase: Purchase;
  enrollment: Enrollment;
  notifications: Notification[];
};

function getUser(db: Db, userId: number) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) {
    throw new Error("User not found");
  }
  return toNotificationUser(user);
}

/**
 * Records an Individual Purchase and enrolls the buyer. New Enrollment goes
 * to the course's Instructor, unless the Instructor enrolled themselves.
 */
export function buyIndividualPurchase(
  db: Db,
  buyerId: number,
  courseId: number,
  amountPaid: number,
  country: string | null
): IndividualPurchaseResult {
  const course = db.select().from(courses).where(eq(courses.id, courseId)).get();
  if (!course) {
    throw new Error("Course not found");
  }

  const existing = db
    .select()
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, buyerId), eq(enrollments.courseId, courseId))
    )
    .get();
  if (existing) {
    throw new Error("User is already enrolled in this course");
  }

  const purchase = db
    .insert(purchases)
    .values({ userId: buyerId, courseId, amountPaid, country })
    .returning()
    .get();
  const enrollment = db
    .insert(enrollments)
    .values({ userId: buyerId, courseId })
    .returning()
    .get();

  const actor = getUser(db, buyerId);
  const recipients = othersThan(actor, [getUser(db, course.instructorId)]);
  if (recipients.length === 0) {
    return { purchase, enrollment, notifications: [] };
  }

  return {
    purchase,
    enrollment,
    notifications: [
      {
        kind: "new-enrollment",
        actor,
        recipients,
        courseTitle: course.title,
        url: courseStudentsUrl(course.id),
      },
    ],
  };
}

type Team = typeof teams.$inferSelect;
type Seat = typeof coupons.$inferSelect;

export type TeamLicenceResult = {
  purchase: Purchase;
  team: Team;
  seats: Seat[];
  notifications: Notification[];
};

function getOrCreateTeamForAdmin(db: Db, userId: number): Team {
  const membership = db
    .select()
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.userId, userId),
        eq(teamMembers.role, TeamMemberRole.Admin)
      )
    )
    .get();
  if (membership) {
    const team = db
      .select()
      .from(teams)
      .where(eq(teams.id, membership.teamId))
      .get();
    if (team) return team;
  }

  const team = db.insert(teams).values({}).returning().get();
  db.insert(teamMembers)
    .values({ teamId: team.id, userId, role: TeamMemberRole.Admin })
    .run();
  return team;
}

/**
 * Records a Team Licence of `seatCount` Seats for the buyer's team. It enrolls
 * nobody, so it causes no Notifications.
 */
export function buyTeamLicence(
  db: Db,
  buyerId: number,
  courseId: number,
  amountPaid: number,
  country: string | null,
  seatCount: number
): TeamLicenceResult {
  const purchase = db
    .insert(purchases)
    .values({ userId: buyerId, courseId, amountPaid, country })
    .returning()
    .get();
  const team = getOrCreateTeamForAdmin(db, buyerId);

  const seats: Seat[] = [];
  for (let i = 0; i < seatCount; i++) {
    seats.push(
      db
        .insert(coupons)
        .values({
          teamId: team.id,
          courseId,
          code: crypto.randomBytes(12).toString("base64url"),
          purchaseId: purchase.id,
        })
        .returning()
        .get()
    );
  }

  return { purchase, team, seats, notifications: [] };
}
