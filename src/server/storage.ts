import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "@/server/env";

/**
 * Private object storage. Keys are generated server-side (`<userId>/<uuid>`),
 * never derived from user input, so path traversal is impossible by
 * construction; the local driver still verifies it as a second guard.
 * Nothing in storage is ever publicly addressable: downloads go through an
 * authorized route handler.
 */
export interface Storage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}

class LocalStorage implements Storage {
  private readonly root = path.resolve(env.STORAGE_DIR);

  private resolve(key: string): string {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  async put(key: string, body: Uint8Array): Promise<void> {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await writeFile(file, body, { mode: 0o600 });
  }

  async get(key: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.resolve(key)));
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}

class S3Storage implements Storage {
  private readonly client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: true, // required by MinIO and most non-AWS providers
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "" },
  });
  private readonly bucket = env.S3_BUCKET ?? "";

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(key: string): Promise<Uint8Array> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error("Empty object");
    return res.Body.transformToByteArray();
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

let instance: Storage | undefined;
export function storage(): Storage {
  instance ??= env.STORAGE_DRIVER === "s3" ? new S3Storage() : new LocalStorage();
  return instance;
}
