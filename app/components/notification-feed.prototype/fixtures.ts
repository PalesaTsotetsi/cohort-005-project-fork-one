// PROTOTYPE — throwaway. Answers "What does the Notification Feed look like in
// Cadence?" (wayfinder map #6, ticket #12). In-memory fixtures only; nothing here
// talks to Knock or the database.
//
// Fixtures follow the v1 catalogue from "Which Notifications does Cadence send,
// and to whom?" (#7), using real seeded names, courses and lessons.

export type NotificationKind =
  | "refund-raised" // 1 → buyer (confirmation of own request)
  | "refund-approved" // 2 → buyer
  | "refund-declined" // 3 → buyer
  | "refund-open" // 4 → every Platform Admin
  | "seat-claimed" // 5 → Team Admin
  | "new-enrollment" // 6 → Instructor (meant to be off by default)
  | "discussion-question" // 7 → Instructor
  | "discussion-reply"; // 8 → question author

export interface ProtoNotification {
  id: string;
  kind: NotificationKind;
  actor: string | null; // null = "you" (refund-raised)
  title: string; // one-line sentence, actor first
  snippet?: string; // quoted context: question text, refund reason, decision note
  course: string;
  href: string; // where clicking takes you
  cta: string; // label for an explicit action button
  insertedAt: string; // ISO
  seenAt: string | null;
  readAt: string | null;
  archivedAt: string | null;
}

export interface FeedPerson {
  id: number;
  name: string;
  role: "student" | "instructor" | "admin";
  isTeamAdmin: boolean;
}

const NOW = Date.now();
const ago = (mins: number) => new Date(NOW - mins * 60_000).toISOString();
const H = 60;
const D = 24 * H;

let seq = 0;
function n(
  kind: NotificationKind,
  minsAgo: number,
  fields: Omit<
    ProtoNotification,
    "id" | "kind" | "insertedAt" | "seenAt" | "readAt" | "archivedAt"
  >,
  state: "unseen" | "seen" | "read" = "unseen"
): ProtoNotification {
  const insertedAt = ago(minsAgo);
  return {
    id: `n${++seq}`,
    kind,
    insertedAt,
    seenAt: state === "unseen" ? null : insertedAt,
    readAt: state === "read" ? insertedAt : null,
    archivedAt: null,
    ...fields,
  };
}

const TS = { title: "Introduction to TypeScript", slug: "introduction-to-typescript" };
const TW = { title: "Design Systems with Tailwind", slug: "design-systems-with-tailwind" };
const API = { title: "Building REST APIs with Node.js", slug: "building-rest-apis-with-nodejs" };

const students = [
  "James Park",
  "Olivia Martinez",
  "Liam Thompson",
  "Sophia Davis",
  "Isla Fernandes",
  "Ethan Okafor",
  "Mia Lindqvist",
  "Lucas Moreau",
  "Zara Haddad",
  "Felix Andersen",
  "Nina Kowalski",
  "Omar Rahman",
];

const questions = [
  { lesson: 4, lessonTitle: "Primitive Types", text: "Why does `typeof null` return \"object\"? Is that something TS fixes?" },
  { lesson: 7, lessonTitle: "Union and Intersection Types", text: "When would I reach for an intersection over extending an interface?" },
  { lesson: 6, lessonTitle: "Type Aliases and Interfaces", text: "The video says prefer interfaces, but the exercise uses a type alias — which is it?" },
  { lesson: 8, lessonTitle: "Function Types", text: "Can you show how to type a callback that's optional?" },
  { lesson: 5, lessonTitle: "Arrays and Tuples", text: "Is a readonly tuple the same as `as const`?" },
];

function studentFeed(): ProtoNotification[] {
  return [
    n("discussion-reply", 14, {
      actor: "Sarah Chen",
      title: "Sarah Chen replied to your question",
      snippet: "Good catch — it's a 30-year-old JavaScript bug. TS can't change it, but narrowing with `=== null` handles it.",
      course: TS.title,
      href: `/courses/${TS.slug}/lessons/4`,
      cta: "View reply",
    }),
    n("discussion-reply", 3 * H, {
      actor: "Liam Thompson",
      title: "Liam Thompson replied to your question",
      snippet: "I had the same issue — restarting the TS server in VS Code fixed it for me.",
      course: TS.title,
      href: `/courses/${TS.slug}/lessons/2`,
      cta: "View reply",
    }),
    n(
      "refund-approved",
      1 * D + 2 * H,
      {
        actor: "Alex Rivera",
        title: "Your Refund Request was approved",
        snippet: "Approved — sorry the course wasn't the right fit.",
        course: API.title,
        href: `/courses/${API.slug}`,
        cta: "View course",
      },
      "seen"
    ),
    n(
      "refund-raised",
      3 * D,
      {
        actor: null,
        title: "We've received your Refund Request",
        snippet: "A Platform Admin will review it. We'll let you know here when it's decided.",
        course: API.title,
        href: `/courses/${API.slug}`,
        cta: "View course",
      },
      "read"
    ),
    n(
      "discussion-reply",
      6 * D,
      {
        actor: "Marcus Johnson",
        title: "Marcus Johnson replied to your question",
        snippet: "Express 5 handles async errors natively now, so you can drop the wrapper.",
        course: API.title,
        href: `/courses/${API.slug}`,
        cta: "View reply",
      },
      "read"
    ),
    n(
      "refund-declined",
      18 * D,
      {
        actor: "Alex Rivera",
        title: "Your Refund Request was declined",
        snippet: "You've completed most of the course, which is past our refund window.",
        course: TW.title,
        href: `/courses/${TW.slug}`,
        cta: "View course",
      },
      "read"
    ),
    n(
      "refund-raised",
      19 * D,
      {
        actor: null,
        title: "We've received your Refund Request",
        snippet: "A Platform Admin will review it. We'll let you know here when it's decided.",
        course: TW.title,
        href: `/courses/${TW.slug}`,
        cta: "View course",
      },
      "read"
    ),
  ];
}

