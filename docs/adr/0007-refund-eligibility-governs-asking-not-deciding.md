# Refund Eligibility governs asking, not deciding

The Refund Eligibility rules decide whether the buyer may raise a Refund Request. They don't limit what a Platform Admin may approve: the review screen flags rules the request now breaks, but approval stays possible. We chose Platform Admin judgement over enforcing the rules at approval because the buyer keeps the course while the request is Open (ADR 0002), so enforcing them at approval would punish buyers for the time a review took.

## Consequences

- Don't "fix" the approve action by running the eligibility check there; the flags are the intended behaviour.
- The one exception is a Claimed Seat on a Team Licence, which blocks approval because that Seat belongs to someone else (ADR 0003).
