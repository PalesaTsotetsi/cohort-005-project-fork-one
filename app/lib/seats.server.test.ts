import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { claimSeat } from "./seats.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let teamAdmin: typeof schema.users.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  teamAdmin = addPerson("Tess", UserRole.Student);
});

function addPerson(name: string, role: UserRole) {
  return db
    .insert(schema.users)
    .values({ name, email: `${name.toLowerCase()}@example.com`, role })
    .returning()
    .get();
}

function asNotificationUser(user: typeof schema.users.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
  };
}

function buyTeamLicence(buyerId: number, country: string | null = "US") {
  const team = db.insert(schema.teams).values({}).returning().get();
  const purchase = db
    .insert(schema.purchases)
    .values({
      userId: buyerId,
      courseId: base.course.id,
      amountPaid: 7900,
      country,
    })
    .returning()
    .get();
  const seat = db
    .insert(schema.coupons)
    .values({
      teamId: team.id,
      courseId: base.course.id,
      code: `SEAT-${purchase.id}`,
      purchaseId: purchase.id,
    })
    .returning()
    .get();
  return { purchase, code: seat.code };
}

describe("claiming a Seat", () => {
  it("sends Seat claimed to the Team Admin and New Enrollment to the Instructor", () => {
    const { code } = buyTeamLicence(teamAdmin.id);
    const claimer = addPerson("Cara", UserRole.Student);

    const result = claimSeat(db, code, claimer.id, "US", NOW);

    if (!result.ok) throw new Error(result.error);
    expect(result.enrollment).toMatchObject({
      userId: claimer.id,
      courseId: base.course.id,
    });
    expect(result.notifications).toEqual([
      {
        kind: "seat-claimed",
        actor: asNotificationUser(claimer),
        recipients: [asNotificationUser(teamAdmin)],
        courseTitle: "Test Course",
        url: "/team",
      },
      {
        kind: "new-enrollment",
        actor: asNotificationUser(claimer),
        recipients: [
          {
            id: base.instructor.id,
            name: "Test Instructor",
            email: "instructor@example.com",
            avatarUrl: null,
          },
        ],
        courseTitle: "Test Course",
        url: `/instructor/${base.course.id}/students`,
      },
    ]);
  });

  it("sends no Seat claimed when the Team Admin claims their own Seat", () => {
    const { code } = buyTeamLicence(teamAdmin.id);

    const result = claimSeat(db, code, teamAdmin.id, "US", NOW);

    if (!result.ok) throw new Error(result.error);
    expect(result.notifications.map((n) => n.kind)).toEqual([
      "new-enrollment",
    ]);
  });

  it("sends no New Enrollment when the Instructor enrolls via a Seat", () => {
    const { code } = buyTeamLicence(teamAdmin.id);

    const result = claimSeat(db, code, base.instructor.id, "US", NOW);

    if (!result.ok) throw new Error(result.error);
    expect(result.notifications.map((n) => n.kind)).toEqual(["seat-claimed"]);
  });

  it("sends nothing when the Instructor claims a Seat on their own Team Licence", () => {
    const { code } = buyTeamLicence(base.instructor.id);

    const result = claimSeat(db, code, base.instructor.id, "US", NOW);

    if (!result.ok) throw new Error(result.error);
    expect(result.notifications).toEqual([]);
  });
});

describe("a refused Seat claim", () => {
  it("is refused with no Notifications while the Team Licence has an Open Refund Request", () => {
    const { purchase, code } = buyTeamLicence(teamAdmin.id);
    db.insert(schema.refunds)
      .values({ purchaseId: purchase.id, reason: "Changed our plans." })
      .run();
    const claimer = addPerson("Cara", UserRole.Student);

    const result = claimSeat(db, code, claimer.id, "US", NOW);

    expect(result).toEqual({
      ok: false,
      error:
        "This seat can't be claimed right now. Ask the person who shared it with you.",
    });
  });

  it("is refused with no Notifications once the Seat is refunded", () => {
    const { purchase, code } = buyTeamLicence(teamAdmin.id);
    db.update(schema.coupons)
      .set({ refundedAt: NOW.toISOString() })
      .where(eq(schema.coupons.purchaseId, purchase.id))
      .run();
    const claimer = addPerson("Cara", UserRole.Student);

    const result = claimSeat(db, code, claimer.id, "US", NOW);

    expect(result).toEqual({
      ok: false,
      error:
        "This seat is no longer available. Ask the person who shared it with you.",
    });
  });

  it("is refused with no Notifications when the claimer is already enrolled", () => {
    const { code } = buyTeamLicence(teamAdmin.id);
    const claimer = addPerson("Cara", UserRole.Student);
    db.insert(schema.enrollments)
      .values({ userId: claimer.id, courseId: base.course.id })
      .run();

    const result = claimSeat(db, code, claimer.id, "US", NOW);

    expect(result).toEqual({
      ok: false,
      error: "You are already enrolled in this course",
    });
  });

  it("is refused with no Notifications from another country", () => {
    const { code } = buyTeamLicence(teamAdmin.id, "US");
    const claimer = addPerson("Cara", UserRole.Student);

    const result = claimSeat(db, code, claimer.id, "GB", NOW);

    expect(result).toEqual({
      ok: false,
      error:
        "This coupon can only be redeemed from the same country as the purchaser",
    });
  });

  it("is refused with no Notifications when the Seat is already claimed", () => {
    const { code } = buyTeamLicence(teamAdmin.id);
    const first = addPerson("Cara", UserRole.Student);
    const second = addPerson("Dev", UserRole.Student);
    claimSeat(db, code, first.id, "US", NOW);

    const result = claimSeat(db, code, second.id, "US", NOW);

    expect(result).toEqual({
      ok: false,
      error: "Coupon has already been redeemed",
    });
  });
});
