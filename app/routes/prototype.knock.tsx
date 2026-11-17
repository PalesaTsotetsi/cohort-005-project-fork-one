// PROTOTYPE, throwaway. Answers "Does Knock hold up against Cadence?".
// Lives on the prototype/knock-holds-up branch only; never merge.
//
// Four checks, one panel each. Switch people with the DevUI panel: the page
// signs a fresh Knock token for whoever is selected.

import { useEffect, useRef, useState } from "react";
import { Form, useActionData, useNavigation } from "react-router";
import { eq, ne } from "drizzle-orm";
import type { Route } from "./+types/prototype.knock";
import { db } from "~/db";
import { users } from "~/db/schema";
import { getCurrentUserId } from "~/lib/session";
import {
  env,
  getPreferencesServerSide,
  resetPreferencesServerSide,
  setEnrollmentsServerSide,
  signTokenFor,
  syncUser,
  triggerDiscussionQuestion,
  triggerNewEnrollment,
} from "~/lib/prototype-knock.server";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await getCurrentUserId(request);
  if (!userId) {
    throw new Response("Select a user from the DevUI panel", { status: 401 });
  }
  const me = db.select().from(users).where(eq(users.id, userId)).get();
  if (!me) throw new Response("No such user", { status: 404 });
  const someoneElse = db.select().from(users).where(ne(users.id, userId)).get()!;

  await syncUser(me);
  const token = await signTokenFor(me.id);
  const [, payload] = token.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());

  return {
    me: { id: me.id, name: me.name, role: me.role },
    someoneElse: { id: someoneElse.id, name: someoneElse.name },
    token,
    claims,
    publicKey: env.publicKey,
    feedChannelId: env.feedChannelId,
    serverPreferences: await getPreferencesServerSide(me.id),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const userId = await getCurrentUserId(request);
  if (!userId) throw new Response("Select a user from the DevUI panel", { status: 401 });
  const me = db.select().from(users).where(eq(users.id, userId)).get()!;
  const actor = db.select().from(users).where(ne(users.id, userId)).get()!;
  const intent = String((await request.formData()).get("intent"));
  const at = new Date().toLocaleTimeString();

  try {
    switch (intent) {
      case "trigger-discussion-question":
        return { at, intent, result: await triggerDiscussionQuestion(me, actor) };
      case "trigger-new-enrollment":
        return { at, intent, result: await triggerNewEnrollment(me, actor) };
      case "enrollments-off-server":
        return { at, intent, result: await setEnrollmentsServerSide(me.id, false) };
      case "reset-preferences":
        await resetPreferencesServerSide(me.id);
        return { at, intent, result: "preferences unset" };
    }
  } catch (e) {
    return { at, intent, error: e instanceof Error ? e.message : String(e) };
  }
  return { at, intent, error: "unknown intent" };
}

type FeedState = {
  items: {
    id: string;
    source: { key: string; categories: string[] };
    blocks: { name: string; rendered: string }[];
    inserted_at: string;
    seen_at: string | null;
    read_at: string | null;
  }[];
  metadata: { total_count: number; unread_count: number; unseen_count: number };
  networkStatus: string;
};

