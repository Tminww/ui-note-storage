<template>
  <div class="h-full flex flex-col border-r border-slate-200 bg-white w-64">
    <div class="flex items-center justify-between p-4 border-b border-slate-200">
      <h2 class="text-lg font-medium">{{ notesStore.activeFolder?.name || "Заметки" }}</h2>
      <button 
        @click="showNewNoteDialog = true"
        class="h-8 w-8 p-0 hover:bg-slate-100 rounded-full flex items-center justify-center"
      >
   
      </button>
    </div>
    
    <div class="flex-1 overflow-y-auto p-2 space-y-1">
      <div 
        v-if="notesStore.filteredNotes.length === 0" 
        class="flex flex-col items-center justify-center h-full text-slate-400 text-sm p-4"
      >
     
        <p class="text-center">
          {{ notesStore.activeFolder 
            ? "В этой папке нет заметок" 
            : "Выберите папку для просмотра заметок" 
          }}
        </p>
      </div>
      
      <div
        v-else
        v-for="note in notesStore.filteredNotes"
        :key="note.id"
        class="p-2 rounded-md cursor-pointer group"
        :class="notesStore.activeNote?.id === note.id ? 'bg-blue-100' : 'hover:bg-slate-100'"
        @click="notesStore.setActiveNote(note)"
      >
        <div class="flex justify-between items-start">
          <div class="flex-1 min-w-0">
            <h3 class="text-sm font-medium truncate">{{ note.title }}</h3>
            <p class="text-xs text-slate-500 mt-1">
              {{ notesStore.formatDate(note.updatedAt) }}
            </p>
          </div>
          <button
            @click.stop="confirmDelete(note)"
            class="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 hover:bg-slate-200 rounded flex items-center justify-center"
          >
          
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- New Note Dialog -->
  <div v-if="showNewNoteDialog" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
    <div class="bg-white rounded-lg shadow-lg max-w-md w-full p-6" @click.stop>
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-medium">Новая заметка</h3>
        <button @click="showNewNoteDialog = false" class="text-slate-400 hover:text-slate-500">
      
        </button>
      </div>
      <form @submit.prevent="createNote">
        <div class="space-y-4 pt-4">
          <div>
            <input
              v-model="newNoteTitle"
              class="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Название заметки"
              ref="noteInput"
            />
          </div>
          <div class="flex justify-end">
            <button 
              type="submit" 
              class="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
  <div v-if="showDeleteDialog" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
    <div class="bg-white rounded-lg shadow-lg max-w-md w-full p-6" @click.stop>
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-medium">Удалить заметку</h3>
        <button @click="showDeleteDialog = false" class="text-slate-400 hover:text-slate-500">
    
        </button>
      </div>
      <div class="space-y-4">
        <p>
          Вы уверены, что хотите удалить заметку "{{ noteToDelete?.title }}"? Это действие нельзя отменить.
        </p>
        <div class="flex justify-end space-x-2">
          <button 
            class="px-4 py-2 border border-slate-300 rounded-md text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
            @click="showDeleteDialog = false"
          >
            Отмена
          </button>
          <button 
            class="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            @click="deleteConfirmed"
          >
            Удалить
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch } from 'vue';
import { useNotesStore, Note } from '../store/notes';

const notesStore = useNotesStore();
const showNewNoteDialog = ref(false);
const showDeleteDialog = ref(false);
const newNoteTitle = ref('');
const noteToDelete = ref<Note | null>(null);
const noteInput = ref<HTMLInputElement | null>(null);

const createNote = () => {
  if (notesStore.activeFolder && newNoteTitle.value.trim()) {
    notesStore.addNote(
      notesStore.activeFolder.id,
      newNoteTitle.value.trim(),
      ''
    );
    newNoteTitle.value = '';
    showNewNoteDialog.value = false;
  }
};

const confirmDelete = (note: Note) => {
  noteToDelete.value = note;
  showDeleteDialog.value = true;
};

const deleteConfirmed = () => {
  if (noteToDelete.value) {
    notesStore.deleteNote(noteToDelete.value.id);
    showDeleteDialog.value = false;
  }
};

watch(showNewNoteDialog, async (isOpen) => {
  if (isOpen) {
    await nextTick();
    noteInput.value?.focus();
  }
});
</script>