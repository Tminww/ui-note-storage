<template>
    <div>
        <div v-if="!notesStore.activeNote" class="no-note-container">
            <div>
                <h3 class="no-note-title">Выберите заметку</h3>
                <p class="no-note-description">Выберите заметку из списка или создайте новую</p>
            </div>
        </div>

        <div v-else class="editor-container">
            <div class="editor-header">
                <input
                    v-model="title"
                    class="editor-title-input"
                    placeholder="Без названия"
                    @input="handleTitleChange"
                />
                <div class="editor-controls">
                    <button
                        @click="togglePreview"
                        class="preview-toggle-button"
                        :class="{ active: isPreviewMode }"
                    >
                        {{ isPreviewMode ? 'Редактировать' : 'Предпросмотр' }}
                    </button>
                    <button
                        @click="handleSaveClick"
                        :class="['save-button', isSaved ? 'saved-button' : 'unsaved-button']"
                        :disabled="isSaved"
                    >
                        {{ isSaved ? 'Сохранено' : 'Сохранить' }}
                    </button>
                </div>
            </div>

            <div class="editor-content-container">
                <!-- Режим редактирования -->
                <div v-if="!isPreviewMode" class="md-editor-wrapper">
                    <div class="md-toolbar">
                        <button
                            @click="insertMarkdown('**', '**')"
                            title="Жирный текст"
                            class="md-button"
                        >
                            <b>B</b>
                        </button>
                        <button @click="insertMarkdown('*', '*')" title="Курсив" class="md-button">
                            <i>I</i>
                        </button>
                        <button
                            @click="insertMarkdown('# ', '')"
                            title="Заголовок 1"
                            class="md-button"
                        >
                            H1
                        </button>
                        <button
                            @click="insertMarkdown('## ', '')"
                            title="Заголовок 2"
                            class="md-button"
                        >
                            H2
                        </button>
                        <button
                            @click="insertMarkdown('### ', '')"
                            title="Заголовок 3"
                            class="md-button"
                        >
                            H3
                        </button>
                        <button @click="insertMarkdown('- ', '')" title="Список" class="md-button">
                            •
                        </button>
                        <button
                            @click="insertMarkdown('1. ', '')"
                            title="Нумерованный список"
                            class="md-button"
                        >
                            1.
                        </button>
                        <button
                            @click="insertMarkdown('[', '](url)')"
                            title="Ссылка"
                            class="md-button"
                        >
                            🔗
                        </button>
                        <button
                            @click="insertMarkdown('![alt text](', ')')"
                            title="Изображение"
                            class="md-button"
                        >
                            🖼️
                        </button>
                        <button
                            @click="insertMarkdown('```\n', '\n```')"
                            title="Блок кода"
                            class="md-button"
                        >
                            &lt;/&gt;
                        </button>
                        <button @click="insertMarkdown('> ', '')" title="Цитата" class="md-button">
                            "
                        </button>
                        <button
                            @click="insertMarkdown('---\n', '')"
                            title="Горизонтальная линия"
                            class="md-button"
                        >
                            —
                        </button>
                    </div>

                    <textarea
                        ref="mdTextarea"
                        v-model="content"
                        class="editor-content"
                        placeholder="Начните писать здесь... (поддерживается Markdown)"
                        @input="handleContentChange"
                    ></textarea>
                </div>

                <!-- Режим предпросмотра -->
                <div v-else class="md-preview" v-html="renderedMarkdown"></div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useNotesStore } from '../store/notes'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const notesStore = useNotesStore()
const title = ref('')
const content = ref('')
const isSaved = ref(true)
const isPreviewMode = ref(false)
const mdTextarea = ref<HTMLTextAreaElement | null>(null)
let saveTimeout: ReturnType<typeof setTimeout> | null = null

// Предварительный рендеринг Markdown в HTML
const renderedMarkdown = computed(() => {
    return DOMPurify.sanitize(marked.parse(content.value))
})

watch(
    () => notesStore.activeNote,
    (newNote) => {
        if (newNote) {
            title.value = newNote.title
            content.value = newNote.content
            isSaved.value = true
        } else {
            title.value = ''
            content.value = ''
        }
    },
    { immediate: true }
)

const handleTitleChange = () => {
    isSaved.value = false
    triggerAutoSave()
}

const handleContentChange = () => {
    isSaved.value = false
    triggerAutoSave()
}

const triggerAutoSave = () => {
    if (saveTimeout) {
        clearTimeout(saveTimeout)
    }

    saveTimeout = setTimeout(() => {
        if (
            notesStore.activeNote &&
            (title.value !== notesStore.activeNote.title ||
                content.value !== notesStore.activeNote.content)
        ) {
            notesStore.updateNote(notesStore.activeNote.id, title.value, content.value)
            isSaved.value = true
        }
    }, 1000)
}

const handleSaveClick = () => {
    if (notesStore.activeNote) {
        notesStore.updateNote(notesStore.activeNote.id, title.value, content.value)
        isSaved.value = true
    }
}

// Переключение между режимами редактирования и предпросмотра
const togglePreview = () => {
    isPreviewMode.value = !isPreviewMode.value
}

// Вставка Markdown-синтаксиса
const insertMarkdown = (prefix: string, suffix: string) => {
    if (!mdTextarea.value) return

    const textarea = mdTextarea.value
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = content.value.substring(start, end)

    const beforeText = content.value.substring(0, start)
    const afterText = content.value.substring(end)

    content.value = beforeText + prefix + selectedText + suffix + afterText

    // Устанавливаем курсор после вставленного текста
    setTimeout(() => {
        textarea.focus()
        const newCursorPos = start + prefix.length + selectedText.length + suffix.length
        textarea.setSelectionRange(
            selectedText ? start + prefix.length : newCursorPos,
            selectedText ? end + prefix.length : newCursorPos
        )
    }, 0)

    handleContentChange()
}
</script>

