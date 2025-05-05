<template>
    <div class="editor-container">
        <MdEditor language="ru" v-model="text" />
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { MdEditor, config } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import RU from '@vavt/cm-extension/dist/locale/ru'
import { en_US } from 'md-editor-v3'
const props = defineProps<{
    text: string
}>()

config({
    editorConfig: {
        languageUserDefined: {
            ru: RU,
            'en-US': en_US
        }
    }
})
const text = ref('# Hello Editor')
</script>

<style scoped>
.editor-container {
    height: 100%; /* Занимает всю высоту родителя */
    display: flex;
    flex-direction: column;
}

.md-editor {
    flex: 1; /* Заставляет редактор растягиваться */
    height: 100%;
}
</style>