function teamAdminFeed(): ProtoNotification[] {
  const claimed = ["Noah Blackwood", "Isla Fernandes", "Ethan Okafor", "Mia Lindqvist", "Lucas Moreau", "Zara Haddad"];
  return claimed.map((name, i) =>
    n(
      "seat-claimed",
      40 + i * 9 * H,
      {
        actor: name,
        title: `${name} claimed a Seat`,
        snippet: `${claimed.length - i} of 10 Seats now claimed.`,
        course: TW.title,
        href: "/team",
        cta: "View team",
      },
      i < 2 ? "unseen" : i < 3 ? "seen" : "read"
    )
  );
}

function instructorFeed(): ProtoNotification[] {
  const out: ProtoNotification[] = [];
  questions.forEach((q, i) => {
    out.push(
      n(
        "discussion-question",
        25 + i * 17 * H,
        {
          actor: students[i],
          title: `${students[i]} asked a question on “${q.lessonTitle}”`,
          snippet: q.text,
          course: TS.title,
          href: `/courses/${TS.slug}/lessons/${q.lesson}`,
          cta: "Answer",
        },
        i < 2 ? "unseen" : i < 3 ? "seen" : "read"
      )
    );
  });
  // New Enrollment — meant to be OFF by default; shown here so the volume is visible.
  students.slice(4).forEach((name, i) => {
    const course = i % 3 === 0 ? TW : TS;
    out.push(
      n(
        "new-enrollment",
        70 + i * 7 * H,
        {
          actor: name,
          title: `${name} enrolled in ${course.title}`,
          snippet: i % 2 === 0 ? "Individual Purchase" : "Claimed Seat · Team Licence",
          course: course.title,
          href: `/instructor/${course === TS ? 1 : 3}/students`,
          cta: "View students",
        },
        i < 3 ? "unseen" : "read"
      )
    );
  });
  return out;
}

function adminFeed(): ProtoNotification[] {
  return [
    n("refund-open", 22 * H, {
      actor: "Ava Nakamura",
      title: "Ava Nakamura raised a Refund Request",
      snippet: "“Our design team was reorganised and nobody needs these seats now.” · Team Licence",
      course: TW.title,
      href: "/admin/refunds",
      cta: "Review request",
    }),
    n(
      "refund-open",
      4 * D,
      {
        actor: "James Park",
        title: "James Park raised a Refund Request",
        snippet: "“Bought the wrong one, I meant the advanced course.”",
        course: TS.title,
        href: "/admin/refunds",
        cta: "Review request",
      },
      "seen"
    ),
    ...students.slice(6, 11).map((name, i) =>
      n(
        "refund-open",
        (8 + i * 4) * D,
        {
          actor: name,
          title: `${name} raised a Refund Request`,
          snippet: "“Not what I expected from the description.”",
          course: i % 2 ? API.title : TS.title,
          href: "/admin/refunds",
          cta: "Review request",
        },
        "read"
      )
    ),
  ];
}

export function feedFor(person: FeedPerson | null): ProtoNotification[] {
  if (!person) return [];
  let items: ProtoNotification[] = [];
  if (person.role === "admin") items = adminFeed();
  if (person.role === "instructor") items = instructorFeed();
  if (person.role === "student") items = studentFeed();
  if (person.isTeamAdmin) items = [...items, ...teamAdminFeed()];
  return items.sort((a, b) => b.insertedAt.localeCompare(a.insertedAt));
}

/** A fresh Notification for the "simulate realtime arrival" button. */
export function simulatedFor(person: FeedPerson | null): ProtoNotification {
  const i = Math.floor(Math.random() * students.length);
  const who = students[i];
  if (person?.role === "admin")
    return n("refund-open", 0, {
      actor: who,
      title: `${who} raised a Refund Request`,
      snippet: "“Changed jobs, no longer need it.”",
      course: TS.title,
      href: "/admin/refunds",
      cta: "Review request",
    });
  if (person?.role === "instructor") {
    const q = questions[i % questions.length];
    return n("discussion-question", 0, {
      actor: who,
      title: `${who} asked a question on “${q.lessonTitle}”`,
      snippet: q.text,
      course: TS.title,
      href: `/courses/${TS.slug}/lessons/${q.lesson}`,
      cta: "Answer",
    });
  }
  if (person?.isTeamAdmin)
    return n("seat-claimed", 0, {
      actor: who,
      title: `${who} claimed a Seat`,
      snippet: "7 of 10 Seats now claimed.",
      course: TW.title,
      href: "/team",
      cta: "View team",
    });
  return n("discussion-reply", 0, {
    actor: "Sarah Chen",
    title: "Sarah Chen replied to your question",
    snippet: "Yes — `readonly [string, number]` is what `as const` infers for that literal.",
    course: TS.title,
    href: `/courses/${TS.slug}/lessons/5`,
    cta: "View reply",
  });
}
