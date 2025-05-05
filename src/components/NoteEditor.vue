<template>
    <div class="note-editor-root">
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
                        @click="handleSaveClick"
                        :class="['save-button', isSaved ? 'saved-button' : 'unsaved-button']"
                        :disabled="isSaved"
                    >
                        {{ isSaved ? 'Сохранено' : 'Сохранить' }}
                    </button>
                </div>
            </div>

            <div class="editor-content-wrapper">
                <PowerMdEditor v-model="content" @update:modelValue="handleContentChange" />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useNotesStore } from '../store/notes'

import PowerMdEditor from './PowerMdEditor.vue'

const notesStore = useNotesStore()
const title = ref('')
const content = ref('')
const isSaved = ref(true)
let saveTimeout: ReturnType<typeof setTimeout> | null = null

watch(
    () => notesStore.activeNote,
    (newNote) => {
        if (newNote) {
            console.log(title.value, content.value)
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

// Наблюдаем за изменениями в content
watch(
    () => content.value,
    () => {
        if (notesStore.activeNote && content.value !== notesStore.activeNote.content) {
            isSaved.value = false
            triggerAutoSave()
        }
    }
)

const handleTitleChange = () => {
    isSaved.value = false
    triggerAutoSave()
}

const handleContentChange = () => {
    console.log('Handle', content.value)
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
            console.log('Upd', notesStore.activeNote)
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
</script>

<style scoped>
/* Корневой элемент */
.note-editor-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
}

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
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
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
.save-button {
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

.unsaved-button:focus {
    outline: none;
}

/* Обертка для редактора содержимого */
.editor-content-wrapper {
    flex: 1;
    overflow: auto;
    display: flex;
    flex-direction: column;
}

/* Стиль для PowerMdEditor */
.editor-content-wrapper :deep(.power-md-editor) {
    flex: 1;
    display: flex;
    flex-direction: column;
    height: 100%;
}
</style>
