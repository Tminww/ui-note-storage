<script setup lang="ts">
import { computed } from 'vue'
import SvgIcon from './ui/SvgIcon.vue'

const {
    title = 'Просмотреть',
    status = 'read',
    cancelText = 'Отменить',
    confirmText = 'Применить'
} = defineProps<{
    title?: string
    status: 'create' | 'update' | 'read' | 'delete'
    cancelText: string
    confirmText: string
}>()

defineEmits<{
    cancel(): null
    confirm(): null
}>()

const confirmButtonStatus = computed(() => {
    return `${status}-button`
})
</script>

<template>
    <div class="dialog-overlay" @click="$emit('cancel')">
        <div class="dialog-content" @click.stop>
            <div class="dialog-header">
                <h3 class="dialog-title">
                    <slot name="title"> {{ title }}</slot>
                </h3>
                <button @click="$emit('cancel')" class="btn-with-icon">
                    <SvgIcon name="close" size="20" />
                </button>
            </div>
            <div class="dialog-body">
                <p class="content-text">
                    <slot name="content"></slot>
                </p>
                <div class="dialog-actions">
                    <button class="cancel-button" @click="$emit('cancel')">{{ cancelText }}</button>
                    <button :class="confirmButtonStatus" @click="$emit('confirm')">
                        {{ confirmText }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.dialog-content {
    background-color: white;
    border-radius: 8px;
    width: 90%;
    max-width: 400px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    overflow: hidden;
}

.dialog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid #e2e8f0;
}

.dialog-title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
}

.dialog-body {
    padding: 16px;
}

.form-group {
    margin-bottom: 16px;
}

.form-group label {
    display: block;
    margin-bottom: 8px;
    font-weight: 500;
    color: #475569;
}

.form-input,
.form-select {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    font-size: 16px;
}

.form-input:focus,
.form-select:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
}

.content-text {
    margin-bottom: 24px;
    color: #475569;
}

.dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 16px;
}

.cancel-button {
    padding: 8px 16px;
    background-color: #f1f5f9;
    color: #475569;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
}

.cancel-button:hover {
    background-color: #e2e8f0;
}
.read-button,
.update-button,
.create-button {
    padding: 8px 16px;
    background-color: #3b82f6;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
}

.read-button:hover,
.update-button:hover,
.create-button:hover {
    background-color: #2563eb;
}
.read-button:disabled,
.update-button:disabled,
.create-button:disabled {
    background-color: #93c5fd;
    cursor: not-allowed;
}

.delete-button {
    padding: 8px 16px;
    background-color: #ef4444;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
}

.delete-button:hover {
    background-color: #dc2626;
}
</style>
