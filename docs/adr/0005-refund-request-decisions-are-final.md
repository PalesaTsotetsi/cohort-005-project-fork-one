# Refund Request decisions are final

Once an Admin approves or declines a Refund Request, the decision can't be undone. Undoing an approval would mean restoring access the learner has already lost, retracting an outcome email they've already received, and, once Refunds are paid out, reversing money that may already be in flight, none of which exists. A mis-clicked decline is already recoverable because the learner may raise a new Refund Request, so we guard approval with a confirmation step instead of building an undo.

## Consequences

- Anyone adding an undo later must reverse everything approval triggered: the ended Enrollment (ADR 0001), the outcome email, and any Pending or Issued Refund.
- A second Admin deciding an already-decided request gets an error, not an overwrite.
