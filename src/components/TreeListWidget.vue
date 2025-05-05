<template>
    <div class="tree-list-widget">
        <div class="tree-container">
            <div class="tree-header">
                <h2 class="title">Менеджер</h2>

                <div class="tree-actions">
                    <button
                        @click="showNewItemDialog = true"
                        class="btn-with-icon"
                        title="Новый элемент"
                    >
                        <SvgIcon name="plus" size="20" />
                    </button>
                </div>
            </div>

            <!-- Tree Content -->
            <div class="tree-content">
                <div v-if="treeItems.length === 0" class="empty-tree-message">
                    <SvgIcon name="folder-outline" size="64" color="#94a3b8" />
                    <p class="empty-tree-text">Пустое дерево</p>
                    <button @click="showNewItemDialog = true" class="action-button">
                        Создать элемент
                    </button>
                </div>

                <div v-else>
                    <!-- Recursive Tree Component -->
                    <TreeNode
                        v-for="item in rootItems"
                        :key="item.id"
                        :item="item"
                        :children="getChildrenFor(item.id)"
                        :level="0"
                        :active-id="activeItemId"
                        @select="selectItem"
                        @toggle="toggleItem"
                        @add="showAddChildDialog"
                        @edit="showEditDialog"
                        @delete="confirmDelete"
                    />
                </div>
            </div>
        </div>

        <ModalDialog
            v-if="showNewItemDialog"
            title="Новый элемент"
            status="create"
            cancelText="Отмена"
            confirmText="Создать"
            @cancel="showNewItemDialog = false"
            @confirm="createItem"
            @keyup.esc="showNewItemDialog = false"
        >
            <template #content>
                <div class="form-group">
                    <label for="item-type">Тип элемента</label>
                    <select id="item-type" v-model="newItemType" class="form-select">
                        <option value="folder">Папка</option>
                        <option value="note">Заметка</option>
                    </select>
                </div>

                <div class="form-group" v-if="newItemType === 'note'">
                    <label for="parent-folder">Родительская папка</label>
                    <select id="parent-folder" v-model="newItemParentId" class="form-select">
                        <option value="">Корневая директория</option>
                        <option v-for="folder in folderItems" :key="folder.id" :value="folder.id">
                            {{ getItemPath(folder.id) }}
                        </option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="item-name">Название</label>
                    <input
                        id="item-name"
                        v-model="newItemName"
                        class="form-input"
                        placeholder="Название элемента"
                        ref="newItemInput"
                    />
                </div>
            </template>
        </ModalDialog>

        <!-- Add Child Dialog -->
        <ModalDialog
            v-if="showAddChildDialogFlag"
            status="create"
            cancelText="Отмена"
            confirmText="Добавить"
            @cancel="showAddChildDialogFlag = false"
            @confirm="addChildItem"
            @keyup.esc="showAddChildDialogFlag = false"
        >
            <template #title> Добавить в "{{ parentItem?.name || '' }}" </template>
            <template #content>
                <div class="form-group">
                    <label for="child-type">Тип элемента</label>
                    <select id="child-type" v-model="childItemType" class="form-select">
                        <option value="folder">Папка</option>
                        <option value="note">Заметка</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="child-name">Название</label>
                    <input
                        id="child-name"
                        v-model="childItemName"
                        class="form-input"
                        placeholder="Название элемента"
                        ref="childItemInput"
                    />
                </div>
            </template>
        </ModalDialog>

        <!-- Edit Item Dialog -->
        <ModalDialog
            v-if="showEditDialogFlag"
            title="Редактировать элемент"
            status="update"
            cancelText="Отмена"
            confirmText="Применить"
            @cancel="showEditDialogFlag = false"
            @confirm="saveItemEdit"
            @keyup.esc="showEditDialogFlag = false"
        >
            <template #content>
                <div class="form-group">
                    <label for="edit-name">Название</label>
                    <input
                        id="edit-name"
                        v-model="editItemName"
                        class="form-input"
                        placeholder="Название элемента"
                        ref="editItemInput"
                    />
                </div>
            </template>
        </ModalDialog>

        <!-- Delete Confirmation Dialog -->

        <ModalDialog
            v-if="showDeleteDialog"
            status="delete"
            cancelText="Отмена"
            confirmText="Удалить"
            @cancel="showDeleteDialog = false"
            @confirm="deleteConfirmed"
            @keyup.esc="showDeleteDialog = false"
        >
            >
            <template #title>
                Удалить {{ itemToDelete?.type === 'folder' ? 'папку' : 'заметку' }}
            </template>
            <template #content>
                Вы уверены, что хотите удалить
                {{ itemToDelete?.type === 'folder' ? 'папку' : 'заметку' }} "{{
                    itemToDeleteName
                }}"?
                <template v-if="itemToDelete?.type === 'folder' && hasChildren(itemToDelete?.id)">
                    Это приведет к удалению всех вложенных элементов.
                </template>
            </template>
        </ModalDialog>
    </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, provide } from 'vue'
