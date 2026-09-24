import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

async function main(): Promise<void> {
  const request = process.env.ANPOS_PRODUCTION_MIGRATE_ON_BUILD?.trim();

  if (!request) {
    console.log("guarded production migration: not requested");
    return;
  }

  if (!/^[0-9a-f]{40}$/.test(request)) {
    throw new Error("ANPOS_PRODUCTION_MIGRATE_ON_BUILD must be an exact 40-character source SHA");
  }
  if (process.env.VERCEL_ENV !== "production") {
    throw new Error("guarded production migration requires VERCEL_ENV=production");
  }

  const manifest = JSON.parse(await readFile("EXPORT-MANIFEST.json", "utf8")) as {
    export_mode?: unknown;
    source_revision?: unknown;
  };
  if (manifest.export_mode !== "service") {
    throw new Error("guarded production migration requires the deterministic service export");
  }
  if (manifest.source_revision !== request) {
    throw new Error("guarded production migration source identity mismatch");
  }

  const databaseUrl =
    process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();
  if (!databaseUrl || !/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    throw new Error("production database URL is missing or invalid");
  }

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    console.log(`guarded production migration pass ${attempt}/2`);
    const result = spawnSync(npm, ["run", "migrate"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    if (result.status !== 0) {
      throw new Error(`guarded production migration pass ${attempt} failed`);
    }
  }

  console.log("guarded production migration: complete and idempotency re-run passed");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown guarded migration failure";
  console.error(message);
  process.exitCode = 1;
});
