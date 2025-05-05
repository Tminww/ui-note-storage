<template>
    <!-- Режим редактирования -->
    <div v-if="!isPreviewMode" class="md-editor-wrapper">
        <div class="md-toolbar">
            <button @click="insertMarkdown('**', '**')" title="Жирный текст" class="md-button">
                <b>B</b>
            </button>
            <button @click="insertMarkdown('*', '*')" title="Курсив" class="md-button">
                <i>I</i>
            </button>
            <button @click="insertMarkdown('# ', '')" title="Заголовок 1" class="md-button">
                H1
            </button>
            <button @click="insertMarkdown('## ', '')" title="Заголовок 2" class="md-button">
                H2
            </button>
            <button @click="insertMarkdown('### ', '')" title="Заголовок 3" class="md-button">
                H3
            </button>
            <button @click="insertMarkdown('- ', '')" title="Список" class="md-button">•</button>
            <button
                @click="insertMarkdown('1. ', '')"
                title="Нумерованный список"
                class="md-button"
            >
                1.
            </button>
            <button @click="insertMarkdown('[', '](url)')" title="Ссылка" class="md-button">
                🔗
            </button>
            <button
                @click="insertMarkdown('![alt text](', ')')"
                title="Изображение"
                class="md-button"
            >
                🖼️
            </button>
            <button @click="insertMarkdown('```\n', '\n```')" title="Блок кода" class="md-button">
                &lt;/&gt;
            </button>
            <button @click="insertMarkdown('> ', '')" title="Цитата" class="md-button">"</button>
            <button
                @click="insertMarkdown('---\n', '')"
                title="Горизонтальная линия"
                class="md-button"
            >
                —
            </button>
        </div>

        <textarea
            ref="mdTextarea"
            v-model="content"
            class="editor-content"
            placeholder="Начните писать здесь... (поддерживается Markdown)"
            @input="handleContentChange"
        ></textarea>
    </div>

    <!-- Режим предпросмотра -->
    <div v-else class="md-preview" v-html="renderedMarkdown"></div>
</template>

<script setup lang="ts"></script>
