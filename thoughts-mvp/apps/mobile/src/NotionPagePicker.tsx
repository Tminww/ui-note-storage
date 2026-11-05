import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable } from 'react-native'
import { Action, Field, Icon, Info } from '../components/ui/app-controls'
import { Box, Text } from '../components/ui/surfaces'
import { searchNotionPages, type NotionPageChoice } from './notionStorage'

export function NotionPagePicker({ token, disabled, onSelect, onCancel }: {
    token?: string
    disabled?: boolean
    onSelect: (page: NotionPageChoice) => void
    onCancel: () => void
}) {
    const [query, setQuery] = useState('')
    const [pages, setPages] = useState<NotionPageChoice[]>([])
    const [cursor, setCursor] = useState<string>()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [retry, setRetry] = useState(0)
    const requestId = useRef(0)

    useEffect(() => {
        let active = true
        const timer = setTimeout(() => {
            void searchNotionPages(query, undefined, token).then((result) => {
                if (!active) return
                setPages(result.pages)
                setCursor(result.cursor)
            }).catch((e) => {
                if (active) setError(e.message)
            }).finally(() => {
                if (active) setLoading(false)
            })
        }, query ? 300 : 0)
        return () => {
            active = false
            clearTimeout(timer)
        }
    }, [query, retry, token])

    const resetSearch = () => {
        requestId.current++
        setLoading(true)
        setError('')
        setPages([])
        setCursor(undefined)
    }

    return (
        <Box className="gap-2">
            <Field label="Найти страницу" placeholder="Название страницы" value={query} maxLength={100}
                editable={!disabled} onChangeText={(text) => {
                    if (text === query) return
                    resetSearch()
                    setQuery(text)
                }} />
            {loading ? <ActivityIndicator accessibilityLabel="Загружаем страницы" /> : null}
            {error ? <>
                <Info warning>{error}</Info>
                <Action secondary disabled={disabled} onPress={() => {
                    resetSearch()
                    setRetry(retry + 1)
                }}>Повторить поиск</Action>
            </> : null}
            {!loading && !error && !pages.length ? (
                <>
                    <Text className="text-sm text-muted-foreground">
                        {query ? 'Страницы с таким названием не найдены.' : 'Пока нет доступных страниц. Дай Thoughts доступ в Notion.'}
                    </Text>
                    <Action secondary disabled={disabled} onPress={() => {
                        resetSearch()
                        setRetry(retry + 1)
                    }}>Обновить список</Action>
                </>
            ) : null}
            {pages.map((page) => (
                <Pressable key={page.id} accessibilityRole="button" disabled={disabled}
                    onPress={() => onSelect(page)} className="min-h-12 flex-row items-center gap-3 border-b border-border px-2">
                    <Icon name="document-outline" size={18} />
                    <Text className="flex-1 py-2">{page.title}</Text>
                </Pressable>
            ))}
            {cursor && !loading ? (
                <Action secondary disabled={disabled} onPress={() => {
                    const request = ++requestId.current
                    setLoading(true)
                    void searchNotionPages(query, cursor, token).then((result) => {
                        if (request !== requestId.current) return
                        setPages([...pages, ...result.pages.filter((page) => !pages.some((item) => item.id === page.id))])
                        setCursor(result.cursor)
                    }).catch((e) => {
                        if (request === requestId.current) setError(e.message)
                    }).finally(() => {
                        if (request === requestId.current) setLoading(false)
                    })
                }}>Показать ещё</Action>
            ) : null}
            <Action secondary disabled={disabled} onPress={onCancel}>Отмена</Action>
        </Box>
    )
}
