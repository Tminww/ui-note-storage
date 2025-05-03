<template>
  <div class="h-screen flex overflow-hidden bg-slate-50">
    <SidebarComponent />
    <div class="flex flex-1" :class="{ 'flex-col': isMobile, 'flex-row': !isMobile }">
      <NotesListComponent />
      <NoteEditorComponent />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import SidebarComponent from './Sidebar.vue';
import NotesListComponent from './NotesList.vue';
import NoteEditorComponent from './NoteEditor.vue';

const isMobile = ref(false);

const checkMobile = () => {
  isMobile.value = window.innerWidth < 768;
};

onMounted(() => {
  checkMobile();
  window.addEventListener('resize', checkMobile);
});

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile);
});
</script>