const MAX_JSON = 2 * 1024 * 1024;
const MAX_FILE = 6 * 1024 * 1024;
export class PublicationError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const fail = (message, status) => { throw new PublicationError(message, status); };
const id = (v, label) => typeof v === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(v) ? v : fail(label + '格式不正确');
const text = (v, label, limit = 500) => typeof v === 'string' && v.trim() && v.length <= limit ? v.trim() : fail(label + '缺失或过长');
const number = (v, label) => Number.isSafeInteger(v) && v >= 0 ? v : fail(label + '必须是非负整数');
const bytes = value => new TextEncoder().encode(value);
export const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? bytes(value) : value))).map(v => v.toString(16).padStart(2, '0')).join('');
export const sourceKey = async (source, project) => (await digest(id(source, '来源编号') + '\0' + id(project, '项目编号'))).slice(0, 32);
function portable(value, depth = 0) {
  if (depth > 30) fail('进度数据嵌套过深');
  if (Array.isArray(value)) return value.map(v => portable(v, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !/^(?:storage|connection|api_key|password|authorization|access_token|refresh_token|db_path|object_key|__proto__|constructor|prototype)$/i.test(k)).map(([k,v]) => [k, portable(v, depth + 1)]));
  if (typeof value === 'string') return value.replace(/(?:[A-Za-z]:[\\/]|\\\\)[^\s"'<>，；]+/g, '[本机路径]').replace(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])[^\s"'<>]*/gi, '[本机链接]');
  return value;
}
function metadata(row) { if (!row) return null; const {snapshot_json, object_key, ...out} = row; return out; }
const latest = (db, key) => db.prepare('SELECT * FROM publications WHERE source_key=? ORDER BY revision DESC LIMIT 1').bind(key).first();
export async function listProjects(db, offset = 0) {
  number(offset, '分页位置');
  const {results} = await db.prepare('SELECT p.source_key,p.revision,p.source_id,p.project_id,p.name,p.source_version,p.source_updated_at,p.published_at,p.content_hash FROM publications p WHERE NOT EXISTS (SELECT 1 FROM publications q WHERE q.source_key=p.source_key AND q.revision>p.revision) ORDER BY p.published_at DESC,p.source_key LIMIT 100 OFFSET ?').bind(offset).all();
  return {projects: results, next_offset: results.length === 100 ? offset + 100 : null, read_only: true};
}
export async function readProject(db, key) {
  id(key, '展示编号'); const row = await latest(db, key); if (!row) fail('尚未发布此项目', 404);
  const {results} = await db.prepare('SELECT id,source_key,task_id,result_revision,title,file_name,mime_type,byte_length,sha256,created_at FROM artifacts WHERE source_key=? ORDER BY created_at DESC LIMIT 200').bind(key).all();
  return {publication: metadata(row), snapshot: JSON.parse(row.snapshot_json), artifacts: results.map(r => ({...r, url: '/api/artifacts/' + encodeURIComponent(r.id)}))};
}
export async function publishProgress(db, args) {
  const source = id(args.source_id, '来源编号'), project = id(args.project_id, '项目编号'), request = id(args.request_id, '请求编号');
  const expected = number(args.expected_publication_revision, '当前云端版本'), version = number(args.source_version, '来源版本');
  if (!args.snapshot || typeof args.snapshot !== 'object' || Array.isArray(args.snapshot) || args.snapshot.project?.id !== project) fail('快照与项目编号不一致');
  if (args.snapshot.tasks !== undefined && (!Array.isArray(args.snapshot.tasks) || args.snapshot.tasks.length > 500)) fail('每次最多发布500项任务');
  if (args.snapshot.records !== undefined && (!Array.isArray(args.snapshot.records) || args.snapshot.records.length > 500)) fail('每次最多发布500条记录');
  const name = text(args.snapshot.project.name, '项目名称', 160), stamp = Date.parse(args.source_updated_at);
  if (!Number.isFinite(stamp) || stamp > Date.now() + 300000) fail('来源更新时间无效或在未来');
  const snapshot = portable(args.snapshot); delete snapshot.publication; delete snapshot.artifacts;
  const json = JSON.stringify(snapshot); if (bytes(json).length > MAX_JSON) fail('单次进度超过2MB');
  const key = await sourceKey(source, project), hash = await digest(json), updated = new Date(stamp).toISOString();
  const existing = await db.prepare('SELECT * FROM publications WHERE request_id=?').bind(request).first();
  if (existing) { if (existing.source_key !== key || existing.content_hash !== hash || existing.source_version !== version || existing.source_updated_at !== updated) fail('请求编号已用于另一份内容', 409); return {...metadata(existing), idempotent: true}; }
  const current = await latest(db, key);
  if ((current?.revision ?? 0) !== expected) fail('云端版本已变化，请重新读取后合并', 409);
  if (current && (version < current.source_version || updated < current.source_updated_at || version === current.source_version && hash !== current.content_hash)) fail('来源内容较旧，或同一来源版本内容不一致', 409);
  const now = new Date().toISOString();
  // One atomic insert gives compare-and-set semantics and immutable publication history.
  const statement = db.prepare('INSERT INTO publications (source_key,revision,request_id,source_id,project_id,name,source_version,source_updated_at,published_at,content_hash,snapshot_json) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE COALESCE((SELECT MAX(revision) FROM publications WHERE source_key=?),0)=? RETURNING source_key,revision,source_id,project_id,name,source_version,source_updated_at,published_at,content_hash');
  let row;
  try { row = await statement.bind(key, expected + 1, request, source, project, name, version, updated, now, hash, json, key, expected).first(); }
  catch (error) { const retry = await db.prepare('SELECT * FROM publications WHERE request_id=?').bind(request).first(); if (retry?.source_key === key && retry.content_hash === hash && retry.source_version === version && retry.source_updated_at === updated) return {...metadata(retry), idempotent:true}; throw error; }
  if (!row) fail('另一个执行者刚更新了云端，请重新读取后合并', 409);
  return {...row, idempotent: false};
}
const TYPES = new Set(['image/png','image/jpeg','image/webp','image/gif','application/pdf','text/plain','text/markdown','image/svg+xml','application/zip','application/octet-stream','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
export async function publishArtifact(db, bucket, args) {
  const key = await sourceKey(args.source_id, args.project_id), fileId = id(args.request_id, '请求编号');
  if (!await latest(db,key)) fail('请先发布项目进度',404);
  const title = text(args.title,'成果标题',200), filename = text(args.file_name,'文件名',180);
  if (/[\\/\x00-\x1f]/.test(filename) || filename === '.' || filename === '..') fail('只能提供文件名');
  const mime = text(args.mime_type,'文件类型',150).toLowerCase(); if (!TYPES.has(mime)) fail('不支持此文件类型');
  if (typeof args.content_base64 !== 'string' || args.content_base64.length > Math.ceil(MAX_FILE/3)*4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(args.content_base64) || args.content_base64.length % 4) fail('文件编码无效或超过6MB');
  let data; try { data=Uint8Array.from(atob(args.content_base64),c=>c.charCodeAt(0)); } catch { fail('文件编码无效'); }
  if (!data.length || data.length > MAX_FILE) fail('文件为空或超过6MB');
  const prefix = new TextDecoder().decode(data.subarray(0,12));
  if (mime==='image/png' && ![137,80,78,71,13,10,26,10].every((v,i)=>data[i]===v) || mime==='image/jpeg' && !(data[0]===255&&data[1]===216&&data[2]===255) || mime==='image/webp' && !(prefix.startsWith('RIFF')&&prefix.slice(8,12)==='WEBP') || mime==='image/gif' && !/^GIF8[79]a/.test(prefix) || mime==='application/pdf' && !prefix.startsWith('%PDF-')) fail('文件类型与内容不一致');
  const hash=await digest(data), task=args.task_id == null ? null : id(args.task_id,'任务编号'), revision=args.result_revision == null ? null : number(args.result_revision,'成果版本');
  const same = row => row.source_key===key && row.sha256===hash && row.title===title && row.file_name===filename && row.mime_type===mime && row.task_id===task && row.result_revision===revision;
  const existing=await db.prepare('SELECT * FROM artifacts WHERE id=?').bind(fileId).first();
  if(existing) { if(!same(existing))fail('请求编号已用于另一项成果',409);return {...metadata(existing),url:'/api/artifacts/'+encodeURIComponent(fileId),idempotent:true}; }
  const objectKey='published/'+key+'/'+fileId+'-'+hash;
  await bucket.put(objectKey,data,{httpMetadata:{contentType:mime}});
  const created=new Date().toISOString();
  await db.prepare('INSERT INTO artifacts (id,source_key,task_id,result_revision,title,file_name,mime_type,byte_length,sha256,object_key,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(fileId,key,task,revision,title,filename,mime,data.length,hash,objectKey,created).run();
  const saved=await db.prepare('SELECT * FROM artifacts WHERE id=?').bind(fileId).first(); if(!saved || !same(saved))fail('成果发生并发版本冲突，请换用新的请求编号',409);
  return {...metadata(saved),url:'/api/artifacts/'+encodeURIComponent(fileId),idempotent:false};
}
export async function readArtifact(db,bucket,fileId) {
  id(fileId,'成果编号');const row=await db.prepare('SELECT * FROM artifacts WHERE id=?').bind(fileId).first();if(!row)fail('成果不存在',404);
  const object=await bucket.get(row.object_key);if(!object)fail('成果文件暂不可用',503);
  const inline = /^(?:image\/(?:png|jpeg|webp|gif)|application\/pdf)$/.test(row.mime_type);
  return new Response(object.body,{headers:{'Content-Type':row.mime_type,'Content-Length':String(row.byte_length),'Content-Disposition':(inline?'inline':'attachment')+"; filename*=UTF-8''"+encodeURIComponent(row.file_name),'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; sandbox"}});
}
