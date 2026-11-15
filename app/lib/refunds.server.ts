import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  coupons,
  lessonProgress,
  lessons,
  modules,
  purchases,
  refunds,
  videoWatchEvents,
  LessonProgressStatus,
} from "~/db/schema";
import {
  checkRefundEligibility,
  lastDayOfRefundWindow,
  type RefundRule,
} from "~/lib/refunds";

type Purchase = typeof purchases.$inferSelect;

export type RefundEligibilityResult =
  | {
      eligible: true;
      purchase: Purchase;
      /** Always exactly what the student paid on this Purchase. */
      refundAmount: number;
      lastDayInWindow: string;
    }
  | {
      eligible: false;
      rule: RefundRule | "no-purchase";
      message: string;
    };

// Refund Eligibility is counted per Purchase, so a student who bought a course
// again is judged on their latest Purchase only.
function getLatestPurchase(userId: number, courseId: number) {
  return db
    .select()
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.courseId, courseId)))
    .orderBy(sql`${purchases.createdAt} desc`)
    .get();
}

function getLessonIdsForCourse(courseId: number): number[] {
  return db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all()
    .map((row) => row.id);
}

function hasRefundRequest(purchaseId: number) {
  return Boolean(
    db
      .select({ id: refunds.id })
      .from(refunds)
      .where(eq(refunds.purchaseId, purchaseId))
      .get()
  );
}

function hasClaimedSeat(purchaseId: number) {
  return Boolean(
    db
      .select({ id: coupons.id })
      .from(coupons)
      .where(
        and(eq(coupons.purchaseId, purchaseId), isNotNull(coupons.redeemedAt))
      )
      .get()
  );
}

// Watched Time is the furthest point reached in each lesson, summed.
function getWatchedSeconds(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  return db
    .select({
      furthest: sql<number>`max(${videoWatchEvents.positionSeconds})`,
    })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds)
      )
    )
    .groupBy(videoWatchEvents.lessonId)
    .all()
    .reduce((total, row) => total + row.furthest, 0);
}

function getCompletedLessonCount(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(lessonProgress.lessonId, lessonIds)
      )
    )
    .get();

  return result?.count ?? 0;
}

/**
 * Whether the student may make a Refund Request on their Purchase of this
 * course. The course page and the refund action both ask this one question.
 */
export function getRefundEligibility(
  userId: number,
  courseId: number
): RefundEligibilityResult {
  const purchase = getLatestPurchase(userId, courseId);

  if (!purchase) {
    return {
      eligible: false,
      rule: "no-purchase",
      message: "You have not bought this course.",
    };
  }

  const lessonIds = getLessonIdsForCourse(courseId);

  const result = checkRefundEligibility({
    purchasedAt: purchase.createdAt,
    today: new Date(),
    hasRefundRequest: hasRefundRequest(purchase.id),
    hasClaimedSeat: hasClaimedSeat(purchase.id),
    watchedSeconds: getWatchedSeconds(userId, lessonIds),
    completedLessons: getCompletedLessonCount(userId, lessonIds),
    totalLessons: lessonIds.length,
  });

  if (!result.eligible) return result;

  return {
    eligible: true,
    purchase,
    refundAmount: purchase.amountPaid,
    lastDayInWindow: lastDayOfRefundWindow(purchase.createdAt),
  };
}
