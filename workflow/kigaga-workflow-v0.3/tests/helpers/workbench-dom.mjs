import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {workbench118Fixture} from '../fixtures/workbench-118.mjs';
export function mount(t,snapshot=workbench118Fixture(),saved={}){
 const dom=new JSDOM(readFileSync(new URL('../../assets/workbench.html',import.meta.url)),{url:'https://workbench.invalid/',runScripts:'outside-only',pretendToBeVisual:true});
 t.after(()=>dom.window.close());const w=dom.window;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.structuredClone=structuredClone;w.scrollTo=()=>{};
 for(const [key,value] of Object.entries(saved))w.localStorage.setItem(key,value);
 w.__KIGAGA_SNAPSHOT__=structuredClone(snapshot);w.openai={toolResponseMetadata:{workbench:snapshot},callTool:async()=>({_meta:{workbench:snapshot}})};
 for(const script of w.document.querySelectorAll('script'))if(!script.src)w.eval(script.textContent);
 return w;
}
export const view=(w,name)=>w.document.querySelector('[data-act="view"][data-v="'+name+'"]').click();
export function present(w,id='03.4'){
 view(w,'present');
 const toggle=w.document.querySelector('[data-act="p-open"][data-ch="project-2"]');
 if(toggle?.getAttribute('aria-expanded')!=='true')toggle.click();
 w.document.querySelector('[data-act="p-pick"][data-id="'+id+'"]').click();
}
