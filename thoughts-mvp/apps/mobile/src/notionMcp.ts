/** Direct OAuth 2 PKCE + Streamable HTTP MCP; no Thoughts backend involved.
 *  Only read tools are exposed to the model; user writing remains via explicit Notion API actions.
 */
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { readSecret, saveSecret } from './deviceConfig';

const SERVER='https://mcp.notion.com/mcp';
const REDIRECT='thoughts://auth/notion';
const toBase64Url=(bytes:Uint8Array)=>{
  const abc='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';let out='';
  for(let i=0;i<bytes.length;i+=3){const n=(bytes[i]<<16)|((bytes[i+1]||0)<<8)|(bytes[i+2]||0);
    out+=abc[(n>>18)&63]+abc[(n>>12)&63]+(i+1<bytes.length?abc[(n>>6)&63]:'')+(i+2<bytes.length?abc[n&63]:'');}
  return out.replace(/\+/g,'-').replace(/\//g,'_');
};
export type McpCredentials={access_token:string;refresh_token?:string;expires_at?:number;token_endpoint:string;client_id:string;registration_endpoint?:string};
async function credentials():Promise<McpCredentials|null>{const value=await readSecret('mcp');if(!value)return null;try{return JSON.parse(value);}catch{return null;}}
export async function notionMcpIsConnected(){return Boolean(await credentials());}
export async function notionMcpDisconnect(){await saveSecret('mcp','');sessionId=undefined;initialized=false;}
async function discover(){
  const r=await fetch('https://mcp.notion.com/.well-known/oauth-protected-resource');
  if(!r.ok)throw new Error('Notion MCP не вернул OAuth resource metadata');
  const resource=await r.json();const origin=resource.authorization_servers?.[0];
  if(!origin||!origin.startsWith('https://'))throw new Error('Notion MCP: OAuth server отсутствует');
  const m=await fetch(new URL('/.well-known/oauth-authorization-server',origin).toString());
  if(!m.ok)throw new Error('Notion MCP OAuth discovery завершился ошибкой');
  const meta=await m.json();
  if(!meta.registration_endpoint||!meta.authorization_endpoint||!meta.token_endpoint)throw new Error('Notion MCP не поддерживает OAuth dynamic registration');
  return meta;
}
async function tokenRequest(url:string,params:Record<string,string>){
  const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params).toString()});
  const value=await res.json().catch(()=>({}));if(!res.ok||!value.access_token)throw new Error(`Авторизация Notion MCP: ${value.error_description||value.error||res.status}`);return value;
}
export async function connectNotionMcp(){
  if(Platform.OS==='web')throw new Error('OAuth MCP без серверного посредника пока поддерживается только на Android/iOS.');
  const meta=await discover();
  const reg=await fetch(meta.registration_endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'Thoughts AI Inbox',redirect_uris:[REDIRECT],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'})});
  const client=await reg.json().catch(()=>({}));
  if(!reg.ok||!client.client_id)throw new Error(`Notion не разрешил регистрацию мобильного MCP-клиента (${reg.status})`);
  const verifier=toBase64Url(Crypto.getRandomBytes(32));
  const challenge=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,verifier,{encoding:Crypto.CryptoEncoding.BASE64});
  const challengeUrl=challenge.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const state=toBase64Url(Crypto.getRandomBytes(32));
  const url=new URL(meta.authorization_endpoint);Object.entries({response_type:'code',client_id:client.client_id,redirect_uri:REDIRECT,code_challenge:challengeUrl,code_challenge_method:'S256',state}).forEach(([k,v])=>url.searchParams.set(k,v));
  const auth=await WebBrowser.openAuthSessionAsync(url.toString(),REDIRECT);
  if(auth.type!=='success')throw new Error('Вход в Notion отменён');
  const result=new URL(auth.url);if(result.searchParams.get('state')!==state)throw new Error('OAuth state не совпадает: авторизация отклонена');
  const code=result.searchParams.get('code');if(!code)throw new Error('Notion не вернул OAuth code');
  const tokens=await tokenRequest(meta.token_endpoint,{grant_type:'authorization_code',code,client_id:client.client_id,redirect_uri:REDIRECT,code_verifier:verifier});
  await saveSecret('mcp',JSON.stringify({access_token:tokens.access_token,refresh_token:tokens.refresh_token,expires_at:tokens.expires_in?Date.now()+tokens.expires_in*1000:undefined,token_endpoint:meta.token_endpoint,client_id:client.client_id}));
}
async function accessToken(){
  const c=await credentials();if(!c)throw new Error('Включи Notion MCP через OAuth в настройках.');
  if(c.expires_at&&c.expires_at<Date.now()+60000){
    if(!c.refresh_token)throw new Error('Сессия Notion MCP истекла, нужно подключиться снова');
    const tokens=await tokenRequest(c.token_endpoint,{grant_type:'refresh_token',refresh_token:c.refresh_token,client_id:c.client_id});
    const next={...c,access_token:tokens.access_token,refresh_token:tokens.refresh_token||c.refresh_token,expires_at:tokens.expires_in?Date.now()+tokens.expires_in*1000:undefined};
    await saveSecret('mcp',JSON.stringify(next));return next.access_token;
  }
  return c.access_token;
}
let sessionId:string|undefined;
let counter=0;
let initialized=false;
export async function mcpRequest(method:string,params:any={},notification=false):Promise<any>{
  const token=await accessToken();
  const msg:any={jsonrpc:'2.0',method,params};if(!notification)msg.id=++counter;
  const response=await fetch(SERVER,{method:'POST',headers:{Authorization:`Bearer ${token}`,Accept:'application/json, text/event-stream','Content-Type':'application/json',...(sessionId?{'Mcp-Session-Id':sessionId}:{})},body:JSON.stringify(msg)});
  if(!response.ok)throw new Error(`Notion MCP ${response.status}: ${String(await response.text()).slice(0,120)}`);
  const id=response.headers.get('mcp-session-id');if(id)sessionId=id;
  if(notification)return null;
  const text=await response.text();
  const messages=response.headers.get('content-type')?.includes('text/event-stream')
    ? text.split(/\r?\n\r?\n/).map(segment=>segment.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('')).filter(Boolean).map(value=>{try{return JSON.parse(value);}catch{return null;}})
    : [JSON.parse(text)];
  const result=messages.find(x=>x&&x.id===msg.id);if(!result)throw new Error('Notion MCP не вернул ответ JSON-RPC');
  if(result.error)throw new Error(`Notion MCP: ${result.error.message||'unknown'}`);
  return result.result;
}
export async function getReadOnlyNotionMcpTools(){
  if(!initialized){
    await mcpRequest('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'Thoughts',version:'0.2.0'}});
    await mcpRequest('notifications/initialized',{},true);
    initialized=true;
  }
  const result=await mcpRequest('tools/list');
  return (result.tools||[]).filter((t:any)=>/search|fetch|retrieve|list|read/i.test(t.name)&&!/delete|create|update|edit|move|append|write/i.test(t.name));
}
export async function callReadOnlyMcpTool(name:string,args:unknown){
  const allowed=await getReadOnlyNotionMcpTools();if(!allowed.some((t:any)=>t.name===name))throw new Error('Попытка небезопасного MCP tool-call отклонена');
  const result=await mcpRequest('tools/call',{name,arguments:args||{}});
  return JSON.stringify(result).slice(0,8500);
}
