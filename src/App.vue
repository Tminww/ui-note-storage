<template>
    <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
            <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mr-2 h-4" />
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
            </header>
            <NoteEditor></NoteEditor>
        </SidebarInset>
    </SidebarProvider>
</template>

<script setup lang="ts">
import { useNotesStore } from './store/notes'
import NoteEditor from './components/NoteEditor.vue'
import AppSidebar from '@/components/AppSidebar.vue'

import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { ref, watch } from 'vue'

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

<style scoped></style>
