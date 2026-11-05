import { createServer } from 'node:http'
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const NOTION = 'https://api.notion.com/v1/oauth'
const RETURN_TO_APP = 'thoughts://auth/notion-storage'
const NOTION_VERSION = '2025-09-03'
const hexDigest = /^[a-f0-9]{64}$/
const hash = (value) => createHash('sha256').update(value).digest()
const failure = (status, message) => Object.assign(new Error(message), { status })

async function readJson(req) {
    if (!req.headers['content-type']?.startsWith('application/json'))
        throw failure(415, 'Ожидается JSON')
    let raw = ''
    for await (const chunk of req) {
        raw += chunk
        if (raw.length > 4096) throw failure(413, 'Запрос слишком большой')
    }
    try {
        const data = JSON.parse(raw)
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error()
        return data
    } catch {
        throw failure(400, 'Некорректный запрос')
    }
}

export function createNotionOAuthServer({ clientId, clientSecret, redirectUri, fetchFn = fetch }) {
    const callback = new URL(redirectUri)
    if (!clientId || !clientSecret || callback.protocol !== 'https:' || callback.search || callback.hash ||
        callback.username || callback.password || callback.pathname !== '/notion/oauth/callback')
        throw new Error('Укажи OAuth client ID, secret и HTTPS redirect URI /notion/oauth/callback')

    // Short-lived encrypted tickets allow multiple replicas without a shared session store.
    const key = hash(`thoughts-notion-oauth:${clientSecret}`)
    function seal(kind, data, ttlMs) {
        const iv = randomBytes(12)
        const cipher = createCipheriv('aes-256-gcm', key, iv)
        cipher.setAAD(Buffer.from(kind))
        const encrypted = Buffer.concat([cipher.update(JSON.stringify({ ...data, expires: Date.now() + ttlMs })), cipher.final()])
        return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
    }
    function open(kind, token) {
        try {
            if (typeof token !== 'string' || token.length > 4096) throw new Error()
            const packed = Buffer.from(token, 'base64url')
            if (packed.toString('base64url') !== token) throw new Error()
            const decipher = createDecipheriv('aes-256-gcm', key, packed.subarray(0, 12))
            decipher.setAAD(Buffer.from(kind))
            decipher.setAuthTag(packed.subarray(12, 28))
            const payload = JSON.parse(Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]))
            if (payload.expires < Date.now()) throw new Error()
            return payload
        } catch {
            throw failure(400, 'Сессия подключения истекла. Подключи Notion заново.')
        }
    }
    async function token(body) {
        let response
        try {
            response = await fetchFn(`${NOTION}/token`, {
                method: 'POST',
                headers: {
                    Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
                    'Content-Type': 'application/json',
                    'Notion-Version': NOTION_VERSION
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(15000)
            })
        } catch {
            throw failure(502, 'Не удалось связаться с Notion')
        }
        const data = await response.json().catch(() => ({}))
        if (!response.ok || typeof data.access_token !== 'string' || typeof data.refresh_token !== 'string')
            throw failure(data.error === 'invalid_grant' ? 401 : 502, data.error === 'invalid_grant'
                ? 'Срок подключения Notion истёк. Подключи Notion заново.'
                : 'Notion не выдал токен подключения')
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            workspaceName: data.workspace_name ?? null,
            workspaceId: data.workspace_id ?? null,
            templatePageId: data.duplicated_template_id ?? null
        }
    }
    return createServer(async (req, res) => {
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('Referrer-Policy', 'no-referrer')
        res.setHeader('X-Content-Type-Options', 'nosniff')
        const json = (status, data) => {
            res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify(data))
        }
        try {
            const url = new URL(req.url, callback.origin)
            if (req.method === 'GET' && url.pathname === '/health')
                return json(200, { ok: true })
            if (req.method === 'POST' && url.pathname === '/notion/oauth/start') {
                const { challenge } = await readJson(req)
                if (typeof challenge !== 'string' || !hexDigest.test(challenge))
                    throw failure(400, 'Некорректная сессия подключения')
                const state = seal('state', { challenge }, 10 * 60_000)
                const authorize = new URL(`${NOTION}/authorize`)
                authorize.search = new URLSearchParams({
                    client_id: clientId, redirect_uri: callback.href, response_type: 'code', owner: 'user', state
                }).toString()
                return json(200, { url: authorize.href, state })
            }
            if (req.method === 'GET' && url.pathname === callback.pathname) {
                const state = url.searchParams.get('state')
                const { challenge } = open('state', state)
                const code = url.searchParams.get('code')
                const redirect = new URL(RETURN_TO_APP)
                redirect.searchParams.set('state', state)
                if (url.searchParams.has('error')) redirect.searchParams.set('cancelled', '1')
                else {
                    if (!code || code.length > 1024) throw failure(400, 'Notion не вернул код подключения')
                    redirect.searchParams.set('ticket', seal('ticket', { code, challenge }, 2 * 60_000))
                }
                const nonce = randomBytes(16).toString('base64')
                res.writeHead(200, {
                    'Content-Type': 'text/html; charset=utf-8',
                    'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`
                })
                res.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Thoughts</title><p><a href="${redirect.href.replaceAll('&', '&amp;')}">Вернуться в Thoughts</a></p><script nonce="${nonce}">location.replace(${JSON.stringify(redirect.href)})</script></html>`)
                return
            }
            if (req.method === 'POST' && url.pathname === '/notion/oauth/exchange') {
                const { verifier, ticket } = await readJson(req)
                const { code, challenge } = open('ticket', ticket)
                if (typeof verifier !== 'string' || !hexDigest.test(verifier) ||
                    !timingSafeEqual(hash(verifier), Buffer.from(challenge, 'hex')))
                    throw failure(400, 'Сессия подключения не совпадает')
                return json(200, await token({ grant_type: 'authorization_code', code, redirect_uri: callback.href }))
            }
            if (req.method === 'POST' && url.pathname === '/notion/oauth/refresh') {
                const { refreshToken } = await readJson(req)
                if (typeof refreshToken !== 'string' || !refreshToken || refreshToken.length > 1024)
                    throw failure(400, 'Нет токена обновления Notion')
                return json(200, await token({ grant_type: 'refresh_token', refresh_token: refreshToken }))
            }
            return json(404, { error: 'Маршрут не найден' })
        } catch (error) {
            return json(error.status || 500, { error: error.status ? error.message : 'Не удалось подключить Notion' })
        }
    })
}
