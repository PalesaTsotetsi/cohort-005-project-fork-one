import { formatPrice } from "~/lib/utils";

// The words in this module are the ones in GLOSSARY.md. Keep student-facing
// copy to those words: no "cancel", "chargeback" or "reversal".

export const REFUND_WINDOW_DAYS = 14;
export const REFUND_WATCH_LIMIT_SECONDS = 2 * 60 * 60;
export const REFUND_COMPLETION_LIMIT = 0.5;

export type RefundEligibilityFacts = {
  purchasedAt: string;
  today: Date;
  /** Any Refund Request on the Purchase, in any status — Declined is final. */
  hasRefundRequest: boolean;
  hasClaimedSeat: boolean;
  watchedSeconds: number;
  completedLessons: number;
  totalLessons: number;
};

export type RefundRule =
  | "window"
  | "already-requested"
  | "claimed-seat"
  | "watched"
  | "completed";

export type RefundEligibility =
  | { eligible: true }
  | { eligible: false; rule: RefundRule; message: string };

// The Refund Window is counted in whole calendar days, not hours — someone who
// buys at 23:00 still gets the whole of their fourteenth day.
export function calendarDay(when: Date): string {
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${when.getFullYear()}-${month}-${day}`;
}

export function lastDayOfRefundWindow(purchasedAtIso: string): string {
  const deadline = new Date(purchasedAtIso);
  deadline.setDate(deadline.getDate() + REFUND_WINDOW_DAYS);
  return calendarDay(deadline);
}

export function checkRefundEligibility(
  facts: RefundEligibilityFacts
): RefundEligibility {
  if (facts.hasRefundRequest) {
    return {
      eligible: false,
      rule: "already-requested",
      message: "You have already made a refund request for this purchase.",
    };
  }

  if (facts.hasClaimedSeat) {
    return {
      eligible: false,
      rule: "claimed-seat",
      message: "A claimed team seat is not eligible for a refund.",
    };
  }

  const today = calendarDay(facts.today);
  const purchasedDay = calendarDay(new Date(facts.purchasedAt));
  const lastDay = lastDayOfRefundWindow(facts.purchasedAt);

  if (today < purchasedDay || today > lastDay) {
    return {
      eligible: false,
      rule: "window",
      message: `The ${REFUND_WINDOW_DAYS}-day refund window has closed.`,
    };
  }

  if (facts.watchedSeconds >= REFUND_WATCH_LIMIT_SECONDS) {
    return {
      eligible: false,
      rule: "watched",
      message:
        "You have watched too much of this course to request a refund.",
    };
  }

  if (
    facts.totalLessons > 0 &&
    facts.completedLessons / facts.totalLessons >= REFUND_COMPLETION_LIMIT
  ) {
    return {
      eligible: false,
      rule: "completed",
      message:
        "You have completed too much of this course to request a refund.",
    };
  }

  return { eligible: true };
}

/**
 * The confirmation the student gets in their inbox. There is no mail
 * transport wired up yet, so callers send the built message to the log.
 */
export function buildRefundRequestEmail(input: {
  studentName: string;
  studentEmail: string;
  courseTitle: string;
  refundAmount: number;
}) {
  return {
    to: input.studentEmail,
    subject: `Refund request received — ${input.courseTitle}`,
    body: [
      `Hi ${input.studentName},`,
      "",
      `We have your refund request for "${input.courseTitle}". It is pending.`,
      `If it is approved, your refund will be ${formatPrice(input.refundAmount)}, the amount you paid.`,
      "",
      "An admin reviews every refund request by hand. You do not need to do anything else — we will email you again when it is approved or declined.",
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}
