# Refunds end Enrollments instead of deleting them

When an Admin approves a Refund Request, the learner's Enrollment is marked as ended (with when, and because of a Refund) rather than deleted, and every "can this learner see the course?" check goes through one shared function that respects that mark. We chose this over deleting the Enrollment, which would lose enrolment and completion history, and over having each access check look up Approved Refund Requests, which would spread refund knowledge across the five places that independently checked enrollment.

## Consequences

- An Enrollment row existing no longer means the learner has access; code must use the shared check, never query enrollments directly.
- Buying the course again restores access to the same learner and their kept progress.