import SvgIcon from './ui/SvgIcon.vue'
import ModalDialog from './ModalDialog.vue'
import TreeNode from './TreeNode.vue'

// Типы данных
interface TreeItem {
    id: string
    name: string
    type: 'folder' | 'note'
    parentId: string | null
    updatedAt: Date
    content?: string
}

// Состояния
const treeItems = ref<TreeItem[]>([])
const expandedItems = reactive<Record<string, boolean>>({})
const activeItemId = ref<string | null>(null)

// Диалоги
const showNewItemDialog = ref(false)
const showAddChildDialogFlag = ref(false)
const showEditDialogFlag = ref(false)
const showDeleteDialog = ref(false)

// Форма нового элемента
const newItemName = ref('')
const newItemType = ref<'folder' | 'note'>('folder')
const newItemParentId = ref<string>('')
const newItemInput = ref<HTMLInputElement | null>(null)

// Форма добавления дочернего элемента
const parentItem = ref<TreeItem | null>(null)
const childItemName = ref('')
const childItemType = ref<'folder' | 'note'>('note')
const childItemInput = ref<HTMLInputElement | null>(null)

// Форма редактирования
const itemToEdit = ref<TreeItem | null>(null)
const editItemName = ref('')
const editItemInput = ref<HTMLInputElement | null>(null)

// Форма удаления
const itemToDelete = ref<TreeItem | null>(null)

// Вычисляемые свойства
const rootItems = computed(() => {
    return treeItems.value.filter((item) => item.parentId === null)
})

const folderItems = computed(() => {
    return treeItems.value.filter((item) => item.type === 'folder')
})

const isValidNewItem = computed(() => {
    if (!newItemName.value.trim()) return false
    if (newItemType.value === 'note' && !newItemParentId.value) return false
    return true
})

const itemToDeleteName = computed(() => {
    return itemToDelete.value?.name || ''
})

// Методы
const generateId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substring(2)
}

const getChildrenFor = (parentId: string) => {
    return treeItems.value.filter((item) => item.parentId === parentId)
}

const hasChildren = (itemId: string | undefined | null) => {
    if (!itemId) return false
    return treeItems.value.some((item) => item.parentId === itemId)
}

const getItemPath = (itemId: string) => {
    const paths: string[] = []
    let currentId: string | null = itemId

    while (currentId) {
        const item = treeItems.value.find((i) => i.id === currentId)
        if (!item) break

        paths.unshift(item.name)
        currentId = item.parentId
    }

    return paths.join(' / ')
}

const getItemById = (id: string): TreeItem | undefined => {
    return treeItems.value.find((item) => item.id === id)
}

const createItem = () => {
    if (!isValidNewItem.value) return

    const id = generateId()
    const newItem: TreeItem = {
        id,
        name: newItemName.value.trim(),
        type: newItemType.value,
        parentId: newItemType.value === 'note' ? newItemParentId.value : null,
        updatedAt: new Date(),
        content: newItemType.value === 'note' ? '' : undefined
    }

    treeItems.value.push(newItem)

    // Если это папка, раскрываем её родителя
    if (newItem.parentId) {
        expandedItems[newItem.parentId] = true
    }

    // Сбрасываем форму
    newItemName.value = ''
    showNewItemDialog.value = false

    // Делаем новый элемент активным
    activeItemId.value = id
}

const showAddChildDialog = (item: TreeItem) => {
    parentItem.value = item
    childItemName.value = ''
    childItemType.value = 'note'
    showAddChildDialogFlag.value = true
}

const addChildItem = () => {
    if (!parentItem.value || !childItemName.value.trim()) return

    const id = generateId()
    const newItem: TreeItem = {
        id,
        name: childItemName.value.trim(),
        type: childItemType.value,
        parentId: parentItem.value.id,
        updatedAt: new Date(),
        content: childItemType.value === 'note' ? '' : undefined
    }

    treeItems.value.push(newItem)

    // Раскрываем родителя, чтобы был виден новый элемент
    expandedItems[parentItem.value.id] = true

    // Сбрасываем форму
    childItemName.value = ''
    showAddChildDialogFlag.value = false

    // Делаем новый элемент активным
    activeItemId.value = id
}

