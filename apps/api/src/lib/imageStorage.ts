import { promises as fs } from 'node:fs'
import path from 'node:path'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { createLogger } from './logger.js'

const log = createLogger('imageStorage')

// ─── Interface ───────────────────────────────────────────────────────────────

export interface ImageStorage {
  /**
   * Stores `body` under `key` and returns the public URL the browser should
   * load. `key` should be a path-shaped string like `avatars/<userId>/<id>.webp`
   * — backends prepend their own root (S3 bucket, local disk path).
   */
  put(args: { key: string; body: Buffer; contentType: string }): Promise<{ url: string }>
  /** Best-effort delete. No-op if the object doesn't exist. */
  delete(key: string): Promise<void>
}

// ─── S3 backend ──────────────────────────────────────────────────────────────

export class S3ImageStorage implements ImageStorage {
  private client: S3Client
  private bucket: string
  private publicUrlBase: string

  constructor(args: {
    region: string
    bucket: string
    accessKeyId: string
    secretAccessKey: string
    /**
     * Optional CDN / website endpoint (no trailing slash). Defaults to the
     * regional virtual-hosted-style URL: https://<bucket>.s3.<region>.amazonaws.com
     */
    publicUrlBase?: string
  }) {
    this.client = new S3Client({
      region: args.region,
      credentials: { accessKeyId: args.accessKeyId, secretAccessKey: args.secretAccessKey },
    })
    this.bucket = args.bucket
    this.publicUrlBase = args.publicUrlBase
      ?? `https://${args.bucket}.s3.${args.region}.amazonaws.com`
  }

  async put(args: { key: string; body: Buffer; contentType: string }): Promise<{ url: string }> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: args.key,
      Body: args.body,
      ContentType: args.contentType,
      // Cache aggressively — keys are content-addressed (caller includes a
      // nonce), so a new upload gets a new URL anyway.
      CacheControl: 'public, max-age=31536000, immutable',
    }))
    return { url: `${this.publicUrlBase}/${args.key}` }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
    } catch (e) {
      log.warning(`s3 delete failed (best-effort) — key=${key} err=${e instanceof Error ? e.message : e}`)
    }
  }
}

// ─── Local-filesystem backend (dev only) ─────────────────────────────────────

/**
 * Writes to `<root>/<key>` and serves via the static `/uploads` route mounted
 * in apps/api/src/index.ts. Use only when AWS_S3_BUCKET isn't set — never for
 * production traffic, since the API server's filesystem is ephemeral on most
 * hosts (Railway included).
 */
export class LocalFsImageStorage implements ImageStorage {
  constructor(
    /** Disk path the API writes to. */
    private readonly root: string,
    /**
     * URL prefix the browser uses to read back. The API is served same-origin
     * via the Vite proxy in dev, so a relative path works.
     */
    private readonly publicUrlBase: string = '/uploads',
  ) {}

  async put(args: { key: string; body: Buffer; contentType: string }): Promise<{ url: string }> {
    const fullPath = path.join(this.root, args.key)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, args.body)
    return { url: `${this.publicUrlBase}/${args.key}` }
  }

  async delete(key: string): Promise<void> {
    const fullPath = path.join(this.root, key)
    try {
      await fs.unlink(fullPath)
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        log.warning(`local fs delete failed — key=${key} err=${e instanceof Error ? e.message : e}`)
      }
    }
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

let _storage: ImageStorage | null = null

export function getImageStorage(): ImageStorage {
  if (_storage) return _storage
  const bucket = process.env.AWS_S3_BUCKET
  if (bucket) {
    const region = process.env.AWS_REGION ?? 'us-east-1'
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS_S3_BUCKET set but AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY missing')
    }
    log.info(`image storage: S3 bucket=${bucket} region=${region}`)
    _storage = new S3ImageStorage({
      region,
      bucket,
      accessKeyId,
      secretAccessKey,
      publicUrlBase: process.env.AWS_S3_PUBLIC_URL_BASE,
    })
    return _storage
  }
  // Dev fallback. Writes to apps/api/uploads (gitignored), served via a static
  // /uploads route. Don't use in production — the disk is ephemeral.
  const root = process.env.LOCAL_UPLOADS_ROOT ?? path.resolve(process.cwd(), 'uploads')
  log.info(`image storage: local-fs (dev) root=${root}`)
  _storage = new LocalFsImageStorage(root)
  return _storage
}

/** Test seam — lets integration tests inject a stub. */
export function setImageStorage(storage: ImageStorage): void {
  _storage = storage
}
