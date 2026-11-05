import React, { useEffect, useState } from 'react'
import { Platform, Pressable, ScrollView } from 'react-native'
import { Box, Text } from '../components/ui/surfaces'
import { Action, Field, Icon, Info, Toggle, type IconName } from '../components/ui/app-controls'
import { api, getApiUrl, saveApiUrl, type Settings } from './api'
import { localRepository, syncSnapshot, retryLocalData, importServerData, changeNotionConnection } from './localService'
import { getManualNotionRoot, getNotionOAuth, getNotionRoot, hasSecret, readSecret, saveNotionOAuth, saveSecret, setNotionRoot } from './deviceConfig'
import { parseNotionProjectPage, verifyNotionConnection } from './notionStorage'
import { authorizeNotionStorage, notionOAuthService } from './notionOAuth'
import { NotionPagePicker } from './NotionPagePicker'
import { connectNotionMcp, notionMcpDisconnect, notionMcpIsConnected } from './notionMcp'
import { accents } from './useAppearance'
import type { Preferences } from './localCore'
import type { useAutomaticUpdates } from './useAutomaticUpdates'

export type Section = 'home' | 'voice' | 'appearance' | 'notion' | 'ai' | 'updates'
export const sectionTitles: Record<Section, string> = {
    home: 'Настройки',
    voice: 'Голос',
    appearance: 'Оформление',
    notion: 'Notion',
    ai: 'Искусственный интеллект',
    updates: 'Обновления'
}
export const rgb = (value: string) => `rgb(${value.split(' ').join(',')})`
export function SettingsScreen({
    section,
    setSection,
    preferences,
    dark,
    updates,
    onNotice,
    onError
}: {
    section: Section
    setSection: (value: Section) => void
    preferences: Preferences
    dark: boolean
    updates: ReturnType<typeof useAutomaticUpdates>
    onNotice: (value: string) => void
    onError: (value: string) => void
}) {
    const [busy, setBusy] = useState(false)
    const [settings, setSettings] = useState<Settings | null>(null)
    const [root, setRoot] = useState(getManualNotionRoot())
    const [notionToken, setNotionToken] = useState('')
    const [aiToken, setAiToken] = useState('')
    const [hasAI, setHasAI] = useState(false)
    const [hasNotion, setHasNotion] = useState(false)
    const [server, setServer] = useState(getApiUrl())
    const [mcp, setMcp] = useState(false)
    const [manualNotion, setManualNotion] = useState(!notionOAuthService)
    const [authorization, setAuthorization] = useState<Awaited<ReturnType<typeof authorizeNotionStorage>>>(null)
    const [pickNotionPage, setPickNotionPage] = useState(false)
    const oauth = getNotionOAuth()
    const sync = syncSnapshot()
    const pending = localRepository
        .snapshot()
        .thoughts.filter(
            (t) => !t.deleted && t.notion[getNotionRoot()]?.revision !== t.revision
        ).length
    useEffect(() => {
        void Promise.all([
            api.settings(),
            hasSecret('openrouter'),
            readSecret('notion'),
            notionMcpIsConnected()
        ])
            .then(([s, a, n, m]) => {
                setSettings(s)
                setHasAI(a)
                setHasNotion(Boolean(n))
                setMcp(m)
            })
            .catch((e) => onError(e.message))
    }, [onError])
    const run = async (fn: () => Promise<unknown>) => {
        setBusy(true)
        onError('')
        try {
            await fn()
        } catch (e) {
            onError(e instanceof Error ? e.message : String(e))
        } finally {
            setBusy(false)
        }
    }
    const activateNotionPage = async (id: string, credentials: NonNullable<typeof authorization>) => {
        const rootId = parseNotionProjectPage(id)
        if (!rootId) throw new Error('Выбери страницу Notion')
        const pageTitle = await verifyNotionConnection(rootId, credentials.accessToken)
        await changeNotionConnection(() => saveNotionOAuth({ ...credentials, root: rootId, pageTitle }))
        setAuthorization(null)
        setPickNotionPage(false)
        onNotice(`Подключено к Notion · ${pageTitle}`)
    }
    const startNotion = () => void run(async () => {
        const tokens = await authorizeNotionStorage()
        if (!tokens) return
        setAuthorization(tokens)
        setPickNotionPage(true)
        if (tokens.templatePageId) await activateNotionPage(tokens.templatePageId, tokens)
    })
    const preference = (patch: Partial<Preferences>) =>
        void localRepository.preferences(patch).catch((e) => onError(e.message))
    const row = (name: string, caption: string, icon: IconName, target: Section) => (
        <Pressable
            key={target}
            onPress={() => setSection(target)}
            className="min-h-20 flex-row items-center gap-4 border-b border-border bg-card px-4 py-4"
        >
            <Icon name={icon} tone="text-primary" />
            <Box className="flex-1 gap-1">
                <Text className="text-base font-semibold">{name}</Text>
                <Text className="text-sm text-muted-foreground">{caption}</Text>
            </Box>
            <Icon name="chevron-forward" size={18} />
        </Pressable>
    )
    let content: React.ReactNode
    if (section === 'home')
        content = (
            <>
                <Info>
                    Мысли всегда хранятся на телефоне. AI дополняет их после подключения, а Notion
                    получает копию, если настроен.
                </Info>
                <Box className="overflow-hidden rounded-3xl border border-border">
                    {row('Голос', 'Диктовка и приватность', 'mic-outline', 'voice')}
                    {row(
                        'Оформление',
                        'Тема и цвет акцента',
                        'color-palette-outline',
                        'appearance'
                    )}
                    {row(
                        'Notion',
                        sync.notionConfigured
                            ? `${pending} изменений ждут синхронизации`
                            : 'Не подключён',
                        'cloud-outline',
                        'notion'
                    )}
                    {row(
                        'Искусственный интеллект',
                        sync.aiConfigured ? 'Готов к обработке' : 'Нужно настроить',
                        'sparkles-outline',
                        'ai'
                    )}
                    {row(
                        'Обновления',
                        updates.enabled ? 'Через Expo' : 'Нужен новый APK',
                        'refresh-outline',
                        'updates'
                    )}
                </Box>
            </>
        )
    else if (section === 'voice')
        content = (
            <>
                <Text className="text-sm font-semibold text-muted-foreground">Диктовка</Text>
                <Box className="overflow-hidden rounded-3xl border border-border bg-card">
                    <Box className="gap-1 border-b border-border p-4">
                        <Text className="text-base font-semibold">Язык диктовки</Text>
                        <Text className="text-sm text-muted-foreground">Русский · ru-RU</Text>
                    </Box>
                    <Toggle
                        title="Только на устройстве"
                        caption="Нужен русский офлайн-пакет"
                        value={preferences.voiceOnDevice}
                        onChange={(v) => preference({ voiceOnDevice: v })}
                    />
                    <Toggle
                        title="Проверять текст перед сохранением"
                        caption="Можно поправить распознанное"
                        value={preferences.voiceReview}
                        onChange={(v) => preference({ voiceReview: v })}
                    />
                    <Toggle
                        title="Виброотклик"
                        caption="При старте записи и сохранении"
                        value={preferences.haptics}
                        onChange={(v) => preference({ haptics: v })}
                    />
                </Box>
                <Info>
                    Аудио не отправляется в Thoughts API и не сохраняется. Системный распознаватель
                    может передавать его своему провайдеру. Проверяй текст перед сохранением.
                </Info>
            </>
        )
    else if (section === 'appearance')
        content = (
            <>
                <Text className="text-sm font-semibold text-muted-foreground">Тема</Text>
                <Box className="flex-row rounded-2xl bg-muted p-1">
                    {(
                        [
                            { id: 'light', name: 'Светлая' },
                            { id: 'dark', name: 'Тёмная' },
                            { id: 'system', name: 'Как в системе' }
                        ] as const
                    ).map((t) => (
                        <Pressable
                            key={t.id}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: preferences.theme === t.id }}
                            onPress={() => preference({ theme: t.id })}
                            className={`min-h-12 flex-1 items-center justify-center rounded-xl ${preferences.theme === t.id ? 'bg-card' : ''}`}
                        >
                            <Text className="text-sm font-semibold">{t.name}</Text>
                        </Pressable>
                    ))}
                </Box>
                <Text className="text-sm font-semibold text-muted-foreground">Цвет акцента</Text>
                <Box className="flex-row justify-between">
                    {accents.map((a) => (
                        <Pressable
                            key={a.id}
                            accessibilityRole="radio"
                            accessibilityLabel={a.name}
                            accessibilityState={{ checked: preferences.accent === a.id }}
                            onPress={() => preference({ accent: a.id })}
                            className="items-center gap-2"
                        >
                            <Box
                                className="h-12 w-12 items-center justify-center rounded-full"
                                style={{ backgroundColor: rgb(dark ? a.dark : a.light) }}
                            >
                                {preferences.accent === a.id ? (
                                    <Icon
                                        name="checkmark"
                                        tone="text-primary-foreground"
                                        size={28}
                                    />
                                ) : null}
                            </Box>
                            <Text className="text-xs">{a.name}</Text>
                        </Pressable>
                    ))}
                </Box>
                <Box className="gap-4 rounded-3xl border border-border bg-card p-4">
                    <Text className="text-sm text-muted-foreground">Так это выглядит</Text>
                    <Text className="text-base leading-6">Сделать виджет на главный экран</Text>
                    <Action onPress={() => {}}>Сохранить</Action>
                </Box>
                <Box className="overflow-hidden rounded-3xl border border-border bg-card">
                    <Toggle
                        title="Свой цвет у каждого проекта"
                        caption="Метка на карточке мысли"
                        value={preferences.projectColors}
                        onChange={(v) => preference({ projectColors: v })}
                    />
                </Box>
            </>
        )
    else if (section === 'notion')
        content = (
            <>
                <Info warning={!sync.notionConfigured}>
                    {sync.notionConfigured
                        ? `Notion настроен. ${pending} изменений ждут синхронизации.`
                        : 'Пока Notion не подключён, мысли хранятся только на телефоне.'}
                </Info>
                {Platform.OS === 'web' ? (
                    <Text className="text-sm text-muted-foreground">Подключение Notion доступно в приложении Android и iOS.</Text>
                ) : pickNotionPage ? (
                    <NotionPagePicker token={authorization?.accessToken} disabled={busy}
                        onSelect={(page) => {
                            const credentials = authorization || getNotionOAuth()
                            if (credentials) void run(() => activateNotionPage(page.id, credentials))
                        }}
                        onCancel={() => {
                            setAuthorization(null)
                            setPickNotionPage(false)
                        }}
                    />
                ) : (
                    <>
                        {oauth ? (
                            <Box className="gap-2 rounded-2xl border border-border bg-card p-4">
                                <Text className="text-sm text-muted-foreground">{oauth.workspaceName || 'Рабочее пространство Notion'}</Text>
                                <Text className="text-base font-semibold">{oauth.pageTitle}</Text>
                                <Action secondary disabled={busy} onPress={() => setPickNotionPage(true)}>Выбрать другую страницу</Action>
                                {notionOAuthService ? <Action secondary disabled={busy} onPress={startNotion}>Подключить заново</Action> : null}
                                <Action secondary disabled={busy} onPress={() => void run(async () => {
                                    await changeNotionConnection(() => saveNotionOAuth(null))
                                    onNotice('Вход в Notion отключён на этом устройстве')
                                })}>Отключить вход через Notion</Action>
                            </Box>
                        ) : notionOAuthService ? (
                            <>
                                <Action disabled={busy || !sync.online} onPress={startNotion}>Подключить Notion</Action>
                                <Text className="text-sm text-muted-foreground">
                                    После выбора страницы в неё будут синхронизироваться мысли с телефона.
                                </Text>
                            </>
                        ) : null}
                        <Action secondary disabled={busy} onPress={() => setManualNotion(!manualNotion)}>
                            {manualNotion ? 'Скрыть ручную настройку' : 'Подключить вручную'}
                        </Action>
                        {manualNotion ? <>
                            <Field
                                label="1. Токен интеграции"
                                placeholder={
                                    hasNotion
                                        ? 'Сохранён. Оставь пустым, чтобы не менять'
                                        : 'Вставь токен из Notion'
                                }
                                secureTextEntry
                                autoCapitalize="none"
                                value={notionToken}
                                onChangeText={setNotionToken}
                            />
                            <Text className="text-sm leading-5 text-muted-foreground">
                                Создай внутреннюю интеграцию в Notion и дай ей доступ к выбранной странице через
                                «Подключения».
                            </Text>
                            <Field
                                label="2. Страница для мыслей"
                                placeholder="Ссылка или ID страницы"
                                autoCapitalize="none"
                                value={root}
                                onChangeText={setRoot}
                            />
                            <Text className="text-sm font-semibold">3. Проверка и синхронизация</Text>
                            <Action
                                disabled={busy}
                                onPress={() =>
                                    void run(async () => {
                                        const id = parseNotionProjectPage(root)
                                        const token = notionToken.trim() || await readSecret('notion')
                                        if (!id || !token) throw new Error('Укажи страницу и токен Notion')
                                        await verifyNotionConnection(id, token)
                                        await changeNotionConnection(async () => {
                                            if (notionToken.trim()) await saveSecret('notion', token)
                                            await setNotionRoot(id)
                                            if (oauth) await saveNotionOAuth(null)
                                        })
                                        setNotionToken('')
                                        setHasNotion(true)
                                        onNotice('Подключение проверено. Очередь синхронизируется с Notion.')
                                    })
                                }
                            >
                                Подключить и синхронизировать
                            </Action>
                        </> : null}
                    </>
                )}
                <Info>
                    Локальная копия останется на телефоне. При обрыве сети изменения дождутся
                    повторной отправки.
                </Info>
                {sync.error ? <Info warning>{sync.error}</Info> : null}
                <Action
                    secondary
                    disabled={busy}
                    onPress={() =>
                        void run(async () => {
                            if (mcp) {
                                await notionMcpDisconnect()
                                setMcp(false)
                            } else {
                                await connectNotionMcp()
                                setMcp(true)
                            }
                        })
                    }
                >
                    {mcp ? 'Отключить контекст Notion MCP' : 'Подключить контекст Notion MCP'}
                </Action>
            </>
        )
    else if (section === 'ai')
        content = (
            <>
                <Info>
                    Обработка идёт через интернет. До подключения AI исходный текст остаётся в
                    очереди на телефоне.
                </Info>
                <Field
                    label="OpenRouter API key"
                    secureTextEntry
                    autoCapitalize="none"
                    placeholder={hasAI ? 'Ключ сохранён' : 'Вставь свой ключ'}
                    value={aiToken}
                    onChangeText={setAiToken}
                />
                <Action
                    disabled={busy || !aiToken.trim() || Platform.OS === 'web'}
                    onPress={() =>
                        void run(async () => {
                            await saveSecret('openrouter', aiToken)
                            setAiToken('')
                            setHasAI(true)
                            await retryLocalData()
                            onNotice('AI подключён. Очередь готова к обработке.')
                        })
                    }
                >
                    Подключить AI
                </Action>
                {settings ? (
                    <>
                        <Field
                            label="Модель названия и резюме"
                            value={settings.generatorModel}
                            autoCapitalize="none"
                            onChangeText={(v) => setSettings({ ...settings, generatorModel: v })}
                        />
                        <Field
                            label="Модель классификации"
                            value={settings.decisionModel}
                            autoCapitalize="none"
                            onChangeText={(v) => setSettings({ ...settings, decisionModel: v })}
                        />
                        <Text className="text-sm font-semibold">Порог уверенности</Text>
                        <Box className="flex-row gap-2">
                            {[0.5, 0.6, 0.7, 0.8, 0.9].map((v) => (
                                <Pressable
                                    key={v}
                                    onPress={() =>
                                        setSettings({ ...settings, confidenceThreshold: v })
                                    }
                                    className={`min-h-12 flex-1 items-center justify-center rounded-full border ${settings.confidenceThreshold === v ? 'border-primary bg-secondary' : 'border-border bg-card'}`}
                                >
                                    <Text className="text-sm">{v * 100}%</Text>
                                </Pressable>
                            ))}
                        </Box>
                        <Action
                            secondary
                            disabled={busy}
                            onPress={() =>
                                void run(async () => {
                                    await api.saveSettings(settings)
                                    onNotice('Настройки AI сохранены')
                                })
                            }
                        >
                            Сохранить настройки AI
                        </Action>
                    </>
                ) : null}
                <Text className="mt-4 text-sm font-semibold text-muted-foreground">
                    Свой сервер — необязательно
                </Text>
                <Field
                    label="URL Thoughts API"
                    value={server}
                    autoCapitalize="none"
                    keyboardType="url"
                    onChangeText={setServer}
                />
                <Action
                    secondary
                    disabled={busy}
                    onPress={() =>
                        void run(async () => {
                            await saveApiUrl(server)
                            await retryLocalData()
                            onNotice('Адрес сервера сохранён')
                        })
                    }
                >
                    Сохранить адрес
                </Action>
                <Action
                    secondary
                    disabled={busy}
                    onPress={() =>
                        void run(async () => {
                            await importServerData()
                            onNotice('Данные сервера сохранены на телефоне')
                        })
                    }
                >
                    Импортировать прежние мысли с сервера
                </Action>
            </>
        )
    else
        content = (
            <>
                <Info>
                    {updates.enabled
                        ? 'Совместимые обновления интерфейса скачиваются при запуске и возвращении в приложение. Применяй их, когда закончишь писать.'
                        : 'Этот APK не поддерживает обновления. Один раз установи новую сборку Thoughts с подключённым Expo.'}
                </Info>
                <Box className="gap-2 rounded-3xl border border-border bg-card p-4">
                    <Text className="text-base font-semibold">Thoughts · интерфейс 0.3.6</Text>
                    <Text className="text-sm">Дата выпуска установленного обновления: {updates.publishedAt ? new Date(updates.publishedAt).toLocaleString('ru-RU') : 'недоступна в режиме разработки'}</Text>
                    {updates.firstLaunchedAt ? <Text className="text-sm text-muted-foreground">Впервые запущено на этом устройстве: {new Date(updates.firstLaunchedAt).toLocaleString('ru-RU')}</Text> : null}
                    <Text className="text-sm text-muted-foreground">{updates.embedded ? 'Версия из APK' : 'Обновление Expo'}{updates.updateId ? ` · ${updates.updateId.slice(0, 8)}` : ''}</Text>
                </Box>
                <Action
                    secondary
                    disabled={updates.checking}
                    onPress={() => void updates.check(true)}
                >
                    Проверить обновления
                </Action>
                {updates.status ? (
                    <Text className="text-sm leading-5">{updates.status}</Text>
                ) : null}
                {updates.ready ? (
                    <Action onPress={() => void updates.apply()}>Применить обновление</Action>
                ) : null}
                <Info>Черновик сохраняется на телефоне и восстановится после обновления.</Info>
            </>
        )
    return (
        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerClassName="gap-5 px-5 pb-8">
            {content}
        </ScrollView>
    )
}
