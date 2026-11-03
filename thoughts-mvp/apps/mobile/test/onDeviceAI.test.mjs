import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

async function ai(categoryConfidence, projectConfidence) {
    const request = async (url) =>
        new Response(
            JSON.stringify(
                String(url).includes('/decisions')
                    ? {
                          answers: {
                              category: { choice: 'idea', confidence: categoryConfidence },
                              project: { choice: 'p0', confidence: projectConfidence }
                          }
                      }
                    : {
                          choices: [
                              {
                                  message: {
                                      content: JSON.stringify({
                                          title: 'Title',
                                          summary: 'Summary',
                                          tags: []
                                      })
                                  }
                              }
                          ]
                      }
            ),
            { status: 200 }
        )
    globalThis.__aiFixture = { request }
    const source = stripTypeScriptTypes(
        readFileSync(new URL('../src/onDeviceAI.ts', import.meta.url), 'utf8')
    ).replace(/^import .*$/gm, '')
    const stub =
        'const AsyncStorage={getItem:async()=>null,setItem:async()=>{}};const readSecret=async()=>"mock";const notionMcpIsConnected=async()=>false;const fetch=globalThis.__aiFixture.request;'
    return import(
        `data:text/javascript;base64,${Buffer.from(stub + source + `\n// ${Math.random()}`).toString('base64')}`
    )
}
const settings = {
    generatorProvider: 'openrouter',
    generatorModel: 'mock',
    decisionProvider: 'openrouter',
    decisionModel: 'mock',
    confidenceThreshold: 0.7
}
const projects = [{ id: 'project', name: 'Work', description: 'Context' }]
test('low project confidence requires review instead of marking an Inbox note ready', async () => {
    const m = await ai(0.9, 0.2)
    const result = await m.enrichNote('Text', projects, null, settings)
    assert.equal(result.status, 'needs_review')
    assert.equal(result.projectId, null)
    assert.equal(result.confidence, 0.2)
})
test('category confidence participates in the threshold even for a manually locked project', async () => {
    const m = await ai(0.1, 0.99)
    const result = await m.enrichNote('Text', projects, 'project', settings)
    assert.equal(result.status, 'needs_review')
    assert.equal(result.projectId, 'project')
    assert.equal(result.confidence, 0.1)
})
test('confident classification produces a ready note in the selected project', async () => {
    const m = await ai(0.95, 0.92)
    const result = await m.enrichNote('Text', projects, null, settings)
    assert.equal(result.status, 'ready')
    assert.equal(result.projectId, 'project')
    assert.equal(result.title, 'Title')
})
