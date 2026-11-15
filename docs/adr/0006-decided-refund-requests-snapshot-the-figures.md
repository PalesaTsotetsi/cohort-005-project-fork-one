---
status: proposed
---

# Decided Refund Requests snapshot the figures the Platform Admin saw

When a Platform Admin decides a Refund Request, we want to store the figures they saw (amount paid, days since purchase, Course Progress and Watch Time, or Claimed Seats for a Team Licence), not only the decision and its note. The review screen shows these figures live, and the buyer keeps watching while the request is Open and may buy again later, so they can't be reconstructed afterwards. Without the snapshot, "why was this approved?" can only be answered from the note. Not implemented yet.

## Consequences

- Kept progress (ADR 0001) plus these snapshots mean refunded buyers' history persists on purpose. Any future "delete my data" or retention requirement must handle it deliberately; it won't disappear on its own.
