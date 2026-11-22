// ICE LAND local API gateway
// -----------------------------------------------------------------------------
// A plain PostgREST container has no Supabase gateway (Kong) and no Storage API.
// This small local server fills both gaps on one port so the app can keep using
// the standard Supabase client:
//
//   /rest/v1/*     -> forwarded to PostgREST (prefix stripped)
//   /storage/v1/*  -> local file storage (upload, signed URLs, download)
//   /healthz       -> {"ok":true}
//
// Run:  node local-supabase/local-api.mjs
// Port: 54320 (override with LOCAL_API_PORT)
// Files are saved under local-supabase/storage/<bucket>/<path>.
//
// This is a local-development service. It trusts every request on localhost and
// is not a replacement for Supabase's hardened storage service.

import http from 'node:http';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.LOCAL_API_PORT || 54320);
const POSTGREST_URL = (process.env.POSTGREST_URL || 'http://127.0.0.1:54321').replace(/\/+$/, '');
const STORAGE_ROOT = path.resolve(
  process.env.STORAGE_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'storage'),
);
const STORAGE_SECRET = process.env.STORAGE_SECRET || 'local-storage-secret-do-not-use-in-prod';
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 50 * 1024 * 1024);
const BUCKETS = new Set(['product-images', 'payment-proofs']);

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

function mimeFor(filePath, fallback) {
  if (fallback && /^(image|application\/pdf)/.test(fallback)) return fallback;
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader(
    'Access-Control-Allow-Headers',
    req.headers['access-control-request-headers'] ||
      'authorization, apikey, content-type, x-upsert, cache-control, x-metadata, x-client-info',
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'content-length, content-range, etag');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(payload));
  res.end(payload);
}

function storageError(res, status, error, message) {
  sendJson(res, status, { statusCode: String(status), error, message });
}

function readRawBody(req, limit = MAX_UPLOAD_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('Payload too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const raw = await readRawBody(req, 1024 * 1024);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid JSON body'), { statusCode: 400 });
  }
}

// ---- object paths ----------------------------------------------------------

function safeObjectPath(bucket, objectPath) {
  if (!BUCKETS.has(bucket)) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(objectPath);
  } catch {
    return null;
  }
  const normalized = path.posix.normalize(decoded).replace(/^\/+/, '');
  if (!normalized || normalized.startsWith('..') || normalized.includes('\0')) return null;
  const absolute = path.resolve(STORAGE_ROOT, bucket, normalized);
  const bucketRoot = path.resolve(STORAGE_ROOT, bucket);
  if (absolute !== bucketRoot && !absolute.startsWith(bucketRoot + path.sep)) return null;
  return { key: normalized, absolute };
}

function signToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', STORAGE_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [encoded, signature] = token.split('.');
  const expected = createHmac('sha256', STORAGE_SECRET).update(encoded).digest('base64url');
  const a = Buffer.from(signature || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---- storage handlers ------------------------------------------------------

async function handleUpload(req, res, bucket, objectPath) {
  const location = safeObjectPath(bucket, objectPath);
  if (!location) return storageError(res, 400, 'InvalidRequest', 'Invalid bucket or object path');

  const webRequest = new Request('http://local/upload', {
    method: req.method,
    headers: req.headers,
    body: Readable.toWeb(req),
    duplex: 'half',
  });
  const form = await webRequest.formData();

  let file = null;
  for (const [, value] of form.entries()) {
    if (typeof value !== 'string') {
      file = value;
      break;
    }
  }
  if (!file) return storageError(res, 400, 'InvalidRequest', 'No file provided');

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > MAX_UPLOAD_BYTES) return storageError(res, 413, 'PayloadTooLarge', 'File is too large');

  const upsert = String(req.headers['x-upsert'] || '').toLowerCase() === 'true';
  const exists = await fs
    .stat(location.absolute)
    .then(() => true)
    .catch(() => false);
  if (exists && !upsert) {
    return storageError(res, 409, 'Duplicate', 'The resource already exists');
  }

  await fs.mkdir(path.dirname(location.absolute), { recursive: true });
  await fs.writeFile(location.absolute, bytes);

  const meta = { contentType: mimeFor(location.absolute, file.type), size: bytes.length, updatedAt: new Date().toISOString() };
  await fs.writeFile(`${location.absolute}.meta.json`, JSON.stringify(meta));

  return sendJson(res, 200, { Id: randomUUID(), Key: `${bucket}/${location.key}` });
}

