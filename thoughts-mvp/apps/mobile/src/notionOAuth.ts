import * as Crypto from 'expo-crypto'
import * as WebBrowser from 'expo-web-browser'
import {
    getNotionOAuth, readNotionOAuth, saveNotionOAuth,
    type NotionOAuthConnection, type NotionOAuthTokens
} from './deviceConfig'

const redirect = 'thoughts://auth/notion-storage'
export const notionOAuthService = (process.env.EXPO_PUBLIC_NOTION_OAUTH_URL ?? '').trim().replace(/\/+$/, '')

async function oauthRequest<T>(service: string, action: string, body: object): Promise<T> {
    if (!service.startsWith('https://')) throw new Error('В этой сборке не настроен HTTPS-сервис подключения Notion')
    let response: Response
    try {
        response = await fetch(`${service}/notion/oauth/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(20000)
        })
    } catch {
        throw new Error('Не удалось связаться с сервисом подключения Notion')
    }
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'Не удалось подключить Notion')
    return data
}

export async function authorizeNotionStorage() {
    const verifier = Array.from(await Crypto.getRandomBytesAsync(32), (byte) =>
        byte.toString(16).padStart(2, '0')
    ).join('')
    const challenge = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier)
    const session = await oauthRequest<{ url: string; state: string }>(notionOAuthService, 'start', { challenge })
    const authorization = new URL(session.url)
    if (authorization.origin !== 'https://api.notion.com' || authorization.pathname !== '/v1/oauth/authorize')
        throw new Error('Некорректный адрес авторизации Notion')
    const auth = await WebBrowser.openAuthSessionAsync(authorization.href, redirect)
    if (auth.type !== 'success') return null
    const result = new URL(auth.url)
    if (result.protocol !== 'thoughts:' || result.host !== 'auth' || result.pathname !== '/notion-storage' ||
        result.searchParams.get('state') !== session.state)
        throw new Error('Сессия подключения не совпадает')
    if (result.searchParams.has('cancelled')) return null
    const ticket = result.searchParams.get('ticket')
    if (!ticket) throw new Error('Notion не вернул подтверждение подключения')
    const tokens = await oauthRequest<NotionOAuthTokens>(notionOAuthService, 'exchange', { verifier, ticket })
    if (!tokens.accessToken || !tokens.refreshToken) throw new Error('Notion не выдал токены подключения')
    return { ...tokens, serviceUrl: notionOAuthService }
}

let refreshing: { connection: NotionOAuthConnection; promise: Promise<string> } | undefined
export async function refreshNotionStorage(connection: NotionOAuthConnection) {
    const current = getNotionOAuth()
    if (!current || current.root !== connection.root || current.serviceUrl !== connection.serviceUrl ||
        current.workspaceId !== connection.workspaceId) throw new Error('Подключение Notion изменилось')
    if (current.accessToken !== connection.accessToken) return current.accessToken
    if (refreshing?.connection === current) return refreshing.promise
    const promise = (async () => {
        const latest = await readNotionOAuth()
        if (!latest || latest.root !== current.root || latest.serviceUrl !== current.serviceUrl ||
            latest.workspaceId !== current.workspaceId) throw new Error('Подключение Notion изменилось')
        if (latest.accessToken !== connection.accessToken) {
            if (getNotionOAuth() !== current) throw new Error('Подключение Notion изменилось')
            await saveNotionOAuth(latest)
            return latest.accessToken
        }
        const tokens = await oauthRequest<NotionOAuthTokens>(current.serviceUrl, 'refresh', {
            refreshToken: latest.refreshToken
        })
        if (!tokens.accessToken || !tokens.refreshToken || getNotionOAuth() !== current)
            throw new Error('Подключение Notion изменилось')
        await saveNotionOAuth({ ...latest, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken })
        return tokens.accessToken
    })().finally(() => {
        if (refreshing?.promise === promise) refreshing = undefined
    })
    refreshing = { connection: current, promise }
    return promise
}
