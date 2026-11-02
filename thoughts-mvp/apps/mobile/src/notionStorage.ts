/** Serverless Notion storage: notes and projects are real Notion pages, not a fake local cache.
 *  Personal integration token must only be used on Android/iOS with SecureStore.
 *  Notes are child pages under the selected root page (Inbox) or under project pages.
 *  Metadata lives in the first paragraph block. All audio remains on device.
 */
import type { Project, Thought, Settings, AIConfig } from './api';
import { getNotionRoot, readSecret } from './deviceConfig';
import { enrichNote, localSettings, saveLocalSettings } from './onDeviceAI';

const BASE='https://api.notion.com/v1';
const VERSION='2025-09-03';
const PREFIX_PROJECT='📁 ';
const PREFIX_THOUGHT='💭 ';
const META_PREFIX='THOUGHTS_V1:';
const now=()=>new Date().toISOString();
const rich=(text:string)=>Array.from({length:Math.ceil(text.length/1800)},(_,i)=>({type:'text',text:{content:text.slice(i*1800,(i+1)*1800)}}));
const paragraph=(text:string)=>({object:'block',type:'paragraph',paragraph:{rich_text:rich(text)}});
const pageTitle=(s:string)=>[{type:'text',text:{content:s.slice(0,140)}}];

async function notion<T=any>(path:string, method='GET', body?:unknown):Promise<T> {
  const token=await readSecret('notion');
  if (!token) throw new Error('В настройках добавь токен Notion (можно вставить из Bitwarden).');
  let response=await fetch(`${BASE}${path}`,{
    method,headers:{Authorization:`Bearer ${token}`,'Notion-Version':VERSION,'Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  if(response.status===429){
    const delay=Math.min(5000,Math.max(1000,Number(response.headers.get('retry-after')||1)*1000));
    await new Promise(resolve=>setTimeout(resolve,delay));
    response=await fetch(`${BASE}${path}`,{method,headers:{Authorization:`Bearer ${token}`,'Notion-Version':VERSION,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  }
  const data=await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(`Notion ${response.status}: ${String(data.message||data.code||'Не удалось выполнить запрос').slice(0,180)}`);
  return data as T;
}
function root() {const id=getNotionRoot();if(!id)throw new Error('В настройках укажи страницу Notion для хранения мыслей.');return id;}
function title(block:any):string { return block?.child_page?.title||''; }
async function children(id:string):Promise<any[]> {
  let cursor:string|undefined;const result:any[]=[];
  do {
    const url=`/blocks/${id}/children?page_size=100${cursor?`&start_cursor=${encodeURIComponent(cursor)}`:''}`;
    const chunk:any=await notion(url);result.push(...chunk.results);cursor=chunk.has_more?chunk.next_cursor:undefined;
    if(result.length>=1000)break;
  } while(cursor);
  return result;
}
async function getPageBlocks(id:string){return children(id);}
function parseMeta<T>(blocks:any[]):T|undefined {
  const parts=blocks.filter(b=>b.type==='paragraph').map(b=>(b?.paragraph?.rich_text||[]).map((x:any)=>x.plain_text??x.text?.content??'').join(''));
  const value=parts.find(v=>v.startsWith(META_PREFIX));
  if(!value)return undefined;
  try{const meta=JSON.parse(value.slice(META_PREFIX.length));return {...meta,rawText:parts.filter(x=>x!==value).join('')} as T;}catch{return undefined;}
}
async function createChild(parent:string,name:string,meta:object,raw?:string):Promise<any>{
  const childBlocks:any[]=[paragraph(META_PREFIX+JSON.stringify(meta))];
  if(raw) for(let i=0;i<raw.length;i+=1800) childBlocks.push(paragraph(raw.slice(i,i+1800)));
  return notion('/pages','POST',{
    parent:{type:'page_id',page_id:parent},
    properties:{title:{type:'title',title:pageTitle(name)}},
    children:childBlocks
  });
}
async function updateMetadata(pageId:string,meta:object,raw?:string){
  const blocks=await getPageBlocks(pageId);
  const content=blocks.filter(b=>b.type==='paragraph');
  // Append the new metadata first to ensure a failed write never destroys the original data.
  const chunks=[paragraph(META_PREFIX+JSON.stringify(meta))];
  if(raw)for(let i=0;i<raw.length;i+=1800)chunks.push(paragraph(raw.slice(i,i+1800)));
  await notion(`/blocks/${pageId}/children`,'PATCH',{children:chunks});
  // Remove old paragraph blocks, leaving any user-authored other Notion content untouched.
  await Promise.all(content.map(b=>notion(`/blocks/${b.id}`,'DELETE')));
}
async function renamePage(id:string,name:string){await notion(`/pages/${id}`,'PATCH',{properties:{title:{type:'title',title:pageTitle(name)}}});}
async function archivePage(id:string){await notion(`/pages/${id}`,'PATCH',{archived:true});}

export async function getProjects():Promise<Project[]> {
  const top=await children(root());
  const rows=top.filter(b=>b.type==='child_page'&&title(b).startsWith(PREFIX_PROJECT));
  const result=await Promise.all(rows.map(async b=>{
    const meta=parseMeta<Partial<Project>>(await getPageBlocks(b.id));
    return {id:b.id,name:meta?.name||title(b).slice(PREFIX_PROJECT.length),description:meta?.description||'',color:meta?.color||'#6259E8',createdAt:b.created_time||now(),updatedAt:b.last_edited_time||now(),thoughtCount:0};
  }));
  return result;
}
export async function createProject(body:{name:string;description:string;color:string}):Promise<Project> {
  const meta={kind:'project',...body};const p=await createChild(root(),PREFIX_PROJECT+body.name,meta);
  return {id:p.id,...body,createdAt:p.created_time,updatedAt:p.last_edited_time,thoughtCount:0};
}
export async function updateProject(id:string,body:Partial<Project>):Promise<Project> {
  const old=(await getProjects()).find(p=>p.id===id);if(!old)throw new Error('Проект не найден');
  const next={...old,...body};if(body.name)await renamePage(id,PREFIX_PROJECT+next.name);
  await updateMetadata(id,{kind:'project',name:next.name,description:next.description,color:next.color});return next;
}
export async function deleteProject(id:string){
  // Do not archive a project with notes: it would hide all of its children.
  const notes=(await children(id)).filter(b=>b.type==='child_page'&&title(b).startsWith(PREFIX_THOUGHT));
  if(notes.length)throw new Error('Сначала перенеси или удали заметки проекта в Notion.');
  await archivePage(id);return {ok:true};
}
function thoughtFrom(b:any,meta:Partial<Thought>):Thought {
  return {
    id:b.id,rawText:meta.rawText||'',title:meta.title||title(b).slice(PREFIX_THOUGHT.length),summary:meta.summary||'',
    tags:meta.tags||[],projectId:meta.projectId||null,projectLocked:meta.projectLocked??false,
    category:meta.category||'note',status:meta.status||'pending',confidence:meta.confidence??null,
    errorMessage:meta.errorMessage||null,generatorModel:meta.generatorModel||null,decisionModel:meta.decisionModel||null,
    createdAt:meta.createdAt||b.created_time||now(),updatedAt:meta.updatedAt||b.last_edited_time||now()
  };
}
async function inFolder(id:string):Promise<Thought[]> {
  const blocks=await children(id);const notes=blocks.filter(b=>b.type==='child_page'&&title(b).startsWith(PREFIX_THOUGHT));
  return Promise.all(notes.map(async b=>thoughtFrom(b,parseMeta<Partial<Thought>>(await getPageBlocks(b.id))||{})));
}
export async function getThoughts():Promise<Thought[]> {
  const ps=await getProjects();const folders=[root(),...ps.map(p=>p.id)];
  const all=(await Promise.all(folders.map(inFolder))).flat();
  return all.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
async function putThought(t:Thought){
  const {id,rawText,...meta}=t;
  await renamePage(id,PREFIX_THOUGHT+t.title);
  await updateMetadata(id,{kind:'thought',...meta},t.rawText);
  return t;
}
export async function createThought(rawText:string,projectId:string|null):Promise<Thought> {
  const time=now();const initial:Thought={id:'',rawText,title:rawText.slice(0,75),summary:'',tags:[],projectId,projectLocked:Boolean(projectId),category:'note',status:'pending',confidence:null,errorMessage:null,generatorModel:null,decisionModel:null,createdAt:time,updatedAt:time};
  // Persist raw text before any external AI call; a failed model does not lose it.
  const {rawText:_raw,...meta}=initial;const page=await createChild(projectId||root(),PREFIX_THOUGHT+initial.title,{kind:'thought',...meta},rawText);
  const persisted={...initial,id:page.id};
  try{return await processThought(persisted.id,persisted);}catch(e){return putThought({...persisted,status:'needs_review',errorMessage:String((e as Error).message).slice(0,250)});}
}
export async function processThought(id:string,existing?:Thought){
  const current=existing||(await getThoughts()).find(t=>t.id===id);
  if(!current)throw new Error('Заметка не найдена');
  const projects=await getProjects();const settings=await localSettings();
  const enriched=await enrichNote(current.rawText,projects,current.projectLocked?current.projectId:null,settings);
  const newParent=enriched.projectId||root();const oldParent=current.projectId||root();
  if(newParent!==oldParent){
    // Move API retains the note page identity and keeps Notion hierarchy in sync.
    await notion(`/pages/${id}/move`,'POST',{parent:{type:'page_id',page_id:newParent}});
  }
  return putThought({...current,...enriched,id,updatedAt:now()});
}
export async function updateThought(id:string,updates:Partial<Thought>):Promise<Thought> {
  const old=(await getThoughts()).find(t=>t.id===id);if(!old)throw new Error('Заметка не найдена');
  const newParent=updates.projectId===undefined?old.projectId:updates.projectId;
  if(newParent!==old.projectId)await notion(`/pages/${id}/move`,'POST',{parent:{type:'page_id',page_id:newParent||root()}});
  return putThought({...old,...updates,id,updatedAt:now()});
}
export async function deleteThought(id:string){await archivePage(id);return {ok:true};}
export const notionStorage={projects:getProjects,createProject,updateProject,deleteProject,thoughts:getThoughts,createThought,processThought,updateThought,deleteThought,
  settings:localSettings, saveSettings:saveLocalSettings,
  config:async():Promise<AIConfig>=>({generators:[{id:'openrouter',label:'OpenRouter (ключ на телефоне)',configured:Boolean(await readSecret('openrouter'))}],decisions:[{id:'openrouter',label:'Jev / OpenRouter',configured:Boolean(await readSecret('openrouter'))},{id:'disabled',label:'Без Jev',configured:true}]})
};
