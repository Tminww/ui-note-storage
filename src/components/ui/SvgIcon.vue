<script setup lang="ts">
import { shallowRef, computed, watch } from 'vue'
import { markRaw } from 'vue'

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

// Use shallowRef instead of ref for external components
const svgComponent = shallowRef(null)

// Function to load SVG component
const loadSvgComponent = async (iconName: ValidIconNames) => {
    try {
        const module = await import(`@/assets/icons/${iconName}.svg`)
        // Use markRaw to prevent the component from becoming reactive
        svgComponent.value = markRaw(module.default || module)
    } catch (error) {
        console.error(`Error loading icon ${iconName}:`, error)
        svgComponent.value = null
    }
}

// Load SVG on initial load
loadSvgComponent(props.name)

// Watch for name property changes and reload SVG
watch(
    () => props.name,
    (newName) => {
        loadSvgComponent(newName)
    }
)

// Convert numbers to string with "px"
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
