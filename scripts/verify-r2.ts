// Real round-trip against the live R2 bucket: put an object, presign it, fetch it back
// over plain HTTPS (proving the signature works from outside the SDK), then delete it.
// Run with: npm run verify:r2
import { deleteObject, isR2Configured, presignedDownloadUrl, putObject, chapterNotesKey } from "@/lib/r2";

async function main() {
  if (!isR2Configured()) {
    console.error(
      "R2 is not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY\n" +
        "and R2_BUCKET_NAME in .env.local, then re-run.",
    );
    process.exit(1);
  }

  const key = chapterNotesKey("verify-chapter", "r2-round-trip.txt");
  const payload = `nts-lms r2 verification ${new Date().toISOString()}`;

  console.log(`endpoint : ${process.env.R2_ENDPOINT}`);
  console.log(`bucket   : ${process.env.R2_BUCKET_NAME}`);
  console.log(`key      : ${key}\n`);

  try {
    await putObject(key, Buffer.from(payload), "text/plain");
    console.log("[1/4] upload            OK");

    const url = await presignedDownloadUrl(key);
    console.log(`[2/4] presign           OK (expires in 300s)`);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`presigned GET returned HTTP ${response.status}`);
    const body = await response.text();
    if (body !== payload) throw new Error(`content mismatch: expected "${payload}", got "${body}"`);
    console.log("[3/4] presigned GET     OK (content matches)");

    await deleteObject(key);
    console.log("[4/4] delete            OK");
    console.log("\nR2 round-trip verified.");
  } catch (error) {
    console.error("\nR2 verification FAILED:", error instanceof Error ? error.message : error);
    console.error(`\nThe test object may still exist at: ${key}`);
    process.exit(1);
  }
}

void main();
