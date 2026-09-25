import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import {
  parseTemplateReleaseManifest,
  parseTemplateReleasePlanManifest,
  type VerifiedTemplateRelease,
  type VerifiedTemplateReleasePlan,
} from "./releases";

const RELEASE_ROOT = join(process.cwd(), "vendor-release");
const TEMPLATE_ROOT = join(RELEASE_ROOT, "template");
const MANIFEST_PATH = join(TEMPLATE_ROOT, "EXPORT-MANIFEST.json");
const ARCHIVE_PATH = join(RELEASE_ROOT, "anpos-commercial-template.zip");
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_TEMPLATE_MATERIALIZATION_FILES = 5_000;
const MAX_TEMPLATE_MATERIALIZATION_BYTES = 24 * 1024 * 1024;

export type CommercialReleaseMetadata = VerifiedTemplateRelease & {
  repository: string;
  release_ref: string;
};

export type CommercialReleasePlanSnapshot = VerifiedTemplateReleasePlan & {
  repository: string;
  release_ref: string;
};

export type TemplateReleaseMaterializationRequest = {
  path: string;
  git_object: string;
  sha256: string;
  size: number;
  git_mode: "100644" | "100755";
};

export type MaterializedTemplateReleaseFile = TemplateReleaseMaterializationRequest & {
  content_base64: string;
};

function safePath(value: string): boolean {
  if (!value || value.length > 512 || value.startsWith("/") || value.includes("\\") || /[\r\n\0]/.test(value)) return false;
  return value.split("/").every((part) => part && part !== "." && part !== ".." && part !== ".git");
}

async function manifestJson(): Promise<unknown> {
  const raw = await readFile(MANIFEST_PATH);
  if (!raw.length || raw.length > MAX_MANIFEST_BYTES) throw new Error("COMMERCIAL_RELEASE_MANIFEST_TOO_LARGE");
  try { return JSON.parse(raw.toString("utf8")); }
  catch { throw new Error("INVALID_COMMERCIAL_RELEASE_MANIFEST_JSON"); }
}

export async function templateReleaseManifest(): Promise<CommercialReleaseMetadata> {
  const manifest = parseTemplateReleaseManifest(await manifestJson());
  return {
    ...manifest,
    repository: "embedded:anpos-commercial-template",
    release_ref: manifest.source_revision,
  };
}

export async function templateReleasePlanSnapshot(): Promise<CommercialReleasePlanSnapshot> {
  const manifest = parseTemplateReleasePlanManifest(await manifestJson());
  return {
    ...manifest,
    repository: "embedded:anpos-commercial-template",
    release_ref: manifest.source_revision,
  };
}

export async function materializeTemplateReleaseFiles(
  files: TemplateReleaseMaterializationRequest[],
): Promise<MaterializedTemplateReleaseFile[]> {
  if (!Array.isArray(files) || files.length < 1 || files.length > MAX_TEMPLATE_MATERIALIZATION_FILES) {
    throw new Error("INVALID_TEMPLATE_MATERIALIZATION_FILES");
  }

  const release = await templateReleasePlanSnapshot();
  const byPath = new Map(release.files.map((file) => [file.path, file]));
  const seen = new Set<string>();
  let expectedBytes = 0;
  const normalized = files.map((file) => {
    if (
      !file
      || !safePath(file.path)
      || seen.has(file.path)
      || !/^[0-9a-f]{40}$/i.test(file.git_object)
      || !/^[0-9a-f]{64}$/i.test(file.sha256)
      || !Number.isSafeInteger(file.size)
      || file.size < 0
      || !["100644", "100755"].includes(file.git_mode)
    ) throw new Error("INVALID_TEMPLATE_MATERIALIZATION_FILE");
    seen.add(file.path);
    expectedBytes += file.size;
    if (expectedBytes > MAX_TEMPLATE_MATERIALIZATION_BYTES) throw new Error("TEMPLATE_MATERIALIZATION_BYTES_EXCEEDED");

    const declared = byPath.get(file.path);
    if (
      !declared
      || declared.git_object?.toLowerCase() !== file.git_object.toLowerCase()
      || declared.sha256.toLowerCase() !== file.sha256.toLowerCase()
      || declared.size !== file.size
      || declared.git_mode !== file.git_mode
    ) throw new Error("TEMPLATE_RELEASE_FILE_IDENTITY_MISMATCH");
    return {
      path: file.path,
      git_object: file.git_object.toLowerCase(),
      sha256: file.sha256.toLowerCase(),
      size: file.size,
      git_mode: file.git_mode,
    };
  });

  return Promise.all(normalized.map(async (file) => {
    const absolute = resolve(TEMPLATE_ROOT, ...file.path.split("/"));
    const root = resolve(TEMPLATE_ROOT) + sep;
    if (!absolute.startsWith(root)) throw new Error("INVALID_TEMPLATE_MATERIALIZATION_FILE");
    const raw = await readFile(absolute);
    if (
      raw.length !== file.size
      || createHash("sha256").update(raw).digest("hex") !== file.sha256
    ) throw new Error("TEMPLATE_RELEASE_BLOB_DIGEST_MISMATCH");
    return { ...file, content_base64: raw.toString("base64") };
  }));
}

export async function templateArchive(): Promise<{
  repository: "embedded:anpos-commercial-template";
  release_ref: string;
  filename: "anpos-commercial-template.zip";
  content: Buffer;
  sha256: string;
}> {
  const release = await templateReleaseManifest();
  const content = await readFile(ARCHIVE_PATH);
  if (!content.length || content.length > 48 * 1024 * 1024) throw new Error("COMMERCIAL_RELEASE_ARCHIVE_INVALID");
  return {
    repository: "embedded:anpos-commercial-template",
    release_ref: release.release_ref,
    filename: "anpos-commercial-template.zip",
    content,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}
