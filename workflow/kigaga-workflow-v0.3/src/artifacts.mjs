import {createHash} from 'node:crypto';
import {readFileSync,realpathSync,statSync} from 'node:fs';
import {relative,isAbsolute} from 'node:path';
export function inspectArtifact(path,roots){
 const resolved=realpathSync(path);
 const allowed=roots.some(root=>{try{const rel=relative(realpathSync(root),resolved);return rel===''||(!rel.startsWith('..')&&!isAbsolute(rel));}catch{return false;}});
 if(!allowed)throw new Error('文件不在已配置的成果目录内。');
 const st=statSync(resolved);if(!st.isFile()||st.size>100*1024*1024)throw new Error('成果必须是100 MiB以内的普通文件。');
 return {path:resolved,size_bytes:st.size,sha256:createHash('sha256').update(readFileSync(resolved)).digest('hex'),checked_at:new Date().toISOString()};
}
