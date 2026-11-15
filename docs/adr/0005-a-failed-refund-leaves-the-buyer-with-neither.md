# A Failed Refund leaves the buyer with neither the course nor the money

Because a place on a course ends at approval rather than when the Refund is issued (ADR 0002), a Refund that later becomes a Failed Refund leaves the buyer with neither the course nor their money until someone acts. We accepted that gap so approval could ship without the Refund lifecycle (Pending, Issued, Failed), which is out of scope for now.

## Consequences

- Whoever builds the payout work owns closing the gap, e.g. by retrying or by restoring what the Purchase granted when a Refund fails. Approval itself should not change to wait for the money.
