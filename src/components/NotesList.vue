<template>
    <div>
        <div class="notes-list-container">
            <div class="notes-header">
                <h2 class="title">
                    {{ notesStore.activeFolder?.name || 'Заметки' }}
                </h2>
                <button
                    @click="showNewNoteDialog = true"
                    class="btn-with-icon"
                    title="Новая заметка"
                >
                    <SvgIcon name="plus" />
                </button>
            </div>

            <div class="notes-content">
                <div v-if="notesStore.filteredNotes.length === 0" class="empty-notes-message">
                    <SvgIcon name="file-document-outline" size="64" color="#94a3b8" />
                    <p class="empty-notes-text">
                        {{
                            notesStore.activeFolder
                                ? 'В этой папке нет заметок'
                                : 'Выберите папку для просмотра заметок'
                        }}
                    </p>
                </div>

                <div
                    v-else
                    v-for="note in notesStore.filteredNotes"
                    :key="note.id"
                    class="note-item"
                    :class="notesStore.activeNote?.id === note.id ? 'active-note' : 'inactive-note'"
                    @click="notesStore.setActiveNote(note)"
                >
                    <div class="note-item-content">
                        <div class="note-info">
                            <h3 class="note-title">{{ note.title }}</h3>
                            <p class="note-date">
                                {{ notesStore.formatDate(note.updatedAt) }}
                            </p>
                        </div>
                        <button @click.stop="confirmDelete(note)" class="btn-with-icon">
                            <SvgIcon name="close" size="16" />
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- New Note Dialog -->
        <div v-if="showNewNoteDialog" class="dialog-overlay">
            <div class="dialog-content" @click.stop>
                <div class="dialog-header">
                    <h3 class="dialog-title">Новая заметка</h3>
                    <button @click="showNewNoteDialog = false" class="btn-with-icon">
                        <SvgIcon name="close" />
                    </button>
                </div>
                <form @submit.prevent="createNote">
                    <div class="dialog-body">
                        <div>
                            <input
                                v-model="newNoteTitle"
                                class="note-input"
                                placeholder="Название заметки"
                                ref="noteInput"
                            />
                        </div>
                        <div class="dialog-actions">
                            <button
                                type="submit"
                                class="create-button"
                                :disabled="!newNoteTitle.trim() || !notesStore.activeFolder"
                            >
                                Создать
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>

        <!-- Delete Confirmation Dialog -->
        <div v-if="showDeleteDialog" class="dialog-overlay">
            <div class="dialog-content" @click.stop>
                <div class="dialog-header">
                    <h3 class="dialog-title">Удалить заметку</h3>
                    <button @click="showDeleteDialog = false" class="btn-with-icon">
                        <SvgIcon name="close" />
                    </button>
                </div>
                <div class="dialog-body">
                    <p class="confirmation-text">
                        Вы уверены, что хотите удалить заметку "{{ noteToDelete?.title }}"? Это
                        действие нельзя отменить.
                    </p>
                    <div class="dialog-actions-split">
                        <button class="cancel-button" @click="showDeleteDialog = false">
                            Отмена
                        </button>
                        <button class="delete-button" @click="deleteConfirmed">Удалить</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { useNotesStore, Note } from '../store/notes'
import SvgIcon from './ui/SvgIcon.vue'

const notesStore = useNotesStore()
const showNewNoteDialog = ref(false)
const showDeleteDialog = ref(false)
const newNoteTitle = ref('')
const noteToDelete = ref<Note | null>(null)
const noteInput = ref<HTMLInputElement | null>(null)

const createNote = () => {
    if (notesStore.activeFolder && newNoteTitle.value.trim()) {
        notesStore.addNote(notesStore.activeFolder.id, newNoteTitle.value.trim(), '')
        newNoteTitle.value = ''
        showNewNoteDialog.value = false
    }
}

const confirmDelete = (note: Note) => {
    noteToDelete.value = note
    showDeleteDialog.value = true
}

const deleteConfirmed = () => {
    if (noteToDelete.value) {
        notesStore.deleteNote(noteToDelete.value.id)
        showDeleteDialog.value = false
    }
}

watch(showNewNoteDialog, async (isOpen) => {
    if (isOpen) {
        await nextTick()
        noteInput.value?.focus()
    }
})
</script>
