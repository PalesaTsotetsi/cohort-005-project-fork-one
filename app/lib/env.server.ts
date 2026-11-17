import { existsSync } from "node:fs";

// ─── Loading .env ───
// Cadence reads its keys (Postmark, Knock) from process.env. When a .env file
// exists it is loaded once, on the server, with Node's built-in env-file
// loader. Variables already set in the environment win over the file. With no
// .env, nothing changes.

export function loadEnvFileIfPresent(path = ".env"): void {
  if (!existsSync(path)) return;
  process.loadEnvFile(path);
}
