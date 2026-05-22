import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Upload } from "@aws-sdk/lib-storage";
import fs from "fs/promises";
import path from "path";

let _s3: S3Client | null = null;

function getClient(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({
      region: process.env.AWS_REGION || "us-east-2",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    });
  }
  return _s3;
}

function getBucket(): string {
  const bucket = process.env.S3_BUCKET || "yougrate";
  return bucket;
}

export async function uploadDirectory(
  localPath: string,
  s3Prefix: string,
): Promise<number> {
  let count = 0;

  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(localPath, fullPath);

      if (entry.name === ".git" || entry.name === "node_modules") continue;

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        const body = await fs.readFile(fullPath);
        const key = `${s3Prefix}/${relPath}`;
        const upload = new Upload({
          client: getClient(),
          params: { Bucket: getBucket(), Key: key, Body: body },
        });
        await upload.done();
        count++;
      }
    }
  }

  await walk(localPath);
  return count;
}

export async function downloadFile(s3Key: string): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: getBucket(), Key: s3Key });
  const res = await getClient().send(cmd);
  return await res.Body!.transformToString("utf-8");
}

export async function uploadFile(
  s3Key: string,
  content: string,
): Promise<void> {
  const cmd = new PutObjectCommand({
    Bucket: getBucket(),
    Key: s3Key,
    Body: content,
    ContentType: "text/plain",
  });
  await getClient().send(cmd);
}

export async function listFiles(s3Prefix: string): Promise<string[]> {
  const files: string[] = [];
  let continuationToken: string | undefined;

  do {
    const cmd = new ListObjectsV2Command({
      Bucket: getBucket(),
      Prefix: s3Prefix,
      ContinuationToken: continuationToken,
    });
    const res = await getClient().send(cmd);
    for (const obj of res.Contents || []) {
      if (obj.Key) {
        files.push(obj.Key.replace(`${s3Prefix}/`, ""));
      }
    }
    continuationToken = res.NextContinuationToken;
  } while (continuationToken);

  return files;
}

export async function deleteWorkspace(s3Prefix: string): Promise<void> {
  const files = await listFiles(s3Prefix);
  if (files.length === 0) return;

  const objects = files.map((f) => ({ Key: `${s3Prefix}/${f}` }));

  for (let i = 0; i < objects.length; i += 1000) {
    const batch = objects.slice(i, i + 1000);
    const cmd = new DeleteObjectsCommand({
      Bucket: getBucket(),
      Delete: { Objects: batch },
    });
    await getClient().send(cmd);
  }
}

export function getWorkspacePrefix(
  projectId: string,
  migrationId: string,
): string {
  return `workspaces/${projectId}/${migrationId}`;
}

export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const bucket = getBucket();
  const region = process.env.AWS_REGION || "us-east-2";
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(getClient() as any, cmd, { expiresIn: 300 });
  const publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  return { uploadUrl, publicUrl };
}
