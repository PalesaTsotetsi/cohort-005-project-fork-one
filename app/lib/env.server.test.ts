import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEnvFileIfPresent } from "./env.server";

const KEYS = ["CADENCE_TEST_FROM_FILE", "CADENCE_TEST_FROM_SHELL"];

describe("loadEnvFileIfPresent", () => {
  afterEach(() => {
    for (const key of KEYS) delete process.env[key];
  });

  it("loads variables from the file, but a value already set wins", () => {
    const directory = mkdtempSync(join(tmpdir(), "env-"));
    const file = join(directory, ".env");
    writeFileSync(
      file,
      "CADENCE_TEST_FROM_FILE=file\nCADENCE_TEST_FROM_SHELL=file\n"
    );
    process.env.CADENCE_TEST_FROM_SHELL = "shell";

    loadEnvFileIfPresent(file);

    expect(process.env.CADENCE_TEST_FROM_FILE).toBe("file");
    expect(process.env.CADENCE_TEST_FROM_SHELL).toBe("shell");
  });

  it("does nothing when the file does not exist", () => {
    const directory = mkdtempSync(join(tmpdir(), "env-"));

    expect(() => loadEnvFileIfPresent(join(directory, ".env"))).not.toThrow();
    expect(process.env.CADENCE_TEST_FROM_FILE).toBeUndefined();
  });
});
