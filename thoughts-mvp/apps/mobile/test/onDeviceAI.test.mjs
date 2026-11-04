import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { allTypes, namedSuggestion } from '../src/taxonomy.ts'

async function ai(categoryConfidence, projectConfidence, usage, fixture = {}) {
    const request = async (url, init) => {
        const body = JSON.parse(init.body)
        fixture.calls?.push({ url, body })
        if (String(url).includes('/decisions') && fixture.decisionError) throw new Error('Jev unavailable')
        const suggestion = body.messages?.[0]?.content.includes('Jev не смог')
        return new Response(
            JSON.stringify(
                String(url).includes('/decisions')
                    ? {
                          answers: {
                              category: { choice: fixture.categoryChoice || 'idea', confidence: categoryConfidence },
                              project: { choice: fixture.projectChoice || 'p0', confidence: projectConfidence }
                          }
                      }
                    : {
                          choices: [
                              {
                                  message: {
                                      content: JSON.stringify(suggestion ? fixture.proposal || {} : {
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
    }
    globalThis.__aiFixture = { request: async (url, init) => {
        const response = await request(url, init)
        return usage ? new Response(JSON.stringify({ ...await response.json(), usage }), { status: 200 }) : response
    } }
    const source = stripTypeScriptTypes(
        readFileSync(new URL('../src/onDeviceAI.ts', import.meta.url), 'utf8')
    ).replace(/^import .*$/gm, '')
    const stub =
        'const {allTypes,namedSuggestion}=globalThis.__taxonomyFixture;const AsyncStorage={getItem:async()=>null,setItem:async()=>{}};const readSecret=async()=>"mock";const notionMcpIsConnected=async()=>false;const fetch=globalThis.__aiFixture.request;'
    globalThis.__taxonomyFixture = { allTypes, namedSuggestion }
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

test('usage aggregates generator and classifier responses without inventing missing costs', async () => {
    const m = await ai(0.95, 0.92, { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12, cost: 0.001 })
    const result = await m.enrichNote('Text', projects, null, settings)
    assert.deepEqual(result.usage, { requests: 2, promptTokens: 20, completionTokens: 4, totalTokens: 24, costUsd: 0.002 })
    const unknown = await ai(0.95, 0.92)
    const noUsage = await unknown.enrichNote('Text', projects, null, settings)
    assert.deepEqual(noUsage.usage, { requests: 2 })
})

const newOptions = { project: { name: 'Сад', description: 'Выращивание растений' }, category: { name: 'Покупка', description: 'Что купить' }, reason: 'Новый контекст' }
test('uncertain project asks DeepSeek once, retains confident type and requires review', async () => {
    const calls = []; const m = await ai(0.95, 0.2, undefined, { calls, proposal: newOptions })
    const result = await m.enrichNote('Купить семена', projects, null, settings)
    assert.equal(result.status, 'needs_review'); assert.equal(result.projectId, null)
    assert.equal(result.classificationProposal.project.name, 'Сад')
    assert.equal(result.classificationProposal.category, undefined)
    assert.equal(result.usage.requests, 3)
    assert.deepEqual(JSON.parse(calls[2].body.messages[1].content).unresolved, { project: true, category: false })
})
test('uncertain type retains confident project; a locked project cannot be proposed again', async () => {
    const m = await ai(0.2, 0.99, undefined, { proposal: newOptions })
    const result = await m.enrichNote('Купить семена', projects, 'project', settings)
    assert.equal(result.projectId, 'project')
    assert.equal(result.classificationProposal.project, undefined)
    assert.equal(result.classificationProposal.category.name, 'Покупка')
})
test('Jev failure and an empty project list can produce a durable proposal instead of losing the note', async () => {
    const m = await ai(0, 0, undefined, { decisionError: true, proposal: newOptions })
    const result = await m.enrichNote('Купить семена', [], null, settings)
    assert.equal(result.status, 'needs_review'); assert.equal(result.title, 'Title')
    assert.equal(result.classificationProposal.project.name, 'Сад')
    assert.equal(result.classificationProposal.category.name, 'Покупка')
    assert.match(result.errorMessage, /Jev unavailable/)
})
test('approved custom types participate in future Jev choices', async () => {
    const calls = []; const m = await ai(0.99, 0.99, undefined, { calls, categoryChoice: 'c5' })
    const result = await m.enrichNote('Купить семена', projects, null, settings, { categories: [{ id: 'custom:buy', name: 'Покупка', description: 'Что купить' }] })
    assert.equal(result.category, 'custom:buy'); assert.equal(result.status, 'ready')
    assert.match(calls.find((r) => r.url.includes('/decisions')).body.questions.category.criteria.c5, /Покупка/)
    assert.equal(result.usage.requests, 2)
})
test('disabled classification and confident Jev responses do not invoke suggestion generation', async () => {
    const m = await ai(0.99, 0.99, undefined, { proposal: newOptions })
    const result = await m.enrichNote('Text', projects, null, { ...settings, decisionProvider: 'disabled' })
    assert.equal(result.classificationProposal, null); assert.equal(result.usage.requests, 1)
})
test('invalid category requests a new type while retaining the confident existing project', async () => {
    const m = await ai(0.99, 0.99, undefined, { categoryChoice: 'unknown', proposal: newOptions })
    const result = await m.enrichNote('Купить', projects, null, settings)
    assert.equal(result.projectId, 'project'); assert.equal(result.classificationProposal.project, undefined)
    assert.equal(result.classificationProposal.category.name, 'Покупка')
})
