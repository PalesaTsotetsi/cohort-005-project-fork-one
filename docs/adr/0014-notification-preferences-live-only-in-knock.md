# Notification Preferences live only in Knock

Knock holds every Notification Preference, and Cadence stores no copy of them. Cadence decides which Notification Categories a person is shown switches for, from their role and Purchases, but whether each switch is on or off is read from Knock and written to Knock. Knock already evaluates preferences when it sends, so a copy in Cadence would be a second source of truth to keep in step, for the sake of a vendor swap the Knock prototype showed we don't need.

## Considered Options

- **A `notification_preferences` table in Cadence, copied to Knock.** Rejected: every write has to land in two places, and the two copies can drift apart. It would only pay off when moving to another vendor.

## Consequences

- "Enrollments off by default" is an entry in each Knock environment's default preference set (`categories.enrollments.channel_types.in_app_feed: false`), applied by a script in the repo. Knock doesn't version that set or promote it between environments.
- Every preference write changes only the one switch that moved, as a merge. Writing the whole set would pin that person to today's defaults.
- When Knock can't be reached, Cadence can't show anyone's preferences, and says so rather than guessing.
- Leaving Knock means exporting every user's preferences from it first.
