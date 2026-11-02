import http from 'node:http';
import { createRepository } from './storage/index.mjs';
import { createAI, getAIOptions } from './ai/providers.mjs';
import { createPipeline } from './ai/pipeline.mjs';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const requiredString = (value, max, name) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new HttpError(400, `${name}: нужно от 1 до ${max} символов`);
  return value.trim();
};
const optionalString = (value, max, name) => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > max) throw new HttpError(400, `${name}: некорректное значение`);
  return value.trim();
};
function verifyProject(repo, id) {
  if (id !== null && !repo.getProject(id)) throw new HttpError(400, 'Проект не найден');
}
function validateSettings(input) {
  const patch = {};
  const allowed = ['generatorProvider', 'generatorModel', 'decisionProvider', 'decisionModel'];
  for (const name of allowed) if (input[name] !== undefined) patch[name] = requiredString(input[name], 160, name);
  if (patch.generatorProvider && !['openrouter','openai','deepseek','custom'].includes(patch.generatorProvider)) throw new HttpError(400, 'Неизвестный LLM-провайдер');
  if (patch.decisionProvider && !['openrouter','custom','disabled'].includes(patch.decisionProvider)) throw new HttpError(400, 'Неизвестный Jev-провайдер');
  if (input.confidenceThreshold !== undefined) {
    if (typeof input.confidenceThreshold !== 'number' || !Number.isFinite(input.confidenceThreshold) || input.confidenceThreshold < 0 || input.confidenceThreshold > 1) throw new HttpError(400, 'confidenceThreshold должен быть в диапазоне 0..1');
    patch.confidenceThreshold = input.confidenceThreshold;
  }
  return patch;
}
async function parseBody(req) {
  // The API accepts JSON text only: never accept voice recordings or binary uploads.
  if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'Принимается только application/json. Аудио не отправляется на сервер.');
  }
  let raw = '';
  for await (const chunk of req) {
    raw += chunk.toString('utf8');
    if (raw.length > 60000) throw new HttpError(413, 'Запрос слишком большой');
  }
  try { return raw ? JSON.parse(raw) : {}; }
  catch { throw new HttpError(400, 'Некорректный JSON'); }
}
function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

