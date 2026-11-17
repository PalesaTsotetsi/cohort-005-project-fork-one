import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import { buyIndividualPurchase, buyTeamLicence } from "./purchases.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

describe("buying an Individual Purchase", () => {
  it("notifies the course's Instructor of the New Enrollment", () => {
    const result = buyIndividualPurchase(
      db,
      base.user.id,
      base.course.id,
      7900,
      "US"
    );

    expect(result.notifications).toEqual([
      {
        kind: "new-enrollment",
        actor: {
          id: base.user.id,
          name: "Test User",
          email: "test@example.com",
          avatarUrl: null,
        },
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

  it("notifies nobody when the Instructor buys their own course", () => {
    const result = buyIndividualPurchase(
      db,
      base.instructor.id,
      base.course.id,
      7900,
      "US"
    );

    expect(result.notifications).toEqual([]);
  });
});

describe("buying a Team Licence", () => {
  it("enrolls nobody, so notifies nobody", () => {
    const result = buyTeamLicence(
      db,
      base.user.id,
      base.course.id,
      3 * 7900,
      "US",
      3
    );

    expect(result.seats).toHaveLength(3);
    expect(result.notifications).toEqual([]);
  });
});
