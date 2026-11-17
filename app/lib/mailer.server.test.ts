import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  outboxTransport,
  sendEmail,
  type MailTransport,
} from "./mailer.server";

describe("sendEmail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes the message to the outbox when there is no Postmark token", async () => {
    const directory = mkdtempSync(join(tmpdir(), "outbox-"));

    await sendEmail(
      { to: "liam@example.com", subject: "Hello", body: "Hi Liam" },
      outboxTransport(directory)
    );

    const files = readdirSync(directory);
    expect(files).toHaveLength(1);
    const written = JSON.parse(readFileSync(join(directory, files[0]), "utf8"));
    expect(written).toMatchObject({
      to: "liam@example.com",
      subject: "Hello",
      body: "Hi Liam",
    });
  });

  it("resolves and logs one structured line when the transport fails", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing: MailTransport = {
      async send() {
        throw new Error("Postmark is down");
      },
    };

    await expect(
      sendEmail(
        { to: "liam@example.com", subject: "Refund approved", body: "Hi" },
        failing
      )
    ).resolves.toBeUndefined();

    expect(errorLog).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(errorLog.mock.calls[0][0]));
    expect(line).toEqual({
      event: "email_failed",
      subject: "Refund approved",
      to: "liam@example.com",
      error: "Postmark is down",
    });
  });
});
