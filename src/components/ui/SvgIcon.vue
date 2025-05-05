<script setup lang="ts">
import { defineAsyncComponent, computed, watch, ref } from 'vue'

const iconNames = [
    'close',
    'plus',
    'content-save-check-outline',
    'file-document-edit-outline',
    'file-document-plus-outline',
    'folder-plus-outline',
    'trash-can-outline',
    'file-document-outline',
    'folder-outline',
    'folder-open-outline'
] as const

type ValidIconNames = (typeof iconNames)[number]
const props = defineProps<{
    name: ValidIconNames
    size?: string | number
    color?: string
}>()

// Загружаем иконку асинхронно с учетом текущего имени
const getIcon = computed(() => {
    console.log('getIcon', props.name)
    return defineAsyncComponent({
        loader: () => import(`@/assets/icons/${props.name}.svg`),
        suspensible: true
    })
})

// Преобразуем числа в строку с "px"
const iconWidth = computed(() =>
    typeof props.size === 'number' ? `${props.size}px` : props.size || '24px'
)
const iconHeight = computed(() =>
    typeof props.size === 'number' ? `${props.size}px` : props.size || '24px'
)
</script>

<template>
    <!-- Добавляем key для принудительного пересоздания компонента при изменении name -->
    <div class="svg-icon" :style="{ color: props.color || 'currentColor' }">
        <component :is="getIcon" :key="props.name" :width="iconWidth" :height="iconHeight" />
    </div>
</template>

<style scoped>
.svg-icon :deep(svg path),
.svg-icon :deep(svg rect),
.svg-icon :deep(svg circle),
.svg-icon :deep(svg polygon),
.svg-icon :deep(svg line) {
    fill: currentColor;
}
.svg-icon :deep(svg) {
    display: inline-block;
    vertical-align: middle;
    color: inherit;
}
</style>
