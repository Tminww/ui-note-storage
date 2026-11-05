import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeAIResponse } from '../../../shared/ai-response.mjs'

test('a model can return a checklist array or a wrapped result without losing the note', () => {
    assert.deepEqual(normalizeAIResponse(JSON.stringify({ result: {
        title: 'Покупки', summary: [{ text: 'Чай', completed: true }, 'Кофе']
    } }), 'Купить чай и кофе'), { title: 'Покупки', summary: '- [x] Чай\n- Кофе', tags: [] })
    assert.equal(normalizeAIResponse('{"title":"Покупки"}', 'Купить чай').summary, 'Купить чай')
    assert.equal(normalizeAIResponse('{"summary":"- [ ] Купить чай"}', 'Исходник').title, 'Купить чай')
    assert.throws(() => normalizeAIResponse('{"title":', 'Исходник'), /неполный/)
})
