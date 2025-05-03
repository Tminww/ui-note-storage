<template>
    <div
        v-if="!notesStore.activeNote"
        class="flex-1 flex items-center justify-center p-4 bg-slate-50"
    >
        <div class="text-center">
            <h3 class="text-lg font-medium text-slate-700 mb-2">Выберите заметку</h3>
            <p class="text-sm text-slate-500">Выберите заметку из списка или создайте новую</p>
        </div>
    </div>

    <div v-else class="flex-1 flex flex-col h-full bg-white">
        <div class="flex items-center justify-between p-4 border-b border-slate-200">
            <input
                v-model="title"
                class="text-lg font-medium border-none shadow-none focus:outline-none focus:ring-0 p-0 h-auto bg-transparent flex-1"
                placeholder="Без названия"
                @input="handleTitleChange"
            />
            <button
                @click="handleSaveClick"
                :class="[
                    'inline-flex items-center px-3 py-1 border rounded-md text-sm font-medium',
                    isSaved
                        ? 'text-green-500 border-green-500 bg-green-50 cursor-not-allowed'
                        : 'text-slate-500 border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500'
                ]"
                :disabled="isSaved"
            >
                {{ isSaved ? 'Сохранено' : 'Сохранить' }}
            </button>
        </div>
        <textarea
            v-model="content"
            class="flex-1 resize-none border-none shadow-none focus:outline-none focus:ring-0 p-4 w-full"
            placeholder="Начните писать здесь..."
            @input="handleContentChange"
        ></textarea>
    </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useNotesStore } from '../store/notes'

const notesStore = useNotesStore()
const title = ref('')
const content = ref('')
const isSaved = ref(true)
let saveTimeout: ReturnType<typeof setTimeout> | null = null

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
</script>
