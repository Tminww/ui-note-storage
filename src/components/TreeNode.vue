<template>
    <div class="tree-node" :style="{ marginLeft: `${level * 16}px` }">
        <div
            class="tree-node-header"
            :class="{
                'active-item': activeId === item.id,
                'folder-node': item.type === 'folder',
                'note-node': item.type === 'note'
            }"
            @click="handleSelect"
            @dblclick="handleDoubleClick"
        >
            <div class="tree-node-info">
                <!-- Toggle button shown only for folders -->
                <span v-if="item.type === 'folder'" class="toggle-icon" @click.stop="handleToggle">
                    <Transition name="fade" mode="out-in">
                        <SvgIcon
                            :key="isExpanded ? 'expanded' : 'collapsed'"
                            :name="isExpanded ? 'chevron-down' : 'chevron-right'"
                            size="16"
                        />
                    </Transition>
                </span>
                <span v-else class="toggle-placeholder"></span>

                <!-- Icon based on type -->
                <Transition name="fade" mode="out-in">
                    <SvgIcon
                        :key="item.type"
                        :name="item.type === 'folder' ? 'folder-outline' : 'file-document-outline'"
                        size="20"
                    />
                </Transition>

                <!-- Item name -->
                <span class="tree-node-name">{{ item.name }}</span>
            </div>

            <!-- Actions -->
            <div class="tree-node-actions">
                <!-- Add button for folders -->
                <button
                    v-if="item.type === 'folder'"
                    @click.stop="handleAdd"
                    class="btn-with-icon"
                    title="Добавить элемент"
                >
                    <SvgIcon name="plus" size="16" />
                </button>

                <!-- Edit button -->
                <button @click.stop="handleEdit" class="btn-with-icon" title="Редактировать">
                    <SvgIcon name="pencil" size="16" />
                </button>

                <!-- Delete button -->
                <button @click.stop="handleDelete" class="btn-with-icon" title="Удалить">
                    <SvgIcon name="trash-can-outline" size="16" />
                </button>
            </div>
        </div>

        <!-- Children container with transition -->
        <Transition name="fade" mode="out-in">
            <div v-if="isExpanded" class="children-container">
                <div v-if="children.length > 0">
                    <TreeNode
                        v-for="child in children"
                        :key="child.id"
                        :item="child"
                        :children="getGrandchildren(child.id)"
                        :level="level + 1"
                        :active-id="activeId"
                        @select="(childId) => $emit('select', childId)"
                        @toggle="(childId) => $emit('toggle', childId)"
                        @add="(childId) => $emit('add', childId)"
                        @edit="(childId) => $emit('edit', childId)"
                        @delete="(childId) => $emit('delete', childId)"
                        @open="(childId) => $emit('open', childId)"
                    />
                </div>
                <div v-else class="empty-folder-message">
                    <span class="empty-folder-text">Нет файлов</span>
                </div>
            </div>
        </Transition>
    </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import SvgIcon from './ui/SvgIcon.vue'

// Определения типов
interface TreeItem {
    id: string
    name: string
    type: 'folder' | 'note'
    parentId: string | null
    updatedAt: Date
    content?: string
}

// Свойства
const props = defineProps<{
    item: TreeItem
    children: TreeItem[]
    level: number
    activeId: string | null
}>()

// События
const emit = defineEmits<{
    (e: 'select', item: TreeItem): void
    (e: 'toggle', item: TreeItem): void
    (e: 'add', item: TreeItem): void
    (e: 'edit', item: TreeItem): void
    (e: 'delete', item: TreeItem): void
    (e: 'open', item: TreeItem): void
}>()

// Инжектируем функцию для получения дочерних элементов и статус развернутых элементов
const expandedItems = inject<Record<string, boolean>>('expandedItems', {})
const getChildrenFor = inject<(parentId: string) => TreeItem[]>('getChildrenFor', () => [])

// Вычисляемые свойства
const isExpanded = computed(() => {
    return !!expandedItems[props.item.id]
})

// Методы
const getGrandchildren = (parentId: string) => {
    return getChildrenFor(parentId)
}

const handleSelect = () => {
    emit('select', props.item)
}

const handleDoubleClick = () => {
    if (props.item.type === 'folder') {
        // Для папок переключаем состояние раскрытия
        emit('toggle', props.item)
    } else if (props.item.type === 'note') {
        // Для заметок отправляем событие открытия
        emit('open', props.item)
    }
}

const handleToggle = () => {
    if (props.item.type === 'folder') {
        emit('toggle', props.item)
    }
}

const handleAdd = () => {
    emit('add', props.item)
}

const handleEdit = () => {
    emit('edit', props.item)
}

const handleDelete = () => {
    emit('delete', props.item)
}
</script>

<style scoped>
.tree-node {
    position: relative;
}

/* Добавляем вертикальные линии */
.tree-node:not(:last-child)::before {
    content: '';
    position: absolute;
    top: 24px; /* Высота заголовка */
    left: 8px;
    width: 1px;
    height: calc(100% - 24px);
    background-color: #cbd5e1;
}

/* Линия, соединяющая с родителем */
.tree-node-header::before {
    content: '';
    position: absolute;
    top: 50%;
    left: -8px;
    width: 8px;
    height: 1px;
    background-color: #cbd5e1;
}
.tree-node-header {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 8px;
    border-radius: 4px;
    margin: 2px 0;
    cursor: pointer;
    transition: background-color 0.2s ease;
}

.tree-node-header:hover {
    background-color: #f1f5f9;
}

.active-item {
    background-color: #e2e8f0;
    font-weight: 500;
}

.folder-node:hover {
    background-color: #dbeafe;
}

.note-node:hover {
    background-color: #dbeafe;
}

.tree-node-info {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
}

.tree-node-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.tree-node-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.2s ease;
}

.tree-node-header:hover .tree-node-actions {
    opacity: 1;
}

.toggle-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    cursor: pointer;
}

.toggle-placeholder {
    width: 16px;
}

.children-container {
    position: relative;
    margin-left: 16px;
    padding-left: 8px; /* Отступ для вертикальной линии */
}
/* Анимации */

.children-container {
    margin-left: 16px;
}

.empty-folder-message {
    padding: 6px 8px;
    margin-left: 16px;
    color: #94a3b8;
    font-style: italic;
    font-size: 0.9rem;
}

.empty-folder-text {
    margin-left: 6px;
}
</style>
