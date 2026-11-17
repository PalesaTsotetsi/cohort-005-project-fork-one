// PROTOTYPE, throwaway. Answers "Does Knock hold up against Cadence?".
// Lives on the prototype/knock-holds-up branch only; never merge.

import Knock, { signUserToken } from "@knocklabs/node";

// Nothing in Cadence loads .env into process.env yet; the prototype does it itself.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env: the page will show the missing keys
}

export const env = {
  publicKey: process.env.KNOCK_PUBLIC_API_KEY ?? "",
  secretKey: process.env.KNOCK_SECRET_API_KEY ?? "",
  signingKey: process.env.KNOCK_SIGNING_KEY ?? "",
  feedChannelId: process.env.KNOCK_FEED_CHANNEL_ID ?? "",
};

export const knock = new Knock({ apiKey: env.secretKey });

export type CadenceUser = { id: number; name: string; email: string };

// Check 1: a token for exactly the user the DevUI switcher selected.
export function signTokenFor(userId: number) {
  return signUserToken(String(userId), {
    signingKey: env.signingKey,
    expiresInSeconds: 60 * 60,
  });
}

// User sync: upsert the person into Knock (Knock calls this "identify").
export function syncUser(user: CadenceUser) {
  return knock.users.update(String(user.id), {
    name: user.name,
    email: user.email,
  });
}

const inline = (u: CadenceUser) => ({ id: String(u.id), name: u.name, email: u.email });

// Check 2: server-side triggers, one per workflow committed in Development.
export function triggerDiscussionQuestion(recipient: CadenceUser, actor: CadenceUser) {
  return knock.workflows.trigger("discussion-question", {
    // Inline: Knock rejects an actor id it hasn't seen before (400 "actor ... missing").
    recipients: [inline(recipient)],
    actor: inline(actor),
    data: {
      actor_name: actor.name,
      lesson_title: "Primitive Types",
      url: "/courses/introduction-to-typescript/lessons/4",
    },
  });
}

export function triggerNewEnrollment(recipient: CadenceUser, actor: CadenceUser) {
  return knock.workflows.trigger("new-enrollment", {
    // Inline: Knock rejects an actor id it hasn't seen before (400 "actor ... missing").
    recipients: [inline(recipient)],
    actor: inline(actor),
    data: {
      actor_name: actor.name,
      course_title: "Introduction to TypeScript",
      url: "/instructor/1/students",
    },
  });
}

// Check 4: "off by default", done per user from the server (e.g. at sync time).
export function setEnrollmentsServerSide(userId: number, on: boolean) {
  return knock.users.setPreferences(String(userId), "default", {
    __persistence_strategy__: "merge",
    categories: { enrollments: on },
  });
}

export async function getPreferencesServerSide(userId: number) {
  try {
    return await knock.users.getPreferences(String(userId), "default");
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export function resetPreferencesServerSide(userId: number) {
  return knock.users.unsetPreferences(String(userId), "default");
}
