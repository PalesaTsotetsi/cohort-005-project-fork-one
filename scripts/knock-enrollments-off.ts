// Applies "Enrollments off" to a Knock environment's default preference set.
// Safe to run again: it reads the set first and writes only if it would change.
//
//   KNOCK_ENVIRONMENT=development npm run knock:enrollments-off
//
// Needs KNOCK_SERVICE_TOKEN (an account service token, knock_st_…) and
// KNOCK_ENVIRONMENT (the environment slug). Both may come from .env.

import { loadEnvFileIfPresent } from "../app/lib/env.server";
import { setEnrollmentsOffByDefault } from "../app/lib/notifications.server";

loadEnvFileIfPresent();

const serviceToken = process.env.KNOCK_SERVICE_TOKEN;
const environment = process.env.KNOCK_ENVIRONMENT;

if (!serviceToken || !environment) {
  console.error(
    "Set KNOCK_SERVICE_TOKEN (knock_st_…) and KNOCK_ENVIRONMENT (e.g. development) in .env or the shell."
  );
  process.exit(1);
}

const result = await setEnrollmentsOffByDefault({ environment, serviceToken });

console.log(
  result.changed
    ? `Knock ${environment}: Enrollments is now off by default.`
    : `Knock ${environment}: Enrollments was already off by default; nothing written.`
);
console.log(JSON.stringify(result.preferenceSet, null, 2));
