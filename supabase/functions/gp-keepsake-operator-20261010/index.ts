// One-photo, expiring operator for an owner-requested Tripo keepsake.
// No World Labs calls. Provider credentials remain in project secrets.
const AUTH_HASH = 'd795986deb7f3d7dbe998902197477a77f6aec5cc06f061b5e842fb841162f67';
const IMAGE_HASH = '56568aeaefc8fd91660e2ac4ab53d2247fe3dd708caa0e49a7900f9c9a95911b';
const EXPIRES = 1791647528956;
const PREFIX = 'operator-mother-birthday-20261010';
const BASE = 'https://openapi.tripo3d.ai/v3';
const MAX_IMAGE = 6 * 1024 * 1024;
const hash = async (v: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', v))].map(x => x.toString(16).padStart(2, '0')).join('');
const encode = (v: string) => new TextEncoder().encode(v);
function fail(code: string, status = 400): never { throw { code, status }; }
function response(v: unknown, status = 200) { return Response.json(v, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } }); }
function key() { return Deno.env.get('GP_V11_TRIPO_API_KEY') || Deno.env.get('TRIPO_API_KEY') || ''; }
function storeConfig() {
  const url = Deno.env.get('SUPABASE_URL'), secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !secret) fail('STORAGE_NOT_CONFIGURED', 503);
  return { url, headers: { apikey: secret, Authorization: `Bearer ${secret}` } };
}
async function storage(path: string, method = 'GET', body?: Uint8Array, mime = 'application/json', upsert = false) {
  const c = storeConfig();
  return fetch(`${c.url}/storage/v1/object/gp-instant-generated/${PREFIX}/${path}`, {
    method, headers: { ...c.headers, 'Content-Type': mime === 'application/json' ? 'application/octet-stream' : mime, 'x-upsert': String(upsert) }, body,
    redirect: 'error', signal: AbortSignal.timeout(25000),
  });
}
async function state(): Promise<Record<string, any> | null> {
  const r = await storage('state.json');
  if (!r.ok) { if ([400,404].includes(r.status)) return null; fail('STORAGE_READ_FAILED', 502); }
  return r.json();
}
async function save(v: Record<string, any>) {
  const r = await storage('state.json', 'POST', encode(JSON.stringify(v)), 'application/json', true);
  if (!r.ok) fail('STATE_WRITE_FAILED', 502);
}
async function provider(path: string, method = 'GET', body?: unknown) {
  if (!key()) fail('TRIPO_NOT_CONFIGURED', 503);
  let r: Response;
  try { r = await fetch(BASE + path, { method, headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(25000) }); }
  catch { fail(method === 'POST' ? 'SUBMISSION_AMBIGUOUS' : 'PROVIDER_NETWORK', 502); }
  const v = await r.json();
  if (!r.ok || v.code !== 0 || !v.data) fail('PROVIDER_REQUEST_REJECTED', 502);
  return v.data;
}
async function submit(req: Request) {
  if (req.headers.get('content-type') !== 'image/png') fail('INVALID_IMAGE');
  const declared = Number(req.headers.get('content-length'));
  if (declared > MAX_IMAGE) fail('IMAGE_TOO_LARGE', 413);
  const reader = req.body?.getReader(); if (!reader) fail('INVALID_IMAGE');
  const chunks: Uint8Array[] = []; let total = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > MAX_IMAGE) { await reader.cancel(); fail('IMAGE_TOO_LARGE', 413); } chunks.push(value); }
  const bytes = new Uint8Array(total); let cursor = 0; for (const chunk of chunks) { bytes.set(chunk, cursor); cursor += chunk.length; }
  if (await hash(bytes) !== IMAGE_HASH) fail('PHOTO_NOT_AUTHORIZED', 403);
  const old = await state();
  if (old) return response({ ok: true, deduplicated: true, state: old });
  const balance = await provider('/account/balance');
  if (Number(balance.balance) - Number(balance.frozen || 0) < 100) fail('INSUFFICIENT_CREDITS', 403);
  // Atomic exclusive storage insertion prevents a second paid submission.
  const lock = await storage('submission-lock.json', 'POST', encode(JSON.stringify({ imageHash: IMAGE_HASH, createdAt: new Date().toISOString() })), 'application/json', false);
  if (!lock.ok) fail('SUBMISSION_LOCKED_CHECK_STATUS', 409);
  await save({ status: 'preparing', imageHash: IMAGE_HASH });
  const input = await storage('photo.png', 'POST', bytes, 'image/png', false);
  if (!input.ok) fail('IMAGE_STORAGE_FAILED', 502);
  const form = new FormData(); form.append('file', new Blob([bytes], { type: 'image/png' }), 'mother-birthday.png');
  const upload = await fetch(BASE + '/files', { method: 'POST', headers: { Authorization: `Bearer ${key()}` }, body: form, redirect: 'error', signal: AbortSignal.timeout(25000) });
  const uploaded = await upload.json();
  if (!upload.ok || uploaded.code !== 0 || !/^[A-Za-z0-9_-]{1,120}$/.test(uploaded.data?.file_token || '')) fail('TRIPO_UPLOAD_FAILED', 502);
  await save({ status: 'submitting', imageHash: IMAGE_HASH, createdAt: new Date().toISOString() });
  const task = await provider('/generation/image-to-model', 'POST', {
    input: uploaded.data.file_token, model: 'v3.1-20260211', face_limit: 30000,
    texture: true, pbr: true, texture_quality: 'detailed', geometry_quality: 'detailed', orientation: 'align_image',
  });
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(task.task_id || '')) fail('SUBMISSION_AMBIGUOUS', 502);
  const record = { status: 'processing', taskId: task.task_id, imageHash: IMAGE_HASH, createdAt: new Date().toISOString(), worldRequested: false };
  await save(record);
  return response({ ok: true, state: record });
}
async function taskStatus() {
  const current = await state();
  if (!current?.taskId) return response({ ok: true, state: current });
  if (current.status === 'success' && current.modelStored) return response({ ok: true, state: current });
  const task = await provider('/tasks/' + encodeURIComponent(current.taskId));
  if (task.task_id !== current.taskId) fail('TASK_MISMATCH', 502);
  const record = { ...current, status: task.status, progress: task.progress, creditsConsumed: task.credits_consumed };
  if (task.status === 'success') {
    const u = new URL(task.output?.model_url || '');
    const allow = ['tripo3d.ai', 'tripo3d.com'];
    if (u.protocol !== 'https:' || u.username || u.password || !allow.some(d => u.hostname === d || u.hostname.endsWith('.' + d))) fail('MODEL_ORIGIN_INVALID', 502);
    const r = await fetch(u, { redirect: 'error', signal: AbortSignal.timeout(40000) });
    if (!r.ok || Number(r.headers.get('content-length')) > 64 * 1024 * 1024) fail('MODEL_DOWNLOAD_FAILED', 502);
    const data = new Uint8Array(await r.arrayBuffer());
    if (data.length < 12 || data.length > 64 * 1024 * 1024) fail('MODEL_INVALID', 502);
    const view = new DataView(data.buffer);
    if (new TextDecoder().decode(data.slice(0,4)) !== 'glTF' || view.getUint32(4,true) !== 2 || view.getUint32(8,true) !== data.length) fail('MODEL_INVALID', 502);
    const put = await storage('mother-birthday.glb', 'POST', data, 'model/gltf-binary', true);
    if (!put.ok) fail('MODEL_STORE_FAILED', 502);
    Object.assign(record, { modelStored: true, modelBytes: data.length, modelHash: await hash(data) });
  }
  await save(record);
  return response({ ok: true, state: record });
}
Deno.serve(async (req: Request) => {
  try {
    // The platform also verifies Authorization as a Supabase JWT.
    const token = req.headers.get('X-Operator-Token') || '';
    if (Date.now() >= EXPIRES || !/^[A-Za-z0-9_-]{43}$/.test(token) || await hash(encode(token)) !== AUTH_HASH) fail('UNAUTHORIZED', 401);
    const action = new URL(req.url).searchParams.get('action') || 'status';
    if (action === 'status' && req.method === 'GET') {
      const configured = Boolean(key());
      const balance = configured ? await provider('/account/balance') : null;
      return response({ ok: true, configured, worldRequested: false, balance: balance ? { available: Number(balance.balance) - Number(balance.frozen || 0), frozen: balance.frozen } : null, state: await state() });
    }
    if (action === 'submit' && req.method === 'POST') return await submit(req);
    if (action === 'task' && req.method === 'GET') return await taskStatus();
    if (action === 'model' && req.method === 'GET') {
      const current = await state(); if (!current?.modelStored) fail('MODEL_NOT_READY', 409);
      const r = await storage('mother-birthday.glb'); if (!r.ok) fail('MODEL_READ_FAILED', 502);
      return new Response(r.body, { headers: { 'Content-Type': 'model/gltf-binary', 'Content-Disposition': 'attachment; filename="Lembranca_Mae_Aniversario.glb"', 'Cache-Control': 'no-store' } });
    }
    fail('METHOD_NOT_ALLOWED', 405);
  } catch (e) { const error = e as { code?: string; status?: number }; return response({ ok: false, error: { code: error.code || 'OPERATOR_FAILED' } }, error.status || 500); }
});