async function handleSignOne(req, res, bucket, objectPath) {
  const location = safeObjectPath(bucket, objectPath);
  if (!location) return storageError(res, 400, 'InvalidRequest', 'Invalid bucket or object path');

  const exists = await fs
    .stat(location.absolute)
    .then(() => true)
    .catch(() => false);
  if (!exists) return storageError(res, 404, 'NotFound', 'Object not found');

  const body = await readJsonBody(req);
  const expiresIn = Number(body.expiresIn ?? 3600);
  const token = signToken({
    b: bucket,
    p: location.key,
    exp: Date.now() + Math.max(1, expiresIn) * 1000,
  });

  return sendJson(res, 200, {
    signedURL: `/object/sign/${bucket}/${location.key.split('/').map(encodeURIComponent).join('/')}?token=${token}`,
  });
}

async function handleSignMany(req, res, bucket) {
  if (!BUCKETS.has(bucket)) return storageError(res, 400, 'InvalidRequest', 'Invalid bucket');
  const body = await readJsonBody(req);
  const expiresIn = Number(body.expiresIn ?? 3600);
  const paths = Array.isArray(body.paths) ? body.paths : [];

  const results = await Promise.all(
    paths.map(async (rawPath) => {
      const location = safeObjectPath(bucket, rawPath);
      const exists = location
        ? await fs
            .stat(location.absolute)
            .then(() => true)
            .catch(() => false)
        : false;
      if (!location || !exists) return { error: 'not_found', path: rawPath, signedURL: null };
      const token = signToken({ b: bucket, p: location.key, exp: Date.now() + Math.max(1, expiresIn) * 1000 });
      return {
        error: null,
        path: rawPath,
        signedURL: `/object/sign/${bucket}/${location.key.split('/').map(encodeURIComponent).join('/')}?token=${token}`,
      };
    }),
  );

  return sendJson(res, 200, results);
}

