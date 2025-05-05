<template>
    <div class="container">
        <!-- <SidebarComponent class="column left-column"> </SidebarComponent> -->
        <TreeListWidget class="column left-column" />

        <!-- <NotesListComponent class="column center-column"> </NotesListComponent> -->
        <!-- <div class="column right-column"></div> -->
        <NoteEditorComponent class="column right-column"></NoteEditorComponent>
        <!-- <MarkdpwnEditor class="column right-column"></MarkdpwnEditor> -->
    </div>
</template>

<script setup lang="ts">
import SidebarComponent from './components/Sidebar.vue'
import NotesListComponent from './components/NotesList.vue'
import NoteEditorComponent from './components/NoteEditor.vue'
import TreeListWidget from './components/TreeListWidget.vue'
</script>

<style scoped>
.container {
    display: flex;
    flex-direction: row;
    width: 100%;
    height: 100vh;
    overflow: hidden;
}

.column {
    height: 100%;
    position: relative;
    min-width: 100px; /* Минимальная ширина столбца */
}

.left-column {
    min-width: 450px;
    background-color: #f1f5f9;
    border-right: 1px solid #e2e8f0;
}

.center-column {
    min-width: 250px;

    border-color: #e2e8f0;
    border-right: 1px solid #e2e8f0;
}

.right-column {
    flex: 1;
    min-width: 250px;

    background-color: #f8fafc;
}
</style>
