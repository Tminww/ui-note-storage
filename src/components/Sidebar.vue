<template>
    <div>
        <!-- Sidebar -->
        <div class="sidebar">
            <div class="sidebar-container">
                <div class="sidebar-header">
                    <h2 class="title">Папки</h2>
                    <button
                        @click="showNewFolderDialog = true"
                        class="btn-with-icon"
                        title="Новая папка"
                    >
                        <SvgIcon name="plus"> </SvgIcon>
                    </button>
                </div>

                <div class="folders-list">
                    <div
                        v-for="folder in notesStore.folders"
                        :key="folder.id"
                        class="folder-item"
                        :class="{ 'active-folder': notesStore.activeFolder?.id === folder.id }"
                        @click="notesStore.setActiveFolder(folder)"
                    >
                        <div class="folder-name">
                            <SvgIcon name="folder-outline" size="20"></SvgIcon>
                            <span>{{ folder.name }}</span>
                        </div>
                        <button
                            v-if="folder.id !== 'default'"
                            @click.stop="confirmDeleteFolder(folder)"
                            class="btn-with-icon"
                            title="Удалить папку"
                        >
                            <SvgIcon class="delete-icon" name="close" :size="16"></SvgIcon>
                        </button>
                    </div>
                </div>

                <div class="add-folder-container">
                    <button @click="showNewFolderDialog = true" class="add-folder-button">
                        {{ notesStore.activeFolder?.name || 'Заметки' }}
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
                    <div class="dialog-header">
                        <h3 class="dialog-title">Новая папка</h3>
                        <button @click="showNewFolderDialog = false" class="btn-with-icon">
                            <SvgIcon name="close" size="20"></SvgIcon>
                        </button>
                    </div>
                    <form @submit.prevent="createFolder">
                        <div class="dialog-body">
                            <div class="form-group">
                                <input
                                    id="folder-name"
                                    v-model="newFolderName"
                                    class="form-input"
                                    placeholder="Название папки"
                                    ref="folderInput"
                                />
                            </div>
                            <div class="dialog-actions">
                                <button
                                    type="button"
                                    class="cancel-button"
                                    @click="showNewFolderDialog = false"
                                >
                                    Отмена
                                </button>
                                <button
                                    type="submit"
                                    class="create-button"
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
                    <div class="dialog-header">
                        <h3 class="dialog-title">Удалить папку</h3>
                        <button
                            @click="showDeleteFolderDialog = false"
                            class="dialog-close-button"
                        ></button>
                    </div>
                    <div class="dialog-body">
                        <p class="confirmation-text">
                            Вы уверены, что хотите удалить папку "{{ folderToDelete?.name }}"? Все
                            заметки в этой папке будут удалены.
                        </p>
                        <div class="dialog-actions">
                            <button class="cancel-button" @click="showDeleteFolderDialog = false">
                                Отмена
                            </button>
                            <button class="delete-button" @click="deleteFolderConfirmed">
                                Удалить
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
    </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useNotesStore, Folder } from '../store/notes'
import SvgIcon from './ui/SvgIcon.vue'

const notesStore = useNotesStore()
const showNewFolderDialog = ref(false)
const showDeleteFolderDialog = ref(false)
const newFolderName = ref('')
const sidebarOpen = ref(true)
const isMobile = ref(false)
const folderInput = ref<HTMLInputElement | null>(null)
const folderToDelete = ref<Folder | null>(null)

const checkMobile = () => {
    isMobile.value = window.innerWidth < 768
    if (isMobile.value) {
        sidebarOpen.value = false
    } else {
        sidebarOpen.value = true
    }
}

const createFolder = () => {
    if (newFolderName.value.trim()) {
        notesStore.addFolder(newFolderName.value.trim())
        newFolderName.value = ''
        showNewFolderDialog.value = false
    }
}

const confirmDeleteFolder = (folder: Folder) => {
    folderToDelete.value = folder
    showDeleteFolderDialog.value = true
}

const deleteFolderConfirmed = () => {
    if (folderToDelete.value) {
        notesStore.deleteFolder(folderToDelete.value.id)
        showDeleteFolderDialog.value = false
    }
}

watch(showNewFolderDialog, async (isOpen) => {
    if (isOpen) {
        await nextTick()
        folderInput.value?.focus()
    }
})

onMounted(() => {
    checkMobile()
    window.addEventListener('resize', checkMobile)
})

onUnmounted(() => {
    window.removeEventListener('resize', checkMobile)
})
</script>
