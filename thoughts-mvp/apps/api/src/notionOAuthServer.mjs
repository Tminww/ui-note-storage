import { loadDotEnv } from './env.mjs'
import { createNotionOAuthServer } from './notionOAuth.mjs'

loadDotEnv()
const port = Number(process.env.PORT || 4010)
const host = process.env.HOST || '127.0.0.1'
createNotionOAuthServer({
    clientId: process.env.NOTION_OAUTH_CLIENT_ID,
    clientSecret: process.env.NOTION_OAUTH_CLIENT_SECRET,
    redirectUri: process.env.NOTION_OAUTH_REDIRECT_URI
}).listen(port, host, () => {
    console.log(`Thoughts Notion OAuth слушает ${host}:${port}`)
})
