<template>
  <!-- Mobile sidebar toggle button -->
  <div
    v-if="isMobile && !sidebarOpen"
    class="fixed left-0 top-1/2 transform -translate-y-1/2 z-10"
  >
    <button
      @click="sidebarOpen = true"
      class="bg-blue-500 text-white hover:bg-blue-600 rounded-r-md rounded-l-none h-12 px-2 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
    ></button>
  </div>

  <!-- Sidebar backdrop for mobile -->
  <div
    v-if="isMobile && sidebarOpen"
    class="fixed inset-0 z-40 bg-black bg-opacity-50 transition-opacity"
    @click="sidebarOpen = false"
  ></div>

  <!-- Sidebar -->
  <div
    class="h-screen bg-white border-r border-slate-200 overflow-y-auto transition-all duration-300 ease-in-out shadow-lg"
    :class="[
      sidebarOpen ? 'w-64' : 'w-0',
      isMobile ? 'fixed z-50' : 'relative',
    ]"
  >
    <div class="p-4">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl font-bold text-slate-800">Заметки</h2>
        <button
          v-if="isMobile"
          @click="sidebarOpen = false"
          class="hover:bg-slate-100 p-1 rounded focus:outline-none focus:ring-2 focus:ring-slate-400"
        ></button>
      </div>

      <div class="flex justify-between items-center mb-2">
        <h3
          class="text-xs font-semibold text-slate-500 uppercase tracking-wider"
        >
          ПАПКИ
        </h3>
        <button
          @click="showNewFolderDialog = true"
          class="h-7 w-7 p-0 text-slate-500 hover:bg-slate-100 rounded-full flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-slate-400"
          title="Новая папка"
        ></button>
      </div>

      <div class="space-y-1 mb-4">
        <div
          v-for="folder in notesStore.folders"
          :key="folder.id"
          class="flex items-center justify-between px-3 py-2 rounded-md cursor-pointer group transition-colors duration-150"
          :class="[
            notesStore.activeFolder?.id === folder.id
              ? 'bg-blue-100 text-blue-700'
              : 'hover:bg-slate-100 text-slate-700',
          ]"
          @click="notesStore.setActiveFolder(folder)"
        >
          <div class="flex items-center space-x-2">
            <span class="text-sm truncate">{{ folder.name }}</span>
          </div>
          <button
            v-if="folder.id !== 'default'"
            @click.stop="confirmDeleteFolder(folder)"
            class="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 hover:bg-slate-200 rounded flex items-center justify-center"
            title="Удалить папку"
          ></button>
        </div>
      </div>

      <div class="pt-2 border-t border-slate-200">
        <button
          class="w-full flex items-center justify-center py-2 px-3 rounded-md bg-blue-100 text-blue-600 hover:bg-blue-200 text-sm font-medium transition-colors"
          @click="showNewFolderDialog = true"
        >
          Новая папка
        </button>
      </div>
    </div>
  </div>

  <!-- New Folder Dialog -->
  <Transition name="fade">
    <div
      v-if="showNewFolderDialog"
      class="dialog-overlay"
      @click="showNewFolderDialog = false"
    >
      <div class="dialog-content" @click.stop>
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-medium">Новая папка</h3>
          <button
            @click="showNewFolderDialog = false"
            class="text-slate-400 hover:text-slate-500"
          ></button>
        </div>
        <form @submit.prevent="createFolder">
          <div class="space-y-4 pt-2">
            <div>
              <label
                for="folder-name"
                class="block text-sm font-medium text-slate-700 mb-1"
                >Название папки</label
              >
              <input
                id="folder-name"
                v-model="newFolderName"
                class="input"
                placeholder="Название папки"
                ref="folderInput"
              />
            </div>
            <div class="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                class="btn btn-secondary"
                @click="showNewFolderDialog = false"
              >
                Отмена
              </button>
              <button
                type="submit"
                class="btn btn-primary"
                :disabled="!newFolderName.trim()"
              >
                Создать
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  </Transition>

  <!-- Delete Folder Confirmation Dialog -->
  <Transition name="fade">
    <div
      v-if="showDeleteFolderDialog"
      class="dialog-overlay"
      @click="showDeleteFolderDialog = false"
    >
      <div class="dialog-content" @click.stop>
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-medium">Удалить папку</h3>
          <button
            @click="showDeleteFolderDialog = false"
            class="text-slate-400 hover:text-slate-500"
          ></button>
        </div>
        <div class="space-y-4">
          <p class="text-sm text-slate-700">
            Вы уверены, что хотите удалить папку "{{ folderToDelete?.name }}"?
            Все заметки в этой папке будут удалены.
          </p>
          <div class="flex justify-end space-x-2 pt-2">
            <button
              class="btn btn-secondary"
              @click="showDeleteFolderDialog = false"
            >
              Отмена
            </button>
            <button class="btn btn-danger" @click="deleteFolderConfirmed">
              Удалить
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, watch } from "vue";
import { useNotesStore, Folder } from "../store/notes";

const notesStore = useNotesStore();
const showNewFolderDialog = ref(false);
const showDeleteFolderDialog = ref(false);
const newFolderName = ref("");
const sidebarOpen = ref(true);
const isMobile = ref(false);
const folderInput = ref<HTMLInputElement | null>(null);
const folderToDelete = ref<Folder | null>(null);

const checkMobile = () => {
  isMobile.value = window.innerWidth < 768;
  if (isMobile.value) {
    sidebarOpen.value = false;
  } else {
    sidebarOpen.value = true;
  }
};

const createFolder = () => {
  if (newFolderName.value.trim()) {
    notesStore.addFolder(newFolderName.value.trim());
    newFolderName.value = "";
    showNewFolderDialog.value = false;
  }
};

const confirmDeleteFolder = (folder: Folder) => {
  folderToDelete.value = folder;
  showDeleteFolderDialog.value = true;
};

const deleteFolderConfirmed = () => {
  if (folderToDelete.value) {
    notesStore.deleteFolder(folderToDelete.value.id);
    showDeleteFolderDialog.value = false;
  }
};

watch(showNewFolderDialog, async (isOpen) => {
  if (isOpen) {
    await nextTick();
    folderInput.value?.focus();
  }
});

onMounted(() => {
  checkMobile();
  window.addEventListener("resize", checkMobile);
});

onUnmounted(() => {
  window.removeEventListener("resize", checkMobile);
});
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
