import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { RefundStatus, UserRole } from "~/db/schema";
import { listNotificationSwitches } from "./notification-preferences.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

function addPerson(name: string, role: UserRole) {
  return db
    .insert(schema.users)
    .values({ name, email: `${name.toLowerCase()}@example.com`, role })
    .returning()
    .get();
}

function buyIndividualPurchase(buyerId: number) {
  return db
    .insert(schema.purchases)
    .values({ userId: buyerId, courseId: base.course.id, amountPaid: 7900 })
    .returning()
    .get();
}

function buyTeamLicence(buyerId: number) {
  const team = db.insert(schema.teams).values({}).returning().get();
  const purchase = buyIndividualPurchase(buyerId);
  db.insert(schema.coupons)
    .values({
      teamId: team.id,
      courseId: base.course.id,
      code: `SEAT-${purchase.id}`,
      purchaseId: purchase.id,
    })
    .run();
  return purchase;
}

function categoriesShownTo(userId: number) {
  return listNotificationSwitches(db, userId).map((s) => s.category);
}

describe("which Notification Category switches a person is shown", () => {
  it("always shows Discussions, even to a Student with no Purchases", () => {
    const student = addPerson("Sam", UserRole.Student);

    expect(listNotificationSwitches(db, student.id)).toEqual([
      { category: "discussions", description: "replies to your questions" },
    ]);
  });

  it("shows Refunds to someone with a Purchase", () => {
    const buyer = addPerson("Bea", UserRole.Student);
    buyIndividualPurchase(buyer.id);

    expect(listNotificationSwitches(db, buyer.id)).toEqual([
      {
        category: "refunds",
        description: "updates on your refund requests",
      },
      { category: "discussions", description: "replies to your questions" },
    ]);
  });

  it("shows Refunds to a Platform Admin with no Purchases", () => {
    const admin = addPerson("Pat", UserRole.Admin);

    expect(listNotificationSwitches(db, admin.id)).toEqual([
      { category: "refunds", description: "new refund requests to review" },
      { category: "discussions", description: "replies to your questions" },
    ]);
  });

  it("tells a Platform Admin with a Purchase about both sides of Refunds", () => {
    const admin = addPerson("Pat", UserRole.Admin);
    buyIndividualPurchase(admin.id);

    expect(listNotificationSwitches(db, admin.id)[0]).toEqual({
      category: "refunds",
      description: "updates on your refund requests and new ones to review",
    });
  });

  it("shows Team to someone who has bought a Team Licence", () => {
    const teamAdmin = addPerson("Tess", UserRole.Student);
    buyTeamLicence(teamAdmin.id);

    expect(listNotificationSwitches(db, teamAdmin.id)).toEqual([
      {
        category: "refunds",
        description: "updates on your refund requests",
      },
      { category: "team", description: "Seats claimed on your Team Licences" },
      { category: "discussions", description: "replies to your questions" },
    ]);
  });

  it("does not show Team for an Individual Purchase", () => {
    const buyer = addPerson("Bea", UserRole.Student);
    buyIndividualPurchase(buyer.id);

    expect(categoriesShownTo(buyer.id)).not.toContain("team");
  });

  it("still shows Team to a Team Admin whose Team Licence was refunded", () => {
    const teamAdmin = addPerson("Tess", UserRole.Student);
    const licence = buyTeamLicence(teamAdmin.id);
    db.insert(schema.refunds)
      .values({
        purchaseId: licence.id,
        status: RefundStatus.Approved,
        reason: "Team changed plans",
        amountRefunded: licence.amountPaid,
        resolvedAt: new Date().toISOString(),
      })
      .run();
    db.update(schema.coupons)
      .set({ refundedAt: new Date().toISOString() })
      .run();

    expect(categoriesShownTo(teamAdmin.id)).toContain("team");
  });

  it("shows Enrollments to an Instructor, and widens their Discussions line", () => {
    expect(listNotificationSwitches(db, base.instructor.id)).toEqual([
      {
        category: "enrollments",
        description: "new students enrolling in your courses",
      },
      {
        category: "discussions",
        description: "questions on your courses and replies to your questions",
      },
    ]);
  });

  it("does not show Enrollments to a Student or a Platform Admin", () => {
    const admin = addPerson("Pat", UserRole.Admin);

    expect(categoriesShownTo(base.user.id)).not.toContain("enrollments");
    expect(categoriesShownTo(admin.id)).not.toContain("enrollments");
  });
});
