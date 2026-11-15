# Refund Request decisions are final

Once a Platform Admin approves or declines a Refund Request, the decision can't be undone. Undoing an approval would mean restoring a place on a course or Unclaimed Seats that have already ended, retracting an outcome email the buyer has already received, and, once Refunds are paid out, reversing money that may already be in flight. A mistaken decline is already recoverable, because the buyer may raise a new Refund Request.

## Consequences

- Anyone adding an undo later must reverse everything approval triggered: the deleted place on the course (ADR 0004), the Seats marked as refunded (ADR 0003), the outcome email, and any Pending or Issued Refund.
- A second Platform Admin deciding an already-decided request gets an error, not an overwrite.
- A Failed Refund doesn't reopen the decision either. When the buyer keeps the course or raises a Refund Appeal (ADR 0005), the Refund Request stays Approved; neither is an undo.
