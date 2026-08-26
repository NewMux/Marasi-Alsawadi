import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const UPLOADS_ROOT = path.join(process.cwd(), "uploads");
const EXPENSE_ATTACHMENTS_DIR = path.join(UPLOADS_ROOT, "expenses");
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function isAllowedAttachmentMimeType(mimeType: string) {
  return mimeType in ALLOWED_MIME_EXTENSIONS;
}

/**
 * Decodes a base64 receipt scan/photo and writes it under uploads/expenses.
 * Coolify's container filesystem resets on redeploy unless this path is
 * mounted as persistent storage — see docs/hetzner_coolify_deployment.md.
 */
export async function saveExpenseAttachment(input: { dataBase64: string; mimeType: string; fileName: string }) {
  const extension = ALLOWED_MIME_EXTENSIONS[input.mimeType];
  if (!extension) throw new Error("Attachment must be a JPEG, PNG, WEBP image, or a PDF");

  const buffer = Buffer.from(input.dataBase64, "base64");
  if (buffer.length === 0) throw new Error("Attachment file is empty");
  if (buffer.length > MAX_ATTACHMENT_BYTES) throw new Error("Attachment must be 5 MB or smaller");

  await mkdir(EXPENSE_ATTACHMENTS_DIR, { recursive: true });
  const storedFileName = `${Date.now()}-${randomBytes(8).toString("hex")}.${extension}`;
  await writeFile(path.join(EXPENSE_ATTACHMENTS_DIR, storedFileName), buffer);

  return { attachmentPath: `/uploads/expenses/${storedFileName}`, attachmentOriginalName: input.fileName.slice(0, 256) };
}