export default function KnockPrototype({ loaderData }: Route.ComponentProps) {
  const { me, someoneElse, token, claims, publicKey, feedChannelId, serverPreferences } =
    loaderData;
  const lastAction = useActionData<typeof action>();
  const navigation = useNavigation();

  const feedRef = useRef<any>(null);
  const knockRef = useRef<any>(null);
  const [feed, setFeed] = useState<FeedState | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [probe, setProbe] = useState<string>("not run");
  const [clientPrefs, setClientPrefs] = useState<string>("not loaded");
  const log = (line: string) =>
    setEvents((e) => [`${new Date().toLocaleTimeString()}  ${line}`, ...e].slice(0, 30));

  // Checks 1–3: authenticate the browser as the selected person, then read the
  // feed headlessly, with realtime updates.
  useEffect(() => {
    let disposed = false;
    let unsubscribe = () => {};
    (async () => {
      const { default: Knock } = await import("@knocklabs/client");
      if (disposed) return;
      const knock = new Knock(publicKey);
      knock.authenticate({ id: String(me.id) }, token, { identificationStrategy: "skip" });
      const f = knock.feeds.initialize(feedChannelId, { archived: "exclude", page_size: 20 });
      knockRef.current = knock;
      feedRef.current = f;
      const sync = () => setFeed(f.getState() as unknown as FeedState);
      const sub = f.store.store.subscribe(sync);
      unsubscribe = sub;
      f.on("items.received.realtime", (p: any) =>
        log(`realtime: ${p?.items?.length ?? "?"} new item(s) arrived without a reload`)
      );
      f.on("items.*", (p: any) => log(`feed event: ${p?.event ?? "items.*"}`));
      f.listenForUpdates();
      await f.fetch();
      log(`authenticated as user ${me.id} and fetched the feed`);
    })().catch((e) => log(`ERROR: ${e?.message ?? e}`));
    return () => {
      disposed = true;
      unsubscribe();
      feedRef.current?.dispose();
      knockRef.current?.teardown();
      feedRef.current = null;
      knockRef.current = null;
      setFeed(null);
    };
  }, [me.id, token, publicKey, feedChannelId]);

  // Check 1, the negative case: my token must not open someone else's feed.
  async function probeSomeoneElsesFeed() {
    const res = await fetch(
      `https://api.knock.app/v1/users/${someoneElse.id}/feeds/${feedChannelId}`,
      { headers: { Authorization: `Bearer ${publicKey}`, "X-Knock-User-Token": token } }
    );
    setProbe(`${res.status} ${(await res.text()).slice(0, 160)}`);
  }

  async function loadClientPrefs() {
    try {
      setClientPrefs(JSON.stringify(await knockRef.current.user.getPreferences(), null, 2));
    } catch (e: any) {
      setClientPrefs(`ERROR: ${e?.message ?? e}`);
    }
  }

  async function optInAsTheUser() {
    try {
      const res = await knockRef.current.user.setPreferences({
        categories: { enrollments: true },
      });
      setClientPrefs(JSON.stringify(res, null, 2));
      log("opted in to enrollments from the browser, with the user's own token");
    } catch (e: any) {
      setClientPrefs(`ERROR: ${e?.message ?? e}`);
    }
  }

  const busy = navigation.state !== "idle";

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 text-sm">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">
          Prototype · throwaway
        </p>
        <h1 className="text-2xl font-bold">Does Knock hold up against Cadence?</h1>
        <p className="text-muted-foreground">
          Signed in as <b>{me.name}</b> (user {me.id}, {me.role}). Switch people with the
          DevUI panel; everything below follows.
        </p>
      </header>

      {lastAction && (
        <pre className="overflow-x-auto rounded border bg-muted p-3 text-xs">
          Last server action ({lastAction.at}): {lastAction.intent}
          {"\n"}
          {JSON.stringify("error" in lastAction ? lastAction.error : lastAction.result, null, 2)}
        </pre>
      )}

      <Panel n={1} title="Signed tokens follow the DevUI switcher">
        <p>
          The server signed this token for the selected person. Its <code>sub</code> should
          be <b>{me.id}</b>.
        </p>
        <pre className="rounded bg-muted p-2 text-xs">{JSON.stringify(claims, null, 2)}</pre>
        <button className="btn" onClick={probeSomeoneElsesFeed}>
          Try to open {someoneElse.name}'s feed with my token (should be refused)
        </button>
        <pre className="rounded bg-muted p-2 text-xs">{probe}</pre>
      </Panel>

      <Panel n={2} title="A server-side trigger lands in my feed">
        <p>
          Pretend <b>{someoneElse.name}</b> did something that concerns me. Watch the feed
          and the event log: it should arrive in realtime, with no reload.
        </p>
        <Form method="post" className="flex flex-wrap gap-2">
          <button className="btn" name="intent" value="trigger-discussion-question" disabled={busy}>
            Someone asks a Discussion Question
          </button>
          <button className="btn" name="intent" value="trigger-new-enrollment" disabled={busy}>
            Someone enrolls (New Enrollment)
          </button>
        </Form>
      </Panel>

      <Panel n={3} title="Headless feed reads">
        <div className="flex flex-wrap gap-4">
          <Stat label="total" value={feed?.metadata.total_count} />
          <Stat label="unread" value={feed?.metadata.unread_count} />
          <Stat label="unseen" value={feed?.metadata.unseen_count} />
          <Stat label="network" value={feed?.networkStatus} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => feedRef.current?.markAllAsSeen()}>
            Mark all seen (as opening the feed would)
          </button>
          <button className="btn" onClick={() => feedRef.current?.markAllAsRead()}>
            Mark all read
          </button>
          <button className="btn" onClick={() => feedRef.current?.fetch()}>
            Refetch
          </button>
        </div>
        <ul className="divide-y rounded border">
          {feed?.items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 p-2">
              <span
                className={`mt-1 size-2 shrink-0 rounded-full ${item.read_at ? "bg-transparent" : "bg-blue-500"}`}
              />
              <div className="min-w-0 flex-1">
                <div
                  dangerouslySetInnerHTML={{
                    __html: item.blocks.find((b) => b.name === "body")?.rendered ?? "",
                  }}
                />
                <div className="text-xs text-muted-foreground">
                  {item.source.key} [{item.source.categories.join(", ")}] ·{" "}
                  {new Date(item.inserted_at).toLocaleTimeString()} · link{" "}
                  {item.blocks.find((b) => b.name === "action_url")?.rendered} · seen{" "}
                  {item.seen_at ? "yes" : "no"} · read {item.read_at ? "yes" : "no"}
                </div>
              </div>
              <button
                className="btn"
                onClick={() =>
                  item.read_at
                    ? feedRef.current?.markAsUnread(item)
                    : feedRef.current?.markAsRead(item)
                }
              >
                {item.read_at ? "Mark unread" : "Mark read"}
              </button>
            </li>
          ))}
          {feed && feed.items.length === 0 && <li className="p-2">Feed is empty.</li>}
          {!feed && <li className="p-2">Loading…</li>}
        </ul>
      </Panel>

      <Panel n={4} title="New Enrollment: off by default, then opted in">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Turn enrollments off from the server (what Cadence would do when it syncs an Instructor).</li>
          <li>Trigger a New Enrollment: nothing should arrive.</li>
          <li>Opt in from the browser, as the person would on /settings.</li>
          <li>Trigger again: now it should arrive.</li>
        </ol>
        <Form method="post" className="flex flex-wrap gap-2">
          <button className="btn" name="intent" value="enrollments-off-server" disabled={busy}>
            1. Enrollments off (server)
          </button>
          <button className="btn" name="intent" value="trigger-new-enrollment" disabled={busy}>
            2/4. Someone enrolls
          </button>
          <button type="button" className="btn" onClick={optInAsTheUser}>
            3. Opt in (browser, as me)
          </button>
          <button className="btn" name="intent" value="reset-preferences" disabled={busy}>
            Reset my preferences
          </button>
          <button type="button" className="btn" onClick={loadClientPrefs}>
            Read my preferences (browser)
          </button>
        </Form>
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold">Preferences, read by the server</p>
            <pre className="rounded bg-muted p-2 text-xs">
              {JSON.stringify(serverPreferences, null, 2)}
            </pre>
          </div>
          <div>
            <p className="text-xs font-semibold">Preferences, read or written by the browser</p>
            <pre className="rounded bg-muted p-2 text-xs">{clientPrefs}</pre>
          </div>
        </div>
      </Panel>

      <Panel n={0} title="Event log">
        <pre className="max-h-64 overflow-y-auto rounded bg-muted p-2 text-xs">
          {events.join("\n") || "nothing yet"}
        </pre>
      </Panel>

      <style>{`.btn{border:1px solid hsl(var(--border, 0 0% 80%));border-radius:6px;padding:4px 10px;background:white;color:black}.btn:disabled{opacity:.5}`}</style>
    </div>
  );
}

function Panel({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h2 className="font-semibold">
        {n > 0 && <span className="text-muted-foreground">Check {n} · </span>}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded border px-3 py-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{String(value ?? "…")}</div>
    </div>
  );
}
