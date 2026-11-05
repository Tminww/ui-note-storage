import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type StorageMode = 'server' | 'notion';
const MODE_KEY = 'thoughts:storage-mode';
const PAGE_KEY = 'thoughts:notion-root-page';
const SECRET_KEYS = { notion:'thoughts_notion_integration', notionOAuth:'thoughts_notion_api_oauth', openrouter:'thoughts_openrouter_api', mcp:'thoughts_notion_mcp_oauth' } as const;
let mode:StorageMode = 'server';
let notionRoot = '';
export type NotionOAuthTokens = {
  accessToken: string
  refreshToken: string
  workspaceName: string | null
  workspaceId: string | null
  templatePageId: string | null
}
export type NotionOAuthConnection = NotionOAuthTokens & {
  root: string
  pageTitle: string
  serviceUrl: string
}
let notionOAuth: NotionOAuthConnection | null = null;

export async function initializeDeviceConfig() {
  const [savedMode, savedPage, savedOAuth] = await Promise.all([AsyncStorage.getItem(MODE_KEY),AsyncStorage.getItem(PAGE_KEY),readNotionOAuth()]);
  mode = savedMode === 'notion' ? 'notion' : 'server';
  notionRoot = savedPage?.trim() || '';
  notionOAuth = savedOAuth;
}
export function getStorageMode() { return mode; }
export function getNotionRoot() { return notionOAuth?.root || notionRoot; }
export function getManualNotionRoot() { return notionRoot; }
export function getNotionOAuth() { return notionOAuth; }
export async function setStorageMode(next:StorageMode) {
  if (next==='notion' && Platform.OS==='web') throw new Error('Прямой режим Notion с личными ключами доступен в Android/iOS. Веб-версии нужен backend с OAuth.');
  await AsyncStorage.setItem(MODE_KEY,next); mode=next;
}
export async function setNotionRoot(value:string) {
  const match=value.trim().match(/[0-9a-f]{8}(?:-?[0-9a-f]{4}){3}-?[0-9a-f]{12}/i);
  if (!match) throw new Error('Укажи ID или ссылку на корневую страницу Notion (32 символа UUID).');
  notionRoot=match[0].replace(/-/g,'');
  await AsyncStorage.setItem(PAGE_KEY,notionRoot);
}
export type SecretName = keyof typeof SECRET_KEYS;
export async function readSecret(name:SecretName):Promise<string> {
  if (Platform.OS==='web') return '';
  return (await SecureStore.getItemAsync(SECRET_KEYS[name]))||'';
}
export async function saveSecret(name:SecretName,value:string) {
  if (Platform.OS==='web') throw new Error('Ключи запрещено хранить в небезопасном веб-хранилище.');
  if (!value.trim()) await SecureStore.deleteItemAsync(SECRET_KEYS[name]);
  else await SecureStore.setItemAsync(SECRET_KEYS[name],value.trim(),{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
}
export async function hasSecret(name:SecretName) { return Boolean(name === 'notion' && notionOAuth || await readSecret(name)); }

export async function readNotionOAuth(): Promise<NotionOAuthConnection | null> {
  const value = await readSecret('notionOAuth');
  if (!value) return null;
  try {
    const saved = JSON.parse(value);
    return saved.accessToken && saved.refreshToken && saved.root && saved.serviceUrl ? saved : null;
  } catch {
    return null;
  }
}
export async function saveNotionOAuth(connection: NotionOAuthConnection | null) {
  await saveSecret('notionOAuth', connection ? JSON.stringify(connection) : '');
  notionOAuth = connection;
}
