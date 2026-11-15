# Access ends when a Refund Request is approved, not when the Refund is issued

A learner loses access to the course the moment an Admin approves their Refund Request, not when the Refund becomes an Issued Refund. Tying access to the money would have meant building the Refund lifecycle (Pending, Issued, Failed) before approval could ship, and approval is the decision the learner is asking for.

## Consequences

- If a Refund later becomes a Failed Refund, the learner has neither the money nor the course until it is resolved. We accepted that gap; whoever builds the payout work owns closing it (e.g. by retrying, or by restoring access on failure).
- A learner keeps full access while their Refund Request is Open, so an Admin may see figures that have grown since the learner asked (see ADR 0004).
