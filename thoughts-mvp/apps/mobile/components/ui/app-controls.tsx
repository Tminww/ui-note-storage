import React from 'react'
import {
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Switch,
    TextInput
} from 'react-native'
import { SafeAreaView } from './safe-area'
import { Ionicons } from '@react-native-vector-icons/ionicons'
import { useResolveClassNames } from 'uniwind'
import { Box, Text, Heading } from './surfaces'
import { Button, ButtonText } from './button'

export type IconName = React.ComponentProps<typeof Ionicons>['name']
export function Icon({
    name,
    tone = 'text-muted-foreground',
    size = 22
}: {
    name: IconName
    tone?: string
    size?: number
}) {
    const style = useResolveClassNames(tone)
    return <Ionicons name={name} size={size} color={style.color as string} />
}
export function Action({
    children,
    onPress,
    disabled = false,
    secondary = false
}: {
    children: React.ReactNode
    onPress: () => void
    disabled?: boolean
    secondary?: boolean
}) {
    return (
        <Button
            onPress={onPress}
            disabled={disabled}
            variant={secondary ? 'outline' : 'default'}
            size="lg"
            className="rounded-full data-[disabled=true]:opacity-50"
        >
            <ButtonText variant={secondary ? 'outline' : 'default'}>{children}</ButtonText>
        </Button>
    )
}
export function Field({
    label,
    ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
    return (
        <Box className="gap-2">
            <Text className="text-sm font-semibold">{label}</Text>
            <TextInput
                accessibilityLabel={label}
                className="min-h-14 rounded-2xl border border-input bg-card px-4 py-3 text-base text-foreground placeholder:text-muted-foreground"
                {...props}
            />
        </Box>
    )
}
export function Info({
    children,
    warning = false
}: {
    children: React.ReactNode
    warning?: boolean
}) {
    return (
        <Box
            className={`flex-row items-start gap-3 rounded-3xl p-4 ${warning ? 'bg-warning' : 'bg-secondary'}`}
        >
            <Icon
                name={warning ? 'cloud-offline-outline' : 'information-circle-outline'}
                tone={warning ? 'text-warning-foreground' : 'text-primary'}
            />
            <Text
                className={`flex-1 text-sm leading-5 ${warning ? 'text-warning-foreground' : 'text-foreground'}`}
            >
                {children}
            </Text>
        </Box>
    )
}
export function Toggle({
    title,
    caption,
    value,
    onChange
}: {
    title: string
    caption?: string
    value: boolean
    onChange: (value: boolean) => void
}) {
    const primary = useResolveClassNames('bg-primary')
    const thumb = useResolveClassNames('text-primary-foreground')
    return (
        <Box className="min-h-20 flex-row items-center gap-4 border-b border-border px-4 py-4">
            <Box className="flex-1 gap-1">
                <Text className="text-base font-semibold">{title}</Text>
                {caption ? (
                    <Text className="text-sm leading-5 text-muted-foreground">{caption}</Text>
                ) : null}
            </Box>
            <Switch
                accessibilityLabel={title}
                value={value}
                onValueChange={onChange}
                trackColor={{ true: primary.backgroundColor as string }}
                thumbColor={thumb.color as string}
                {...(Platform.OS === 'web' ? { activeThumbColor: thumb.color as string } : {})}
            />
        </Box>
    )
}
export function Sheet({
    visible,
    onClose,
    children,
    title
}: {
    visible: boolean
    onClose: () => void
    children: React.ReactNode
    title: string
}) {
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                className="flex-1 justify-end bg-foreground/30"
            >
                <Pressable
                    accessibilityLabel="Закрыть окно"
                    className="absolute inset-0"
                    onPress={onClose}
                />
                <SafeAreaView edges={['bottom']} className="max-h-full rounded-t-3xl bg-card">
                    <ScrollView
                        keyboardShouldPersistTaps="handled"
                        contentContainerClassName="gap-5 p-6"
                    >
                        <Box className="flex-row items-center justify-between">
                            <Heading>{title}</Heading>
                            <Pressable
                                accessibilityLabel="Закрыть"
                                onPress={onClose}
                                className="h-12 w-12 items-center justify-center"
                            >
                                <Icon name="close" />
                            </Pressable>
                        </Box>
                        {children}
                    </ScrollView>
                </SafeAreaView>
            </KeyboardAvoidingView>
        </Modal>
    )
}
export function confirmDelete(title: string, action: () => void) {
    if (Platform.OS === 'web') {
        if (window.confirm(title)) action()
    } else
        Alert.alert(title, 'Изменение сохранится на телефоне и синхронизируется с Notion.', [
            { text: 'Отмена', style: 'cancel' },
            { text: 'Удалить', style: 'destructive', onPress: action }
        ])
}
