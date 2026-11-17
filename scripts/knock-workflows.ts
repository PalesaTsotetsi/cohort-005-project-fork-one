// Creates or updates the eight Cadence Notification workflows in a Knock
// environment and commits them. Safe to run again.
//
//   npm run knock:workflows
//
// Needs KNOCK_SERVICE_TOKEN (knock_st_…), KNOCK_ENVIRONMENT (the environment
// slug, normally development) and KNOCK_FEED_CHANNEL_ID. All may come from
// .env. Promote to production afterwards with Knock's environment promotion.

import { loadEnvFileIfPresent } from "../app/lib/env.server";
import { upsertNotificationWorkflows } from "../app/lib/notifications.server";

loadEnvFileIfPresent();

const serviceToken = process.env.KNOCK_SERVICE_TOKEN;
const environment = process.env.KNOCK_ENVIRONMENT;
const feedChannelId = process.env.KNOCK_FEED_CHANNEL_ID;

if (!serviceToken || !environment || !feedChannelId) {
  console.error(
    "Set KNOCK_SERVICE_TOKEN (knock_st_…), KNOCK_ENVIRONMENT (e.g. development) and KNOCK_FEED_CHANNEL_ID in .env or the shell."
  );
  process.exit(1);
}

const written = await upsertNotificationWorkflows({
  environment,
  serviceToken,
  feedChannelId,
});

console.log(
  `Knock ${environment}: wrote and committed ${written.length} workflows:`
);
for (const key of written) console.log(`  ${key}`);
