<template>
    <div class="notes-app">
        <TreeListWidget class="sidebar" @openNote="handleOpenNote($event as Note)" />
        <div class="content">
            <NoteEditor class="note-editor" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { useNotesStore } from './store/notes'
import TreeListWidget from './components/TreeListWidget.vue'
import NoteEditor from './components/NoteEditor.vue'
import type { Note } from './types'

const notesStore = useNotesStore()

// Обработчик открытия заметки при двойном клике
function handleOpenNote(note: Note) {
    // Используем notesStore для установки активной заметки
    notesStore.setActiveNote({
        id: note.id,
        folderId: note.parentId || '',
        title: note.name,
        content: note.content || '',
        createdAt: note.updatedAt || new Date(),
        updatedAt: note.updatedAt || new Date()
    })
}
</script>

<style scoped>
.notes-app {
    display: flex;
    height: 100vh;
    overflow: hidden;
}

.sidebar {
    width: 350px;
    border-right: 1px solid rgb(226, 232, 240);
    overflow-y: auto;
}

.content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

/* Убираем .note-editor, так как применяем стили на уровне компонента */
</style>
