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

<style scoped>
/* Контейнер списка заметок */
.notes-list-container {
    height: 100%;
    display: flex;
    flex-direction: column;
    border-right: 1px solid rgb(226, 232, 240); /* border-r border-slate-200 */
    background-color: white; /* bg-white */
    width: 16rem; /* w-64 */
}

/* Заголовок списка заметок */
.notes-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem; /* p-4 */
}

.title {
    font-size: 1.25rem;
    font-weight: 600;
    color: rgb(15, 23, 42);
}

.add-note-button {
    height: 2rem; /* h-8 */
    width: 2rem; /* w-8 */
    padding: 0; /* p-0 */
    border-radius: 9999px; /* rounded-full */
    display: flex;
    align-items: center;
    justify-content: center;
}

.add-note-button:hover {
    background-color: rgb(241, 245, 249); /* hover:bg-slate-100 */
}

/* Контент списка заметок */
.notes-content {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem; /* p-2 */
    padding-top: 0;
}

.notes-content > * + * {
    margin-top: 0.25rem; /* space-y-1 */
}

/* Сообщение при отсутствии заметок */
.empty-notes-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #94a3b8; /* text-slate-400 */
    font-size: 0.875rem; /* text-sm */
    padding: 1rem; /* p-4 */
}

.empty-notes-text {
    text-align: center;
}

/* Элемент заметки */
.note-item {
    padding: 0.5rem; /* p-2 */
    border-radius: 0.375rem; /* rounded-md */
    cursor: pointer;
}

.active-note {
    background-color: rgb(219, 234, 254); /* bg-blue-100 */
}

.inactive-note:hover {
    background-color: rgb(241, 245, 249); /* hover:bg-slate-100 */
}

.note-item-content {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
}

.note-info {
    flex: 1;
    min-width: 0;
}

.note-title {
    font-size: 0.875rem; /* text-sm */
    font-weight: 500; /* font-medium */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis; /* truncate */
}

.note-date {
    font-size: 0.75rem; /* text-xs */
    color: rgb(100, 116, 139); /* text-slate-500 */
    margin-top: 0.25rem; /* mt-1 */
}

.delete-note-button {
    height: 1.5rem; /* h-6 */
    width: 1.5rem; /* w-6 */
    padding: 0; /* p-0 */
    opacity: 0;
    border-radius: 0.25rem; /* rounded */
    display: flex;
    align-items: center;
    justify-content: center;
}

.note-item:hover .delete-note-button {
    opacity: 1; /* group-hover:opacity-100 */
}

.delete-note-button:hover {
    background-color: rgb(226, 232, 240); /* hover:bg-slate-200 */
}

/* Стили для диалоговых окон */
.dialog-overlay {
    position: fixed;
    inset: 0; /* inset-0 */
    background-color: rgba(0, 0, 0, 0.5); /* bg-black bg-opacity-50 */
    z-index: 50; /* z-50 */
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem; /* p-4 */
}

.dialog-content {
    background-color: white; /* bg-white */
    border-radius: 0.5rem; /* rounded-lg */
    box-shadow:
        0 10px 15px -3px rgba(0, 0, 0, 0.1),
        0 4px 6px -2px rgba(0, 0, 0, 0.05); /* shadow-lg */
    max-width: 28rem; /* max-w-md */
    width: 100%; /* w-full */
    padding: 1.5rem; /* p-6 */
}

.dialog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem; /* mb-4 */
}

.dialog-title {
    font-size: 1.125rem; /* text-lg */
    font-weight: 500; /* font-medium */
}

.dialog-close-button {
    color: rgb(148, 163, 184); /* text-slate-400 */
}

.dialog-close-button:hover {
    color: rgb(100, 116, 139); /* hover:text-slate-500 */
}

.dialog-body {
    display: flex;
    flex-direction: column;
    gap: 1rem; /* space-y-4 */
    padding-top: 1rem; /* pt-4 */
}

.note-input {
    width: 100%; /* w-full */
    padding: 0.5rem 0.75rem; /* px-3 py-2 */
    border: 1px solid rgb(203, 213, 225); /* border border-slate-300 */
    border-radius: 0.375rem; /* rounded-md */
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); /* shadow-sm */
}

.note-input:focus {
    outline: none;
    border-color: rgb(59, 130, 246); /* focus:border-blue-500 */
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2); /* focus:ring-blue-500 */
}

.dialog-actions {
    display: flex;
    justify-content: flex-end;
}

.dialog-actions-split {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem; /* space-x-2 */
}

.create-button {
    padding: 0.5rem 1rem; /* px-4 py-2 */
    background-color: rgb(59, 130, 246); /* bg-blue-500 */
    color: white; /* text-white */
    border-radius: 0.375rem; /* rounded-md */
}

.create-button:hover {
    background-color: rgb(37, 99, 235); /* hover:bg-blue-600 */
}

.create-button:focus {
    outline: none;
    box-shadow:
        0 0 0 2px rgb(255, 255, 255),
        0 0 0 4px rgb(59, 130, 246); /* focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 */
}

.create-button:disabled {
    opacity: 0.5; /* disabled:opacity-50 */
    cursor: not-allowed; /* disabled:cursor-not-allowed */
}

.cancel-button {
    padding: 0.5rem 1rem; /* px-4 py-2 */
    border: 1px solid rgb(203, 213, 225); /* border border-slate-300 */
    border-radius: 0.375rem; /* rounded-md */
    color: rgb(51, 65, 85); /* text-slate-700 */
    background-color: white; /* bg-white */
}

.cancel-button:hover {
    background-color: rgb(248, 250, 252); /* hover:bg-slate-50 */
}

.cancel-button:focus {
    outline: none;
    box-shadow:
        0 0 0 2px rgb(255, 255, 255),
        0 0 0 4px rgb(100, 116, 139); /* focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 */
}

.delete-button {
    padding: 0.5rem 1rem; /* px-4 py-2 */
    background-color: rgb(239, 68, 68); /* bg-red-500 */
    color: white; /* text-white */
    border-radius: 0.375rem; /* rounded-md */
}

.delete-button:hover {
    background-color: rgb(220, 38, 38); /* hover:bg-red-600 */
}

.delete-button:focus {
    outline: none;
    box-shadow:
        0 0 0 2px rgb(255, 255, 255),
        0 0 0 4px rgb(239, 68, 68); /* focus:ring-2 focus:ring-red-500 focus:ring-offset-2 */
}

.confirmation-text {
    margin-bottom: 1rem;
}
</style>
