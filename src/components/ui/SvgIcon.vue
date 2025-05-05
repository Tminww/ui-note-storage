<script setup lang="ts">
import { ref, computed, watch } from 'vue'

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
    'folder-open-outline',
    'chevron-down',
    'chevron-up',
    'chevron-right',
    'pencil',
    'chevron-left'
] as const

type ValidIconNames = (typeof iconNames)[number]
const props = defineProps<{
    name: ValidIconNames
    size?: string | number
    color?: string
}>()

// Создаем реактивную ссылку для хранения компонента SVG
const svgComponent = ref(null)

// Функция для загрузки компонента SVG
const loadSvgComponent = async (iconName: ValidIconNames) => {
    try {
        const module = await import(`@/assets/icons/${iconName}.svg`)
        svgComponent.value = module.default || module
    } catch (error) {
        console.error(`Ошибка загрузки иконки ${iconName}:`, error)
        svgComponent.value = null
    }
}

// Загружаем SVG при первоначальной загрузке
loadSvgComponent(props.name)

// Следим за изменениями свойства name и перезагружаем SVG
watch(
    () => props.name,
    (newName) => {
        loadSvgComponent(newName)
    }
)

// Преобразуем числа в строку с "px"
const iconWidth = computed(() =>
    typeof props.size === 'number' ? `${props.size}px` : props.size || '24px'
)
const iconHeight = computed(() =>
    typeof props.size === 'number' ? `${props.size}px` : props.size || '24px'
)
</script>

<template>
    <div class="svg-icon" :style="{ color: props.color || 'currentColor' }">
        <component v-if="svgComponent" :is="svgComponent" :width="iconWidth" :height="iconHeight" />
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
