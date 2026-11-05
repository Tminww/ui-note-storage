import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { createNotionOAuthServer } from '../src/notionOAuth.mjs'

test('OAuth uses a sealed, client-bound handoff and supports token rotation', async () => {
    const redirectUri = 'https://auth.example.com/notion/oauth/callback'
    const calls = []
    const server = createNotionOAuthServer({
        clientId: 'client', clientSecret: 'secret', redirectUri,
        fetchFn: async (url, options) => {
            assert.equal(url, 'https://api.notion.com/v1/oauth/token')
            assert.equal(options.headers.Authorization, 'Basic ' + Buffer.from('client:secret').toString('base64'))
            calls.push(JSON.parse(options.body))
            return Response.json({
                access_token: 'access-token', refresh_token: 'rotated-token',
                workspace_name: 'Workspace', workspace_id: 'workspace', duplicated_template_id: 'page'
            })
        }
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const base = 'http://127.0.0.1:' + server.address().port
    const post = (path, body) => fetch(base + '/notion/oauth/' + path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    })
    try {
        const verifier = 'a'.repeat(64)
        const challenge = createHash('sha256').update(verifier).digest('hex')
        const session = await (await post('start', { challenge })).json()
        const authorize = new URL(session.url)
        assert.equal(authorize.searchParams.get('state'), session.state)
        assert.equal(authorize.searchParams.get('redirect_uri'), redirectUri)
        assert.equal((await fetch(base + '/notion/oauth/callback?state=fake&code=code')).status, 400)
        const cancelled = await fetch(base + '/notion/oauth/callback?' + new URLSearchParams({
            state: session.state, error: 'access_denied'
        }))
        assert.match(await cancelled.text(), /cancelled=1/)
        const response = await fetch(base + '/notion/oauth/callback?' + new URLSearchParams({
            state: session.state, code: 'notion-authorization-code'
        }))
        const html = await response.text()
        assert.equal(response.headers.get('cache-control'), 'no-store')
        assert.doesNotMatch(html, /notion-authorization-code|access-token|rotated-token/)
        const deepLink = new URL(html.match(/href="([^"]+)"/)[1].replaceAll('&amp;', '&'))
        const ticket = deepLink.searchParams.get('ticket')
        assert.equal(deepLink.searchParams.get('state'), session.state)
        assert.equal((await post('exchange', { verifier: 'b'.repeat(64), ticket })).status, 400)
        assert.equal(calls.length, 0)
        const valid = await (await post('exchange', { verifier, ticket })).json()
        assert.equal(valid.templatePageId, 'page')
        assert.equal(valid.accessToken, 'access-token')
        assert.deepEqual(calls[0], { grant_type: 'authorization_code', code: 'notion-authorization-code', redirect_uri: redirectUri })
        assert.equal((await post('refresh', { refreshToken: 'rotated-token' })).status, 200)
        assert.deepEqual(calls[1], { grant_type: 'refresh_token', refresh_token: 'rotated-token' })
    } finally {
        await new Promise((resolve) => server.close(resolve))
    }
})
