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
            <div v-if="isExpanded && children.length > 0" class="children-container">
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
                />
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

.tree-node-header {
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
    margin-left: 16px;
}

/* Анимации */
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

.expand-enter-active,
.expand-leave-active {
    transition: all 0.3s ease;
    overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
    opacity: 0;
    max-height: 0;
}
</style>
