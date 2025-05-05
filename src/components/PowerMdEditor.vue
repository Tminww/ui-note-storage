<template>
    <MdEditor
        language="ru"
        :modelValue="modelValue"
        @update:modelValue="emit('update:modelValue', $event)"
    />
</template>

<script setup lang="ts">
import { MdEditor, config } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import RU from '@vavt/cm-extension/dist/locale/ru'
import { en_US } from 'md-editor-v3'
defineProps<{
    modelValue: string
}>()

const emit = defineEmits<{
    'update:modelValue': [value: string]
}>()

config({
    editorConfig: {
        languageUserDefined: {
            ru: RU,
            'en-US': en_US
        }
    }
})
</script>

<style scoped>
.md-editor {
    height: 100%;
}
</style>
