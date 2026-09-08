import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Short-lived by design. These URLs are only ever generated server-side, after the
// caller has already proven ownership -- see docs/spec.md §3 and the note in
// docs/infrastructure.md: bucket paths must never reach a client.
const PRESIGN_TTL_SECONDS = 300;

let client: S3Client | undefined;

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ENDPOINT &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME,
  );
}

function getClient(): S3Client {
  if (!isR2Configured()) {
    throw new Error(
      "R2 is not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME.",
    );
  }
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return client;
}

function bucket(): string {
  return process.env.R2_BUCKET_NAME!;
}

// Key shapes are fixed by docs/infrastructure.md. Filenames are sanitised because they
// come from admin upload forms and land straight in the object key.
function safeFilename(filename: string): string {
  const cleaned = filename.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  return cleaned.slice(0, 120) || "file";
}

export function chapterNotesKey(chapterId: string, filename: string): string {
  return `chapters/${chapterId}/notes/${randomUUID()}-${safeFilename(filename)}`;
}

export function submissionKey(userId: string, chapterId: string, filename: string): string {
  return `submissions/${userId}/${chapterId}/${randomUUID()}-${safeFilename(filename)}`;
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await getClient().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }),
  );
}

export async function presignedDownloadUrl(key: string): Promise<string> {
  return getSignedUrl(getClient(), new GetObjectCommand({ Bucket: bucket(), Key: key }), {
    expiresIn: PRESIGN_TTL_SECONDS,
  });
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
