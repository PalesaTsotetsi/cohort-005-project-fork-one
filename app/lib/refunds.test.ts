import { describe, it, expect } from "vitest";
import {
  REFUND_WINDOW_DAYS,
  buildRefundRequestEmail,
  checkRefundEligibility,
  lastDayOfRefundWindow,
  type RefundEligibilityFacts,
} from "./refunds";

// A Purchase made on 1 March, looked at on 5 March, with nothing watched.
// Each test changes only the fact it is about.
function facts(
  overrides: Partial<RefundEligibilityFacts> = {}
): RefundEligibilityFacts {
  return {
    purchasedAt: new Date(2026, 2, 1, 23, 0).toISOString(),
    today: new Date(2026, 2, 5, 9, 0),
    hasRefundRequest: false,
    hasClaimedSeat: false,
    watchedSeconds: 0,
    completedLessons: 0,
    totalLessons: 10,
    ...overrides,
  };
}

describe("lastDayOfRefundWindow", () => {
  it("is fourteen calendar days after the day of purchase", () => {
    expect(REFUND_WINDOW_DAYS).toBe(14);
    expect(
      lastDayOfRefundWindow(new Date(2026, 2, 1, 23, 0).toISOString())
    ).toBe("2026-03-15");
  });
});

describe("checkRefundEligibility", () => {
  it("allows a Refund Request when every rule holds", () => {
    expect(checkRefundEligibility(facts())).toEqual({ eligible: true });
  });

  it("allows a Refund Request on the last day of the Refund Window", () => {
    // Bought at 23:00, so a count in hours would close the window early.
    const result = checkRefundEligibility(
      facts({ today: new Date(2026, 2, 15, 23, 30) })
    );
    expect(result).toEqual({ eligible: true });
  });

  it("refuses once the Refund Window has closed", () => {
    const result = checkRefundEligibility(
      facts({ today: new Date(2026, 2, 16, 0, 5) })
    );
    expect(result).toMatchObject({ eligible: false, rule: "window" });
  });

  it("refuses when the Purchase already has a Refund Request, whatever its status", () => {
    // Declined is final, so a second request is never allowed.
    const result = checkRefundEligibility(facts({ hasRefundRequest: true }));
    expect(result).toMatchObject({
      eligible: false,
      rule: "already-requested",
    });
  });

  it("refuses when a team seat bought with the Purchase has been claimed", () => {
    const result = checkRefundEligibility(facts({ hasClaimedSeat: true }));
    expect(result).toMatchObject({ eligible: false, rule: "claimed-seat" });
  });

  it("refuses at two hours of Watched Time", () => {
    expect(
      checkRefundEligibility(facts({ watchedSeconds: 2 * 60 * 60 - 1 }))
    ).toEqual({ eligible: true });
    expect(
      checkRefundEligibility(facts({ watchedSeconds: 2 * 60 * 60 }))
    ).toMatchObject({ eligible: false, rule: "watched" });
  });

  it("refuses once half the lessons are completed", () => {
    expect(
      checkRefundEligibility(facts({ completedLessons: 4 }))
    ).toEqual({ eligible: true });
    expect(
      checkRefundEligibility(facts({ completedLessons: 5 }))
    ).toMatchObject({ eligible: false, rule: "completed" });
  });

  it("ignores the completion rule for a course with no lessons", () => {
    expect(
      checkRefundEligibility(facts({ completedLessons: 0, totalLessons: 0 }))
    ).toEqual({ eligible: true });
  });

  it("explains every refusal using the glossary words", () => {
    const refusals = [
      facts({ today: new Date(2026, 3, 1) }),
      facts({ hasRefundRequest: true }),
      facts({ hasClaimedSeat: true }),
      facts({ watchedSeconds: 3 * 60 * 60 }),
      facts({ completedLessons: 10 }),
    ];

    for (const refusal of refusals) {
      const result = checkRefundEligibility(refusal);
      if (result.eligible) throw new Error("expected a refusal");
      expect(result.message).toMatch(/refund/i);
      expect(result.message).not.toMatch(/cancel|chargeback|reversal/i);
    }
  });
});

describe("buildRefundRequestEmail", () => {
  const email = buildRefundRequestEmail({
    studentName: "Liam",
    studentEmail: "liam@example.com",
    courseTitle: "Introduction to TypeScript",
    refundAmount: 4900,
  });

  it("names the Refund Request and its status in the subject", () => {
    expect(email.to).toBe("liam@example.com");
    expect(email.subject).toBe(
      "Refund request received — Introduction to TypeScript"
    );
  });

  it("promises the Refund Amount it was given", () => {
    expect(email.body).toContain("$49.00");
    expect(email.body).toMatch(/pending/i);
  });

  it("uses none of the words the glossary avoids", () => {
    expect(`${email.subject}\n${email.body}`).not.toMatch(
      /reversal|chargeback|cancel/i
    );
  });
});