<style scoped>
/* Контейнер для сообщения "Нет выбранной заметки" */
.no-note-container {
    display: flex;
    text-align: center;
    justify-content: center;
    align-items: center;
    height: 100%;
    min-height: 300px;
}

.no-note-title {
    font-size: 1.5rem;
    margin-bottom: 0.5rem;
    color: #333;
}

.no-note-description {
    font-size: 1rem;
    color: #666;
}

/* Контейнер для редактора заметок */
.editor-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: white;
}

/* Заголовок редактора */
.editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border-bottom: 1px solid rgb(226, 232, 240);
}

.editor-controls {
    display: flex;
    gap: 0.5rem;
}

/* Поле ввода заголовка заметки */
.editor-title-input {
    font-size: 1.6rem;
    font-weight: 500;
    border: none;
    box-shadow: none;
    padding: 0;
    height: auto;
    background-color: transparent;
}

.editor-title-input:focus {
    outline: none;
}

/* Кнопки */
.save-button,
.preview-toggle-button {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.75rem;
    border: 1px solid;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
}

/* Состояния кнопки сохранения */
.saved-button {
    color: rgb(34, 197, 94);
    border-color: rgb(34, 197, 94);
    background-color: rgb(240, 253, 244);
    cursor: not-allowed;
}

.unsaved-button {
    color: rgb(100, 116, 139);
    border-color: rgb(203, 213, 225);
}

.unsaved-button:hover {
    background-color: rgb(248, 250, 252);
}

.preview-toggle-button {
    color: rgb(79, 70, 229);
    border-color: rgb(209, 206, 252);
}

.preview-toggle-button:hover,
.preview-toggle-button.active {
    background-color: rgb(237, 235, 254);
}

.preview-toggle-button:focus,
.unsaved-button:focus {
    outline: none;
}

/* Контейнер содержимого редактора */
.editor-content-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: auto;
}

/* Поле ввода содержимого заметки */
.editor-content {
    flex: 1;
    resize: none;
    border: none;
    box-shadow: none;
    padding: 1rem;
    min-height: 300px;
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    line-height: 1.5;
}

.editor-content:focus {
    outline: none;
}

/* Markdown панель инструментов */
.md-editor-wrapper {
    display: flex;
    flex-direction: column;
    flex: 1;
}

.md-toolbar {
    display: flex;
    flex-wrap: wrap;
    padding: 0.5rem;
    background-color: #f5f7fa;
    border-bottom: 1px solid #e2e8f0;
    gap: 0.25rem;
}

.md-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: 1px solid #e2e8f0;
    border-radius: 0.25rem;
    background-color: white;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
}

.md-button:hover {
    background-color: #f1f5f9;
    border-color: #cbd5e1;
}

/* Предпросмотр Markdown */
.md-preview {
    flex: 1;
    padding: 1rem;
    overflow: auto;
    line-height: 1.6;
}

/* Стили для отображения Markdown в режиме предпросмотра */
.md-preview :deep(h1) {
    font-size: 2rem;
    font-weight: 700;
    margin-top: 1.5rem;
    margin-bottom: 1rem;
    padding-bottom: 0.3rem;
    border-bottom: 1px solid #e2e8f0;
}

.md-preview :deep(h2) {
    font-size: 1.5rem;
    font-weight: 600;
    margin-top: 1.4rem;
    margin-bottom: 0.8rem;
    padding-bottom: 0.2rem;
    border-bottom: 1px solid #e2e8f0;
}

.md-preview :deep(h3) {
    font-size: 1.25rem;
    font-weight: 600;
    margin-top: 1.3rem;
    margin-bottom: 0.6rem;
}

.md-preview :deep(h4) {
    font-size: 1.1rem;
    font-weight: 600;
    margin-top: 1.2rem;
    margin-bottom: 0.4rem;
}

.md-preview :deep(p) {
    margin-bottom: 1rem;
}

.md-preview :deep(ul),
.md-preview :deep(ol) {
    margin-bottom: 1rem;
    padding-left: 2rem;
}

.md-preview :deep(li) {
    margin-bottom: 0.25rem;
}

.md-preview :deep(blockquote) {
    border-left: 4px solid #cbd5e1;
    padding-left: 1rem;
    margin-left: 0;
    margin-right: 0;
    color: #64748b;
}

.md-preview :deep(code) {
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    background-color: #f1f5f9;
    padding: 0.2rem 0.4rem;
    border-radius: 0.25rem;
    font-size: 0.875em;
}

.md-preview :deep(pre) {
    background-color: #1e293b;
    padding: 1rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    margin-bottom: 1rem;
}

.md-preview :deep(pre code) {
    background-color: transparent;
    padding: 0;
    color: #e2e8f0;
    font-size: 0.875rem;
}

.md-preview :deep(a) {
    color: #3b82f6;
    text-decoration: none;
}

.md-preview :deep(a:hover) {
    text-decoration: underline;
}

.md-preview :deep(img) {
    max-width: 100%;
    height: auto;
}

.md-preview :deep(hr) {
    border: 0;
    border-top: 1px solid #e2e8f0;
    margin: 1.5rem 0;
}

.md-preview :deep(table) {
    border-collapse: collapse;
    width: 100%;
    margin-bottom: 1rem;
}

.md-preview :deep(th),
.md-preview :deep(td) {
    border: 1px solid #e2e8f0;
    padding: 0.5rem;
    text-align: left;
}

.md-preview :deep(th) {
    background-color: #f8fafc;
}
</style>
