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

<style scoped>
/* Анимации */
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

/* Базовые стили сайдбара */
.sidebar {
    background-color: white;
    height: 100%;
    border-right: 1px solid rgb(226, 232, 240);
}

.sidebar-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 1rem;
    gap: 1rem;
}

/* Заголовок сайдбара */
.sidebar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.title {
    font-size: 1.25rem;
    font-weight: 600;
    color: rgb(15, 23, 42);
}

.close-sidebar-button {
    width: 1.5rem;
    height: 1.5rem;
    color: rgb(100, 116, 139);
    border-radius: 9999px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.close-sidebar-button:hover {
    background-color: rgb(241, 245, 249);
}

/* Заголовок раздела папок */
.folders-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.folders-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: rgb(100, 116, 139);
    letter-spacing: 0.05em;
}

/* Список папок */
.folders-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    overflow-y: auto;
    flex: 1;
}

.folder-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem;
    border-radius: 0.375rem;
    cursor: pointer;
}

.folder-item:hover {
    background-color: rgb(241, 245, 249);
}

.active-folder {
    background-color: rgb(219, 234, 254);
}

.folder-name {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    overflow: hidden;
}

.folder-name span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 0.875rem;
}

.delete-folder-button {
    width: 1.5rem;
    height: 1.5rem;
    color: rgb(100, 116, 139);
    border-radius: 9999px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
}

.folder-item:hover .delete-folder-button {
    opacity: 1;
}

.delete-icon:hover {
    display: contents;
    background-color: rgb(226, 232, 240);
    color: rgb(239, 68, 68);
}

/* Кнопка добавления папки */
.add-folder-container {
    padding-top: 0.5rem;
    border-top: 1px solid rgb(226, 232, 240);
}

.add-folder-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    border-radius: 0.375rem;
    width: 100%;
    font-size: 0.875rem;
    color: rgb(100, 116, 139);
    border: 1px dashed rgb(203, 213, 225);
    justify-content: center;
}

.add-folder-button:hover {
    background-color: rgb(241, 245, 249);
    color: rgb(51, 65, 85);
}

/* Диалоговые окна */
.dialog-overlay {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
}

.dialog-content {
    background-color: white;
    border-radius: 0.5rem;
    box-shadow:
        0 10px 15px -3px rgba(0, 0, 0, 0.1),
        0 4px 6px -2px rgba(0, 0, 0, 0.05);
    max-width: 28rem;
    width: 100%;
    padding: 1.5rem;
}

.dialog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
}

.dialog-title {
    font-size: 1.125rem;
    font-weight: 600;
}

.dialog-close-button {
    color: rgb(148, 163, 184);
}

.dialog-close-button:hover {
    color: rgb(100, 116, 139);
}

.dialog-body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding-top: 0.5rem;
}

/* Формы */
.form-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.form-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: rgb(51, 65, 85);
    margin-bottom: 0.25rem;
}

.form-input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid rgb(203, 213, 225);
    border-radius: 0.375rem;
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

.form-input:focus {
    outline: none;
    border-color: rgb(59, 130, 246);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

/* Кнопки действий в диалоге */
.dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding-top: 0.5rem;
}

.cancel-button {
    padding: 0.5rem 1rem;
    border: 1px solid rgb(203, 213, 225);
    border-radius: 0.375rem;
    color: rgb(51, 65, 85);
    background-color: white;
}

.cancel-button:hover {
    background-color: rgb(248, 250, 252);
}

.cancel-button:focus {
    outline: none;
    box-shadow:
        0 0 0 2px rgb(255, 255, 255),
        0 0 0 4px rgb(100, 116, 139);
}

.create-button {
    padding: 0.5rem 1rem;
    background-color: rgb(59, 130, 246);
    color: white;
    border-radius: 0.375rem;
}

.create-button:hover {
    background-color: rgb(37, 99, 235);
}

.create-button:focus {
    outline: none;
}
</style>
