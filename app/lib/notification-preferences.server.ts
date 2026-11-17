import { eq } from "drizzle-orm";
import { coupons, purchases, UserRole, users } from "~/db/schema";
import type { Db } from "~/lib/refunds.server";
import type { NotificationSwitch } from "~/lib/notifications";

// ─── Which Notification Preference switches a person is shown ───
// Cadence decides only which switches show. Whether each is on or off lives
// in Knock and is never read or written here (ADR 0014).

function refundsDescription(
  hasPurchase: boolean,
  isPlatformAdmin: boolean
): string | null {
  if (hasPurchase && isPlatformAdmin)
    return "updates on your refund requests and new ones to review";
  if (hasPurchase) return "updates on your refund requests";
  if (isPlatformAdmin) return "new refund requests to review";
  return null;
}

/**
 * The categories this person is shown a switch for, in display order:
 * - Refunds: has any Purchase, or is a Platform Admin
 * - Team: has bought a Team Licence
 * - Enrollments: is an Instructor
 * - Discussions: always
 */
export function listNotificationSwitches(
  db: Db,
  userId: number
): NotificationSwitch[] {
  const role = db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .get()?.role;
  const isPlatformAdmin = role === UserRole.Admin;
  const isInstructor = role === UserRole.Instructor;

  const hasPurchase =
    db
      .select({ id: purchases.id })
      .from(purchases)
      .where(eq(purchases.userId, userId))
      .get() !== undefined;

  // A Team Licence is the Purchase that granted Seats. Its Seats outlive a
  // refund, so a refunded Team Licence still counts as bought.
  const hasBoughtTeamLicence =
    db
      .select({ id: coupons.id })
      .from(coupons)
      .innerJoin(purchases, eq(coupons.purchaseId, purchases.id))
      .where(eq(purchases.userId, userId))
      .get() !== undefined;

  const switches: NotificationSwitch[] = [];
  const refunds = refundsDescription(hasPurchase, isPlatformAdmin);
  if (refunds !== null) {
    switches.push({ category: "refunds", description: refunds });
  }
  if (hasBoughtTeamLicence) {
    switches.push({
      category: "team",
      description: "Seats claimed on your Team Licences",
    });
  }
  if (isInstructor) {
    switches.push({
      category: "enrollments",
      description: "new students enrolling in your courses",
    });
  }
  switches.push({
    category: "discussions",
    description: isInstructor
      ? "questions on your courses and replies to your questions"
      : "replies to your questions",
  });
  return switches;
}
