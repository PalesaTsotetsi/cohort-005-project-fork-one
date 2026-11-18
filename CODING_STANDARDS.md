# Coding standards

Mechanical rules (no `any`, no `!`, no `as` cast on form data or search
params) are enforced by `npm run lint`. This file holds the judgement calls.

## Throw when the request can't succeed; return what the user can fix

A loader or an action that cannot continue throws a response: the record is
missing, the person lacks access, or the intent is unknown.

```ts
if (!course) throw data("Course not found", { status: 404 });
```

An action returns an error only when the user can fix it by changing what they
typed: a form that fails its schema, or a service validation message. The
form shows the message beside the input.

```ts
if (!parsed.success) {
  return { ok: false, error: "Enter a comment before posting." };
}
```

Anything else that returns an error shape is a violation, such as
`return { ok: false, error: "Lesson not found." }`. Each returned error shape
is one more failure path the component must handle.

## Parse untrusted input with a schema

Form data, search parameters and request bodies get a zod schema before the
values reach any query. Use `parseFormData` in `app/lib/validation.ts` for
form data.
