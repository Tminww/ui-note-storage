import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface Folder {
    id: string
    name: string
    createdAt: Date
}

export interface Note {
    id: string
    folderId: string
    title: string
    content: string
    createdAt: Date
    updatedAt: Date
}

export const useNotesStore = defineStore('notes', () => {
    const folders = ref<Folder[]>([{ id: 'default', name: 'Все заметки', createdAt: new Date() }])

    const notes = ref<Note[]>([])
    const activeFolder = ref<Folder | null>(folders.value[0])
    const activeNote = ref<Note | null>(null)

    const filteredNotes = computed(() => {
        if (!activeFolder.value) return []

        return activeFolder.value.id === 'default'
            ? notes.value
            : notes.value.filter((note) => note.folderId === activeFolder.value?.id)
    })

    function setActiveFolder(folder: Folder | null) {
        activeFolder.value = folder
    }

    function setActiveNote(note: Note | null) {
        activeNote.value = note
    }

    function addFolder(name: string) {
        const newFolder: Folder = {
            id: `folder_${Date.now()}`,
            name,
            createdAt: new Date()
        }
        folders.value.push(newFolder)
    }

    function deleteFolder(id: string) {
        if (id === 'default') {
            return
        }

        // Remove all notes in this folder
        notes.value = notes.value.filter((note) => note.folderId !== id)

        // Remove folder
        folders.value = folders.value.filter((folder) => folder.id !== id)

        // Reset active folder if deleted
        if (activeFolder.value?.id === id) {
            activeFolder.value = folders.value[0]
        }

        // Reset active note if belonged to deleted folder
        if (activeNote.value && activeNote.value.folderId === id) {
            activeNote.value = null
        }
    }

    function addNote(folderId: string, title: string, content: string) {
        const newNote: Note = {
            id: `note_${Date.now()}`,
            folderId,
            title,
            content,
            createdAt: new Date(),
            updatedAt: new Date()
        }
        notes.value.push(newNote)
        activeNote.value = newNote
    }

    function updateNote(id: string, title: string, content: string) {
        const index = notes.value.findIndex((note) => note.id === id)
        if (index !== -1) {
            const updatedNote = {
                ...notes.value[index],
                title,
                content,
                updatedAt: new Date()
            }
            notes.value[index] = updatedNote

            if (activeNote.value?.id === id) {
                activeNote.value = updatedNote
            }
        }
    }

    function deleteNote(id: string) {
        notes.value = notes.value.filter((note) => note.id !== id)

        if (activeNote.value?.id === id) {
            activeNote.value = null
        }
    }

    function formatDate(date: Date): string {
        return date
            .toLocaleDateString('ru-RU', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            })
            .replace(',', '')
    }

    return {
        folders,
        notes,
        activeFolder,
        activeNote,
        filteredNotes,
        setActiveFolder,
        setActiveNote,
        addFolder,
        deleteFolder,
        addNote,
        updateNote,
        deleteNote,
        formatDate
    }
})
