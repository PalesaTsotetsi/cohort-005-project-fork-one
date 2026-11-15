# Refund Eligibility governs asking, not deciding

The Refund Eligibility rules (individual purchase, 14 days, under 50% Course Progress, under 2 hours of Watch Time) decide whether a learner may raise a Refund Request. They do not limit what an Admin may approve: the Admin screen flags figures that are now past a limit, but never blocks the decision. We chose Admin judgement over enforcing the rules at approval because the learner keeps watching while their request is Open (ADR 0002), so enforcing at approval would punish learners for the time an Admin took to review.

## Consequences

- Don't "fix" the approve action by running the eligibility check there; the flags are the intended behaviour.
- Team purchases fail Refund Eligibility entirely for now. Refunding one would mean invalidating unclaimed seat coupons rather than ending an Enrollment, and that is separate work.
