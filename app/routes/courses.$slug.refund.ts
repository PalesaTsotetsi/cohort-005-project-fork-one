import { data, redirect } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/courses.$slug.refund";
import { getCurrentUserId } from "~/lib/session";
import { db } from "~/db";
import { courses, refunds, users, RefundStatus } from "~/db/schema";
import { eq } from "drizzle-orm";
import { parseFormData, parseParams } from "~/lib/validation";
import { buildRefundRequestEmail } from "~/lib/refunds";
import { getRefundEligibility } from "~/lib/refunds.server";

const refundParamsSchema = z.object({
  slug: z.string().min(1),
});

const refundActionSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Tell us a little more about why you want a refund.")
    .max(1000, "Please keep your reason under 1000 characters."),
});

const STATUS_FOR_RULE = {
  "no-purchase": 403,
  "already-requested": 409,
  "claimed-seat": 403,
  window: 403,
  watched: 403,
  completed: 403,
} as const;

export async function action({ params, request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("You must be logged in to request a refund.", { status: 401 });
  }

  const { slug } = parseParams(params, refundParamsSchema);
  const course = db.select().from(courses).where(eq(courses.slug, slug)).get();

  if (!course) {
    throw data("Course not found", { status: 404 });
  }

  const student = db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();

  if (!student) {
    throw data("User not found", { status: 404 });
  }

  const eligibility = getRefundEligibility(currentUserId, course.id);

  if (!eligibility.eligible) {
    throw data(eligibility.message, {
      status: STATUS_FOR_RULE[eligibility.rule],
    });
  }

  const formData = await request.formData();
  const parsed = parseFormData(formData, refundActionSchema);

  if (!parsed.success) {
    return data({ errors: parsed.errors }, { status: 400 });
  }

  db.insert(refunds)
    .values({
      purchaseId: eligibility.purchase.id,
      status: RefundStatus.Pending,
      reason: parsed.data.reason,
    })
    .run();

  const email = buildRefundRequestEmail({
    studentName: student.name,
    studentEmail: student.email,
    courseTitle: course.title,
    refundAmount: eligibility.refundAmount,
  });

  console.log(
    `[email] to=${email.to} subject=${email.subject}\n${email.body}`
  );

  return redirect("/settings");
}