const showEditDialog = (item: TreeItem) => {
    itemToEdit.value = item
    editItemName.value = item.name
    showEditDialogFlag.value = true
}

const saveItemEdit = () => {
    if (!itemToEdit.value || !editItemName.value.trim()) return

    const index = treeItems.value.findIndex((item) => item.id === itemToEdit.value?.id)
    if (index >= 0) {
        treeItems.value[index].name = editItemName.value.trim()
        treeItems.value[index].updatedAt = new Date()
    }

    showEditDialogFlag.value = false
}

const confirmDelete = (item: TreeItem) => {
    itemToDelete.value = item
    showDeleteDialog.value = true
}

const deleteConfirmed = () => {
    if (!itemToDelete.value) return

    // Если это папка, удаляем все дочерние элементы рекурсивно
    if (itemToDelete.value.type === 'folder') {
        deleteItemRecursively(itemToDelete.value.id)
    }

    // Удаляем сам элемент
    const index = treeItems.value.findIndex((item) => item.id === itemToDelete.value?.id)
    if (index >= 0) {
        treeItems.value.splice(index, 1)
    }

    // Если активный элемент был удален, сбрасываем выделение
    if (activeItemId.value === itemToDelete.value.id) {
        activeItemId.value = null
    }

    showDeleteDialog.value = false
}

const deleteItemRecursively = (itemId: string) => {
    // Находим все дочерние элементы
    const childrenIds = treeItems.value
        .filter((item) => item.parentId === itemId)
        .map((item) => item.id)

    // Рекурсивно удаляем все дочерние папки
    for (const childId of childrenIds) {
        const child = treeItems.value.find((item) => item.id === childId)
        if (child && child.type === 'folder') {
            deleteItemRecursively(childId)
        }
    }

    // Удаляем все дочерние элементы данного элемента
    treeItems.value = treeItems.value.filter((item) => item.parentId !== itemId)
}

const selectItem = (item: TreeItem) => {
    activeItemId.value = item.id
}

const toggleItem = (item: TreeItem) => {
    console.log(item)
    expandedItems[item.id] = !expandedItems[item.id]
    console.log(expandedItems[item.id])
}

// Наблюдатели за открытием диалогов для фокуса на полях ввода
watch(showNewItemDialog, async (isOpen) => {
    if (isOpen) {
        await nextTick()
        newItemInput.value?.focus()
    } else {
        newItemName.value = ''
        newItemType.value = 'folder'
        newItemParentId.value = ''
    }
})

watch(showAddChildDialogFlag, async (isOpen) => {
    if (isOpen) {
        await nextTick()
        childItemInput.value?.focus()
    } else {
        childItemName.value = ''
        parentItem.value = null
    }
})

watch(showEditDialogFlag, async (isOpen) => {
    if (isOpen) {
        await nextTick()
        editItemInput.value?.focus()
    } else {
        editItemName.value = ''
        itemToEdit.value = null
    }
})

// Инициализация с примерами
const initializeWithExamples = () => {
    // Примеры папок и заметок
    const examples: TreeItem[] = [
        {
            id: 'folder1',
            name: 'Работа',
            type: 'folder',
            parentId: null,
            updatedAt: new Date()
        },
        {
            id: 'folder2',
            name: 'Проекты',
            type: 'folder',
            parentId: 'folder1',
            updatedAt: new Date()
        },
        {
            id: 'note1',
            name: 'Список задач',
            type: 'note',
            parentId: 'folder1',
            updatedAt: new Date(),
            content: 'Мои задачи на сегодня...'
        },
        {
            id: 'folder3',
            name: 'Личное',
            type: 'folder',
            parentId: null,
            updatedAt: new Date()
        },
        {
            id: 'note2',
            name: 'Покупки',
            type: 'note',
            parentId: 'folder3',
            updatedAt: new Date(),
            content: 'Молоко, хлеб, яйца...'
        },
        {
            id: 'folder4',
            name: 'Путешествия',
            type: 'folder',
            parentId: 'folder3',
            updatedAt: new Date()
        },
        {
            id: 'note3',
            name: 'Идеи для отпуска',
            type: 'note',
            parentId: 'folder4',
            updatedAt: new Date(),
            content: 'Италия, Греция, Испания...'
        }
    ]
    return examples
}

provide('expandedItems', expandedItems)
provide('getChildrenFor', getChildrenFor)
expandedItems['folder3'] = true
// Инициализация
treeItems.value = initializeWithExamples()
</script>