async function handleServeSigned(req, res, bucket, objectPath, searchParams) {
  const location = safeObjectPath(bucket, objectPath);
  if (!location) return storageError(res, 400, 'InvalidRequest', 'Invalid bucket or object path');

  const payload = verifyToken(searchParams.get('token'));
  if (!payload || payload.b !== bucket || payload.p !== location.key) {
    return storageError(res, 401, 'Unauthorized', 'Invalid or expired signed URL');
  }

  let stat;
  try {
    stat = await fs.stat(location.absolute);
  } catch {
    return storageError(res, 404, 'NotFound', 'Object not found');
  }

  let contentType = mimeFor(location.absolute);
  try {
    const meta = JSON.parse(await fs.readFile(`${location.absolute}.meta.json`, 'utf8'));
    if (meta.contentType) contentType = meta.contentType;
  } catch {
    /* sidecar metadata is optional */
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('ETag', `"${stat.size.toString(16)}-${Math.round(stat.mtimeMs).toString(16)}"`);

  if (searchParams.has('download')) {
    const name = searchParams.get('download') || path.basename(location.absolute);
    res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/"/g, '')}"`);
  }

  if (req.method === 'HEAD') return res.end();
  createReadStream(location.absolute).pipe(res);
}

async function handleDelete(res, bucket, objectPath) {
  const location = safeObjectPath(bucket, objectPath);
  if (!location) return storageError(res, 400, 'InvalidRequest', 'Invalid bucket or object path');
  try {
    await fs.unlink(location.absolute);
    await fs.unlink(`${location.absolute}.meta.json`).catch(() => {});
  } catch {
    return storageError(res, 404, 'NotFound', 'Object not found');
  }
  return sendJson(res, 200, { message: 'Successfully deleted' });
}

async function handleStorage(req, res, url) {
  // url.pathname starts with /storage/v1/
  const rest = url.pathname.slice('/storage/v1/'.length);
  const method = req.method || 'GET';

  if (method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (rest === 'health' || rest === 'status') return sendJson(res, 200, { ok: true });

  if (rest.startsWith('object/sign/')) {
    const remainder = rest.slice('object/sign/'.length);
    const segments = remainder.split('/');
    const bucket = segments.shift();
    if (!bucket) return storageError(res, 400, 'InvalidRequest', 'Missing bucket');
    const objectPath = segments.join('/');

    if (method === 'GET' || method === 'HEAD') {
      return handleServeSigned(req, res, bucket, objectPath, url.searchParams);
    }
    if (method === 'POST') {
      if (!objectPath) return handleSignMany(req, res, bucket);
      return handleSignOne(req, res, bucket, objectPath);
    }
    return storageError(res, 405, 'MethodNotAllowed', 'Unsupported method');
  }

  if (rest.startsWith('object/')) {
    const remainder = rest.slice('object/'.length);
    const segments = remainder.split('/');
    const bucket = segments.shift();
    const objectPath = segments.join('/');
    if (!bucket || !objectPath) return storageError(res, 400, 'InvalidRequest', 'Invalid object path');

    if (method === 'POST' || method === 'PUT') return handleUpload(req, res, bucket, objectPath);
    if (method === 'DELETE') return handleDelete(res, bucket, objectPath);
    return storageError(res, 405, 'MethodNotAllowed', 'Unsupported method');
  }

  return storageError(res, 404, 'NotFound', `Unsupported storage route: ${rest}`);
}

// ---- PostgREST proxy -------------------------------------------------------

function proxyToPostgrest(req, res, url) {
  const targetPath = url.pathname.replace(/^\/rest\/v1(?=\/|$)/, '') || '/';
  const target = `${POSTGREST_URL}${targetPath}${url.search}`;
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.connection;
  delete headers['content-length'];

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';

  fetch(target, {
    method: req.method,
    headers,
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: hasBody ? 'half' : undefined,
    redirect: 'manual',
  })
    .then(async (upstream) => {
      res.statusCode = upstream.status;
      upstream.headers.forEach((value, key) => {
        if (key.startsWith('access-control-')) return;
        res.setHeader(key, value);
      });
      cors(req, res);
      if (!upstream.body) return res.end();
      Readable.fromWeb(upstream.body).pipe(res);
    })
    .catch((error) => {
      cors(req, res);
      sendJson(res, 502, {
        code: 'LOCALGATEWAY01',
        message: `Cannot reach PostgREST at ${POSTGREST_URL}: ${error.message}`,
      });
    });
}

// ---- server ----------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  cors(req, res);

  let url;
  try {
    url = new URL(req.url || '/', `http://localhost:${PORT}`);
  } catch {
    return sendJson(res, 400, { message: 'Invalid request URL' });
  }

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true });

  try {
    if (url.pathname.startsWith('/storage/v1/')) return await handleStorage(req, res, url);
    return proxyToPostgrest(req, res, url);
  } catch (error) {
    const status = error.statusCode || 500;
    if (!res.headersSent) sendJson(res, status, { message: error.message || 'Internal error' });
    else res.end();
  }
});

async function main() {
  for (const bucket of BUCKETS) {
    await fs.mkdir(path.join(STORAGE_ROOT, bucket), { recursive: true });
  }

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[local-api] listening on http://127.0.0.1:${PORT}`);
    console.log(`[local-api] PostgREST   -> ${POSTGREST_URL}`);
    console.log(`[local-api] storage dir -> ${STORAGE_ROOT}`);
  });
}

main().catch((error) => {
  console.error('[local-api] failed to start:', error);
  process.exitCode = 1;
});
