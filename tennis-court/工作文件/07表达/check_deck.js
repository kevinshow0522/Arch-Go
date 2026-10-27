const fs=require('fs');const D=require('path').join(__dirname,'../../成果输出/07.1_策划文本/slides/');
const IDS=['cover','toc','s01','premise','site','demand','s02','plan','court','func','metrics','s03','capex','ops','levers','next'];
for(const id of IDS){
 const h=fs.readFileSync(D+id+'.html','utf8').trim(); const e=[];
 if((h.match(/<section/g)||[]).length!==1) e.push('section count');
 if(!h.startsWith(`<section id="${id}"`)||!h.endsWith('</section>')) e.push('wrap');
 for(const bad of ['<style','margin','z-index','var(','<text','class=','rgba','<br','em;','rem;','<g ','minmax']) if(h.includes(bad)) e.push('has '+bad);
 const fsz=[...h.matchAll(/font-size:(\d+)px/g)].map(m=>+m[1]).filter(v=>v<24); if(fsz.length) e.push('small font '+fsz);
 const sizes=[...new Set([...h.matchAll(/font-size:(\d+)px/g)].map(m=>+m[1]))].sort((a,b)=>a-b);
 const els=(h.match(/<[a-z][a-z0-9-]*/g)||[]).length; if(els>=200) e.push('elements '+els);
 const svgs=[...h.matchAll(/<svg[\s\S]*?<\/svg>/g)].map(m=>Buffer.byteLength(m[0])); if(svgs.some(b=>b>=52*1024)) e.push('svg size');
 for(const m of h.matchAll(/<(p|h1|h2|h3|div|table)\s+style="([^"]*position:absolute[^"]*)"/g)) if(!/width:/.test(m[2])) e.push('abs no width');
 for(const m of h.matchAll(/<[a-z0-9]+\s[^>]*data-build-in[^>]*>/g)) if(!/position:absolute/.test(m[0])) e.push('build-in not abs');
 if(/<(rect|path|circle|polygon|line)(?![^>]*fill=)/.test(h)) e.push('shape no fill');
 console.log(id.padEnd(8),'el',String(els).padStart(3),'svgKB',svgs.map(b=>(b/1024).toFixed(1)).join('/')||'-','sizes',sizes.join(','),e.length?e:'OK');
}