export function createApp({ repository, ai, env = process.env } = {}) {
  const repo = repository || createRepository({driver: env.STORAGE_DRIVER || 'sqlite', databasePath: env.DB_PATH || './data/thoughts.sqlite'});
  const processor = createPipeline({ repository: repo, ai: ai || createAI({ env }) });
  const allowedOrigins = (env.CORS_ORIGINS || 'http://localhost:8081,http://localhost:19006,http://127.0.0.1:8081').split(',').map(x => x.trim());
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const url = new URL(req.url || '/', 'http://localhost');
    const path = url.pathname;
    try {
      if (req.method === 'GET' && path === '/api/health') return send(res, 200, {ok:true, storage:env.STORAGE_DRIVER || 'sqlite'});
      if (req.method === 'GET' && path === '/api/config') return send(res, 200, getAIOptions(env));
      if (req.method === 'GET' && path === '/api/export') return send(res, 200, repo.exportSnapshot());
      if (req.method === 'GET' && path === '/api/settings') return send(res, 200, repo.getSettings());
      if (req.method === 'PATCH' && path === '/api/settings') return send(res, 200, repo.updateSettings(validateSettings(await parseBody(req))));
      if (req.method === 'GET' && path === '/api/projects') return send(res, 200, repo.listProjects());
      if (req.method === 'POST' && path === '/api/projects') {
        const data = await parseBody(req);
        return send(res, 201, repo.createProject({
          name: requiredString(data.name, 80, 'Название проекта'),
          description: optionalString(data.description, 400, 'Описание') || '',
          color: /^#[0-9a-fA-F]{6}$/.test(data.color || '') ? data.color : '#5C75E8'
        }));
      }
      const projectMatch = path.match(/^\/api\/projects\/([a-f0-9-]+)$/i);
      if (projectMatch && req.method === 'PATCH') {
        const data = await parseBody(req), patch = {};
        if ('name' in data) patch.name = requiredString(data.name, 80, 'Название');
        if ('description' in data) patch.description = optionalString(data.description, 400, 'Описание');
        if ('color' in data) {
          if (typeof data.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(data.color)) throw new HttpError(400, 'Неверный цвет');
          patch.color = data.color;
        }
        const result = repo.updateProject(projectMatch[1], patch);
        if (!result) throw new HttpError(404, 'Проект не найден');
        return send(res, 200, result);
      }
      if (projectMatch && req.method === 'DELETE') {
        if (!repo.deleteProject(projectMatch[1])) throw new HttpError(404, 'Проект не найден');
        return send(res, 200, {ok:true});
      }
      if (req.method === 'GET' && path === '/api/thoughts') {
        return send(res, 200, repo.listThoughts({
          q: (url.searchParams.get('q') || '').slice(0, 120),
          projectId: url.searchParams.get('projectId') || undefined,
          status: url.searchParams.get('status') || undefined,
          category: url.searchParams.get('category') || undefined
        }));
      }
      if (req.method === 'POST' && path === '/api/thoughts') {
        const data = await parseBody(req);
        if (['audio','audioBase64','audioData','recording','file'].some(k => Object.hasOwn(data,k))) {
          throw new HttpError(400, 'Аудио не поддерживается: отправь только распознанный текст.');
        }
        const rawText = requiredString(data.rawText, 10000, 'Мысль');
        const projectId = data.projectId || null;
        if (typeof projectId !== 'string' && projectId !== null) throw new HttpError(400, 'projectId должен быть строкой или null');
        verifyProject(repo, projectId);
        const result = repo.createThought({rawText,projectId});
        // The row is persisted BEFORE any network request; errors do not erase it.
        const processed = data.process === false ? result : await processor(result.id);
        return send(res, 201, processed);
      }
      const thoughtMatch = path.match(/^\/api\/thoughts\/([a-f0-9-]+)$/i);
      const reprocessMatch = path.match(/^\/api\/thoughts\/([a-f0-9-]+)\/process$/i);
      if (reprocessMatch && req.method === 'POST') {
        if (!repo.getThought(reprocessMatch[1])) throw new HttpError(404, 'Мысль не найдена');
        return send(res, 200, await processor(reprocessMatch[1]));
      }
      if (thoughtMatch && req.method === 'GET') {
        const result = repo.getThought(thoughtMatch[1]);
        if (!result) throw new HttpError(404, 'Мысль не найдена');
        return send(res, 200, result);
      }
      if (thoughtMatch && req.method === 'PATCH') {
        const data = await parseBody(req), patch = {};
        if ('rawText' in data) {
          patch.rawText = requiredString(data.rawText, 10000, 'Мысль');
          patch.status = 'pending';
        }
        if ('title' in data) patch.title = requiredString(data.title, 140, 'Название');
        if ('summary' in data) patch.summary = optionalString(data.summary, 800, 'Краткое описание');
        if ('projectId' in data) {
          if (typeof data.projectId !== 'string' && data.projectId !== null) throw new HttpError(400, 'projectId должен быть строкой или null');
          verifyProject(repo, data.projectId);
          patch.projectId = data.projectId;
          patch.projectLocked = Boolean(data.projectId);
        }
        if ('category' in data) {
          if (!['idea','task','bug','research','note'].includes(data.category)) throw new HttpError(400, 'Некорректная категория');
          patch.category = data.category;
        }
        if ('status' in data) {
          if (!['pending','ready','needs_review'].includes(data.status)) throw new HttpError(400, 'Некорректный статус');
          patch.status = data.status;
        }
        const result = repo.updateThought(thoughtMatch[1], patch);
        if (!result) throw new HttpError(404, 'Мысль не найдена');
        return send(res, 200, result);
      }
      if (thoughtMatch && req.method === 'DELETE') {
        if (!repo.deleteThought(thoughtMatch[1])) throw new HttpError(404, 'Мысль не найдена');
        return send(res, 200, {ok:true});
      }
      throw new HttpError(404, 'Endpoint не найден');
    } catch (error) {
      const status = error.status || 500;
      if (status === 500) console.error('[API]', error);
      if (!res.headersSent) send(res, status, {error: status === 500 ? 'Внутренняя ошибка сервера' : error.message});
    }
  });
  return { server, repository: repo, close: () => new Promise(resolve => server.close(() => {repo.close(); resolve();})) };
}
