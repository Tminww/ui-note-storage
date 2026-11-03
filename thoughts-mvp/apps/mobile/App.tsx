import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import './global.css'
import {
    ActivityIndicator,
    Animated,
    AppState,
    BackHandler,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StatusBar,
    TextInput
} from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { Box, Text, Heading } from './components/ui/surfaces'
import { Action, Field, Icon, Info, Sheet, confirmDelete } from './components/ui/app-controls'
import { api, loadApiUrl, type Thought, type Project } from './src/api'
import {
    localRepository,
    startLocalSync,
    subscribeSync,
    syncSnapshot,
    retryLocalData
} from './src/localService'
import { initializeDeviceConfig, getNotionRoot } from './src/deviceConfig'
import { SettingsScreen, sectionTitles, rgb, type Section } from './src/SettingsScreen'
import { accents, useAppearance } from './src/useAppearance'
import { useVoiceInput } from './src/useVoiceInput'
import { useAutomaticUpdates } from './src/useAutomaticUpdates'
import type { LocalThought } from './src/localCore'
import { registerBackgroundSync } from './src/backgroundSync'

type Page = 'thoughts' | 'projects' | 'ai' | 'settings'
const categories = {
    idea: 'Идея',
    task: 'Задача',
    bug: 'Ошибка',
    research: 'Исследование',
    note: 'Заметка'
}
const clock = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
export default function App() {
    return (
        <SafeAreaProvider>
            <ThoughtsApp />
        </SafeAreaProvider>
    )
}
function ThoughtsApp() {
    const state = useSyncExternalStore(
        localRepository.subscribe,
        localRepository.snapshot,
        localRepository.snapshot
    )
    const sync = useSyncExternalStore(subscribeSync, syncSnapshot, syncSnapshot)
    const { dark } = useAppearance(state.preferences)
    const updates = useAutomaticUpdates()
    const [ready, setReady] = useState(false)
    const [page, setPage] = useState<Page>('thoughts')
    const [section, setSection] = useState<Section>('home')
    const [draft, setDraft] = useState('')
    const [selected, setSelected] = useState('all')
    const [draftProject, setDraftProject] = useState<string | null>(null)
    const [picker, setPicker] = useState(false)
    const [showSearch, setShowSearch] = useState(false)
    const [search, setSearch] = useState('')
    const [bannerHidden, setBannerHidden] = useState(false)
    const [error, setError] = useState('')
    const [notice, setNotice] = useState('')
    const [undoId, setUndoId] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [projectEditor, setProjectEditor] = useState<Partial<Project> | null>(null)
    const [editing, setEditing] = useState<Thought | null>(null)
    const [voiceScreen, setVoiceScreen] = useState(false)
    const [voiceDone, setVoiceDone] = useState(false)
    const [seconds, setSeconds] = useState(0)
    const [elapsed, setElapsed] = useState(0)
    const beforeVoice = useRef('')
    const input = useRef<React.ComponentRef<typeof TextInput>>(null)
    const persistDraft = (text: string) => {
        setDraft(text)
        void localRepository.setDraft(text).catch((e) => setError(e.message))
    }
    const voice = useVoiceInput(persistDraft, state.preferences.voiceOnDevice)
    const pulse = useRef(new Animated.Value(0.45)).current
    const projects = state.projects.filter((p) => !p.deleted)
    const thoughts = state.thoughts
        .filter((t) => !t.deleted)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const inboxCount = thoughts.filter((t) => !t.projectId).length
    const pending = thoughts.filter((t) => t.aiPending)
    const review = thoughts.filter((t) => t.status === 'needs_review')
    const notionPending = thoughts.filter(
        (t) => t.notion[getNotionRoot()]?.revision !== t.revision
    ).length
    const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name || 'Входящие'
    const openSettings = (next: Section) => {
        setPage('settings')
        setSection(next)
    }
    const run = async (fn: () => Promise<unknown>) => {
        setBusy(true)
        setError('')
        try {
            await fn()
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
        } finally {
            setBusy(false)
        }
    }
    useEffect(() => {
        let dispose: (() => void) | undefined
        let mounted = true
        void Promise.all([localRepository.initialize(), initializeDeviceConfig(), loadApiUrl()])
            .then(() => {
                if (!mounted) return
                setDraft(localRepository.snapshot().draft)
                setReady(true)
                dispose = startLocalSync()
                void registerBackgroundSync().catch(() => {})
            })
            .catch((e) => setError(e.message))
        return () => {
            mounted = false
            dispose?.()
        }
    }, [])
    useEffect(() => {
        if (!voice.active) return
        const started = Date.now()
        const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 250)
        const animation = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 1, duration: 550, useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 0.4, duration: 550, useNativeDriver: true })
            ])
        )
        animation.start()
        return () => {
            clearInterval(timer)
            animation.stop()
        }
    }, [voice.active, pulse])
    useEffect(() => {
        if (!voice.active && voiceDone) {
            setVoiceDone(false)
            if (!state.preferences.voiceReview && draft.trim()) void saveThought()
        }
    }, [voice.active, voiceDone])
    useEffect(() => {
        const app = AppState.addEventListener('change', (value) => {
            if (value !== 'active' && voice.active) voice.stop()
        })
        const back = BackHandler.addEventListener('hardwareBackPress', () => {
            if (voiceScreen) {
                cancelVoice()
                return true
            }
            if (section !== 'home') {
                setSection('home')
                return true
            }
            if (page !== 'thoughts') {
                setPage('thoughts')
                return true
            }
            return false
        })
        return () => {
            app.remove()
            back.remove()
        }
    }, [voice.active, voiceScreen, page, section])
    const haptic = () => {
        if (state.preferences.haptics) void Haptics.selectionAsync().catch(() => {})
    }
    async function saveThought() {
        if (!draft.trim() || busy || voice.active) return
        await run(async () => {
            const saved = await api.createThought(draft, draftProject)
            setDraft('')
            setDraftProject(null)
            setUndoId(saved.id)
            setNotice('Сохранено на телефоне')
            haptic()
        })
    }
    const startVoice = () => {
        beforeVoice.current = draft
        setSeconds(0)
        setElapsed(0)
        setVoiceScreen(true)
        haptic()
        void voice.start(draft)
    }
    const cancelVoice = () => {
        voice.cancel()
        persistDraft(beforeVoice.current)
        setVoiceScreen(false)
        setVoiceDone(false)
    }
    const noteCard = (t: LocalThought) => {
        const color = state.preferences.projectColors
            ? projects.find((p) => p.id === t.projectId)?.color
            : undefined
        return (
            <Pressable
                key={t.id}
                accessibilityRole="button"
                accessibilityLabel={`Открыть мысль: ${t.title}`}
                onPress={() => setEditing({ ...t })}
                className="gap-4 rounded-3xl border border-border bg-card p-4"
            >
                <Text className="text-base leading-6">{t.rawText}</Text>
                {t.summary ? (
                    <Text className="text-sm leading-5 text-muted-foreground" numberOfLines={2}>
                        {t.summary}
                    </Text>
                ) : null}
                <Box className="flex-row items-center justify-between gap-3">
                    <Box className="flex-row items-center gap-2 rounded-full bg-secondary px-3 py-1">
                        {color ? (
                            <Box
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: color }}
                            />
                        ) : null}
                        <Text className="text-xs font-semibold text-primary">
                            {projectName(t.projectId)}
                        </Text>
                    </Box>
                    <Text className="text-xs text-muted-foreground">
                        {new Date(t.createdAt).toLocaleTimeString('ru-RU', {
                            hour: '2-digit',
                            minute: '2-digit'
                        })}
                    </Text>
                </Box>
                {t.aiPending || t.status === 'needs_review' ? (
                    <Text className="text-xs text-muted-foreground">
                        {t.aiPending
                            ? sync.online
                                ? 'Ждёт обработки AI'
                                : 'AI обработает после подключения'
                            : 'Нужно проверить классификацию'}
                    </Text>
                ) : null}
            </Pressable>
        )
    }
    const thoughtsScreen = () => {
        const filtered = thoughts.filter(
            (t) =>
                (selected === 'all' ||
                    (selected === 'inbox' && !t.projectId) ||
                    t.projectId === selected) &&
                (!search ||
                    [t.rawText, t.title, t.summary, ...t.tags]
                        .join(' ')
                        .toLocaleLowerCase()
                        .includes(search.toLocaleLowerCase()))
        )
        let date = ''
        return (
            <>
                <Box>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerClassName="gap-2 px-5 pb-4"
                    >
                        {[
                            { id: 'all', name: 'Все' },
                            { id: 'inbox', name: `Входящие · ${inboxCount}` },
                            ...projects
                        ].map((p) => (
                            <Pressable
                                accessibilityRole="tab"
                                accessibilityState={{ selected: selected === p.id }}
                                key={p.id}
                                onPress={() => setSelected(p.id)}
                                className={`min-h-10 justify-center rounded-full border px-4 ${selected === p.id ? 'border-primary bg-secondary' : 'border-border bg-card'}`}
                            >
                                <Text
                                    className={`text-sm ${selected === p.id ? 'font-semibold text-primary' : 'text-foreground'}`}
                                >
                                    {p.name}
                                </Text>
                            </Pressable>
                        ))}
                    </ScrollView>
                </Box>
                <ScrollView
                    className="flex-1"
                    keyboardShouldPersistTaps="handled"
                    contentContainerClassName="gap-3 px-5 pb-5"
                >
                    {!bannerHidden && !sync.notionConfigured ? (
                        <Box className="flex-row items-center gap-3 rounded-3xl bg-warning p-4">
                            <Text className="flex-1 text-sm leading-5 text-warning-foreground">
                                Мысли хранятся на телефоне. Подключи Notion, чтобы сохранять копию
                                там.
                            </Text>
                            <Pressable
                                onPress={() => openSettings('notion')}
                                className="min-h-12 justify-center rounded-full bg-card px-4"
                            >
                                <Text className="text-sm font-semibold">Настроить</Text>
                            </Pressable>
                            <Pressable
                                accessibilityLabel="Скрыть подсказку"
                                onPress={() => setBannerHidden(true)}
                            >
                                <Icon name="close" size={18} tone="text-warning-foreground" />
                            </Pressable>
                        </Box>
                    ) : null}
                    {!sync.online ? (
                        <Info warning>
                            Нет сети. Всё сохраняется на телефоне; очередь продолжится после
                            подключения.
                        </Info>
                    ) : null}
                    {showSearch ? (
                        <Field
                            label="Поиск мыслей"
                            placeholder="Текст или тег"
                            value={search}
                            onChangeText={setSearch}
                            autoFocus
                        />
                    ) : null}
                    {filtered.length ? (
                        filtered.map((t) => {
                            const d = new Date(t.createdAt).toLocaleDateString('ru-RU', {
                                day: 'numeric',
                                month: 'long'
                            })
                            const heading = date !== d
                            date = d
                            return (
                                <Box key={t.id} className="gap-3">
                                    {heading ? (
                                        <Text className="mt-2 text-sm font-semibold text-muted-foreground">
                                            {new Date(t.createdAt).toDateString() ===
                                            new Date().toDateString()
                                                ? 'Сегодня'
                                                : d}
                                        </Text>
                                    ) : null}
                                    {noteCard(t)}
                                </Box>
                            )
                        })
                    ) : (
                        <Box className="items-center gap-4 py-12">
                            <Icon name="bulb-outline" size={40} tone="text-primary" />
                            <Heading>
                                {thoughts.length ? 'Ничего не найдено' : 'Пока нет мыслей'}
                            </Heading>
                            <Text className="text-center text-sm leading-5 text-muted-foreground">
                                {thoughts.length
                                    ? 'Попробуй другой поиск или фильтр.'
                                    : 'Запиши или продиктуй первую мысль. Интернет для сохранения не нужен.'}
                            </Text>
                            {!thoughts.length
                                ? ['Идея для проекта', 'Что сделать завтра', 'Итоги встречи'].map(
                                      (example) => (
                                          <Pressable
                                              key={example}
                                              onPress={() => {
                                                  persistDraft(example)
                                                  input.current?.focus()
                                              }}
                                              className="min-h-12 justify-center rounded-full border border-border bg-card px-5"
                                          >
                                              <Text className="text-sm text-primary">
                                                  {example}
                                              </Text>
                                          </Pressable>
                                      )
                                  )
                                : null}
                        </Box>
                    )}
                </ScrollView>
                <Box className="gap-3 rounded-t-3xl border border-border bg-card px-5 py-4">
                    <TextInput
                        ref={input}
                        accessibilityLabel="Новая мысль"
                        placeholder="Что у тебя в голове?"
                        value={draft}
                        onChangeText={persistDraft}
                        multiline
                        maxLength={10000}
                        editable={!busy}
                        className="max-h-36 min-h-12 text-base text-foreground placeholder:text-muted-foreground"
                    />
                    <Box className="flex-row items-center gap-3">
                        <Pressable
                            onPress={() => setPicker(true)}
                            className="min-h-11 flex-1 flex-row items-center gap-2 rounded-full border border-border bg-background px-4"
                        >
                            <Text className="flex-1 text-sm font-semibold" numberOfLines={1}>
                                Проект: {draftProject ? projectName(draftProject) : 'Авто'}
                            </Text>
                            <Icon name="chevron-down" size={16} />
                        </Pressable>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Сохранить мысль"
                            accessibilityState={{ disabled: !draft.trim() || busy }}
                            disabled={!draft.trim() || busy}
                            onPress={() => void saveThought()}
                            className={`h-12 w-12 items-center justify-center rounded-full ${draft.trim() && !busy ? 'bg-primary' : 'bg-muted'}`}
                        >
                            <Icon
                                name="arrow-up"
                                tone={
                                    draft.trim() && !busy
                                        ? 'text-primary-foreground'
                                        : 'text-muted-foreground'
                                }
                            />
                        </Pressable>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Начать диктовку"
                            onPress={startVoice}
                            disabled={busy}
                            className="h-14 w-14 items-center justify-center rounded-full bg-primary"
                        >
                            <Icon name="mic-outline" size={27} tone="text-primary-foreground" />
                        </Pressable>
                    </Box>
                </Box>
            </>
        )
    }
    const projectsScreen = () => (
        <ScrollView contentContainerClassName="gap-5 px-5 pb-8">
            <Text className="text-sm leading-5 text-muted-foreground">
                Чем точнее описание проекта, тем лучше AI раскладывает мысли.
            </Text>
            <Text className="mt-1 text-sm font-semibold text-muted-foreground">Быстрый старт</Text>
            <Box className="flex-row flex-wrap gap-2">
                {['Работа', 'Разработка', 'Обучение', 'Личное'].map((name, index) => (
                    <Pressable
                        key={name}
                        onPress={() =>
                            void run(async () => {
                                await api.createProject({
                                    name,
                                    description: '',
                                    color: rgb(accents[index].light)
                                })
                            })
                        }
                        className="min-h-12 flex-row items-center gap-2 rounded-full border border-border bg-card px-4"
                    >
                        <Icon name="add" tone="text-primary" size={18} />
                        <Text>{name}</Text>
                    </Pressable>
                ))}
            </Box>
            <Text className="mt-2 text-sm font-semibold text-muted-foreground">Мои проекты</Text>
            {projects.map((p) => (
                <Pressable
                    key={p.id}
                    accessibilityLabel={`Проект ${p.name}`}
                    onPress={() => {
                        setSelected(p.id)
                        setPage('thoughts')
                    }}
                    className="flex-row items-center gap-3 rounded-3xl border border-border bg-card p-4"
                >
                    <Box className="h-12 w-12 items-center justify-center rounded-2xl bg-secondary">
                        <Icon name="folder-outline" tone="text-primary" size={25} />
                    </Box>
                    <Box className="flex-1 gap-1">
                        <Text className="text-base font-semibold">{p.name}</Text>
                        <Text className="text-sm leading-5 text-muted-foreground">
                            {p.description || 'Добавить описание для AI'}
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                            {thoughts.filter((t) => t.projectId === p.id).length} мыслей
                        </Text>
                    </Box>
                    <Pressable
                        accessibilityLabel={`Изменить проект ${p.name}`}
                        onPress={() => setProjectEditor({ ...p })}
                        className="h-12 w-12 items-center justify-center"
                    >
                        <Icon name="create-outline" />
                    </Pressable>
                </Pressable>
            ))}
            {!projects.length ? (
                <Text className="text-sm text-muted-foreground">
                    Выбери шаблон выше или создай свой проект.
                </Text>
            ) : null}
            <Info>Опиши проект своими словами. Этого хватит, чтобы AI понимал контекст.</Info>
        </ScrollView>
    )
    const aiScreen = () => (
        <ScrollView contentContainerClassName="gap-5 px-5 pb-8">
            <Info>
                {sync.aiConfigured
                    ? 'AI обрабатывает сохранённые мысли, когда есть сеть.'
                    : 'Подключи AI в настройках. Все мысли уже сохраняются на телефоне и дождутся обработки.'}
            </Info>
            <Box className="flex-row gap-3">
                <Box className="flex-1 gap-2 rounded-3xl border border-border bg-card p-5">
                    <Heading>{pending.length}</Heading>
                    <Text className="text-sm text-muted-foreground">Ждут AI</Text>
                </Box>
                <Box className="flex-1 gap-2 rounded-3xl border border-border bg-card p-5">
                    <Heading>{review.length}</Heading>
                    <Text className="text-sm text-muted-foreground">На проверку</Text>
                </Box>
            </Box>
            <Action onPress={() => void run(retryLocalData)} disabled={busy || !sync.online}>
                Обработать очередь
            </Action>
            <Action secondary onPress={() => openSettings('ai')}>
                Настройки AI
            </Action>
            {sync.error ? <Info warning>{sync.error}</Info> : null}
            {pending.length ? (
                <Text className="text-sm font-semibold text-muted-foreground">
                    Очередь обработки
                </Text>
            ) : null}
            {pending.map((t) => (
                <Box key={t.id} className="gap-2 rounded-3xl border border-border bg-card p-4">
                    <Text>{t.rawText}</Text>
                    <Text className="text-xs text-muted-foreground">
                        {t.errorMessage || 'Ожидает подключения и обработки'}
                    </Text>
                </Box>
            ))}
            {review.map(noteCard)}
        </ScrollView>
    )
    return (
        <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-background">
            <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
            <KeyboardAvoidingView
                className="mx-auto w-full max-w-3xl flex-1"
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <Box className="min-h-24 flex-row items-center gap-3 px-5 py-4">
                    {page === 'settings' && section !== 'home' ? (
                        <Pressable
                            onPress={() => setSection('home')}
                            accessibilityLabel="Назад"
                            className="h-11 w-8 justify-center"
                        >
                            <Icon name="chevron-back" tone="text-foreground" />
                        </Pressable>
                    ) : null}
                    <Box className="flex-1 gap-1">
                        <Heading className="text-3xl font-bold">
                            {page === 'thoughts'
                                ? 'Мысли'
                                : page === 'projects'
                                  ? 'Проекты'
                                  : page === 'ai'
                                    ? 'AI'
                                    : sectionTitles[section]}
                        </Heading>
                        {page === 'thoughts' ? (
                            <Box className="flex-row items-center gap-1">
                                <Icon
                                    name={
                                        sync.syncing
                                            ? 'sync-outline'
                                            : sync.online
                                              ? 'ellipse'
                                              : 'cloud-offline-outline'
                                    }
                                    size={sync.syncing ? 12 : 8}
                                    tone={
                                        sync.notionConfigured
                                            ? 'text-success'
                                            : 'text-warning-foreground'
                                    }
                                />
                                <Text className="text-xs text-muted-foreground">
                                    {sync.syncing
                                        ? 'Синхронизируется…'
                                        : sync.notionConfigured
                                          ? notionPending
                                              ? `На телефоне · ${notionPending} ждут Notion`
                                              : 'На телефоне и в Notion'
                                          : 'Только на устройстве'}
                                </Text>
                            </Box>
                        ) : null}
                    </Box>
                    {page === 'thoughts' ? (
                        <Pressable
                            accessibilityLabel="Поиск"
                            onPress={() => setShowSearch(!showSearch)}
                            className="h-12 w-12 items-center justify-center"
                        >
                            <Icon name="search-outline" tone="text-foreground" />
                        </Pressable>
                    ) : page === 'projects' ? (
                        <Action
                            onPress={() =>
                                setProjectEditor({
                                    name: '',
                                    description: '',
                                    color: rgb(accents[0].light)
                                })
                            }
                        >
                            ＋ Создать
                        </Action>
                    ) : null}
                </Box>
                {error ? (
                    <Box className="mx-5 mb-3 flex-row items-center gap-2 rounded-2xl bg-warning p-3">
                        <Text className="flex-1 text-sm text-warning-foreground">{error}</Text>
                        <Pressable accessibilityLabel="Закрыть ошибку" onPress={() => setError('')}>
                            <Icon name="close" tone="text-warning-foreground" />
                        </Pressable>
                    </Box>
                ) : null}
                {notice ? (
                    <Box className="mx-5 mb-3 flex-row items-center gap-2 rounded-2xl bg-secondary px-4 py-3">
                        <Text className="flex-1 text-sm">{notice}</Text>
                        {undoId ? (
                            <Pressable
                                onPress={() =>
                                    void run(async () => {
                                        await api.deleteThought(undoId)
                                        setUndoId(null)
                                        setNotice('Сохранение отменено')
                                    })
                                }
                            >
                                <Text className="text-sm font-semibold text-primary">Отменить</Text>
                            </Pressable>
                        ) : null}
                        <Pressable
                            accessibilityLabel="Закрыть уведомление"
                            onPress={() => {
                                setNotice('')
                                setUndoId(null)
                            }}
                        >
                            <Icon name="close" size={18} />
                        </Pressable>
                    </Box>
                ) : null}
                {updates.ready && page !== 'settings' ? (
                    <Pressable
                        onPress={() => openSettings('updates')}
                        className="mx-5 mb-3 rounded-2xl bg-secondary p-3"
                    >
                        <Text className="text-sm text-primary">
                            Новая версия скачана · Применить
                        </Text>
                    </Pressable>
                ) : null}
                {!ready ? (
                    <Box className="flex-1 items-center justify-center gap-3">
                        <ActivityIndicator />
                        <Text>Открываем локальные мысли…</Text>
                    </Box>
                ) : page === 'thoughts' ? (
                    thoughtsScreen()
                ) : page === 'projects' ? (
                    projectsScreen()
                ) : page === 'ai' ? (
                    aiScreen()
                ) : (
                    <SettingsScreen
                        section={section}
                        setSection={setSection}
                        preferences={state.preferences}
                        dark={dark}
                        updates={updates}
                        onNotice={(v) => {
                            setUndoId(null)
                            setNotice(v)
                        }}
                        onError={setError}
                    />
                )}
                <SafeAreaView edges={['bottom']} className="border-t border-border bg-card">
                    <Box className="flex-row">
                        {(
                            [
                                { id: 'thoughts', name: 'Мысли', icon: 'list-outline' },
                                { id: 'projects', name: 'Проекты', icon: 'folder-outline' },
                                { id: 'ai', name: 'AI', icon: 'sparkles-outline' },
                                { id: 'settings', name: 'Настройки', icon: 'settings-outline' }
                            ] as const
                        ).map((tab) => (
                            <Pressable
                                key={tab.id}
                                accessibilityRole="tab"
                                accessibilityLabel={tab.name}
                                accessibilityState={{ selected: page === tab.id }}
                                onPress={() => {
                                    setPage(tab.id)
                                    if (tab.id === 'settings') setSection('home')
                                }}
                                className="min-h-18 flex-1 items-center justify-center gap-1 py-3"
                            >
                                <Icon
                                    name={tab.icon}
                                    tone={
                                        page === tab.id ? 'text-primary' : 'text-muted-foreground'
                                    }
                                />
                                <Text
                                    className={`text-xs ${page === tab.id ? 'font-semibold text-primary' : 'text-muted-foreground'}`}
                                >
                                    {tab.name}
                                </Text>
                            </Pressable>
                        ))}
                    </Box>
                </SafeAreaView>
            </KeyboardAvoidingView>
            <Sheet visible={picker} title="Проект для мысли" onClose={() => setPicker(false)}>
                {[{ id: null, name: 'Авто — AI выберет сам' }, ...projects].map((p) => (
                    <Pressable
                        key={p.id || 'auto'}
                        onPress={() => {
                            setDraftProject(p.id)
                            setPicker(false)
                        }}
                        className="min-h-14 flex-row items-center gap-3 border-b border-border"
                    >
                        <Icon
                            name={draftProject === p.id ? 'radio-button-on' : 'radio-button-off'}
                            tone="text-primary"
                        />
                        <Text>{p.name}</Text>
                    </Pressable>
                ))}
            </Sheet>
            <Sheet
                visible={projectEditor !== null}
                title={projectEditor?.id ? 'Изменить проект' : 'Новый проект'}
                onClose={() => setProjectEditor(null)}
            >
                <Field
                    label="Название"
                    value={projectEditor?.name || ''}
                    maxLength={80}
                    onChangeText={(v) => setProjectEditor({ ...projectEditor, name: v })}
                />
                <Field
                    label="Описание для AI"
                    placeholder="Какие мысли относятся к проекту?"
                    value={projectEditor?.description || ''}
                    multiline
                    maxLength={400}
                    onChangeText={(v) => setProjectEditor({ ...projectEditor, description: v })}
                />
                <Text className="text-sm font-semibold">Цвет проекта</Text>
                <Box className="flex-row gap-3">
                    {accents.map((a) => (
                        <Pressable
                            key={a.id}
                            accessibilityLabel={`Цвет ${a.name}`}
                            onPress={() =>
                                setProjectEditor({ ...projectEditor, color: rgb(a.light) })
                            }
                            className="h-12 w-12 items-center justify-center rounded-full"
                            style={{ backgroundColor: rgb(a.light) }}
                        >
                            {projectEditor?.color === rgb(a.light) ? (
                                <Icon name="checkmark" tone="text-primary-foreground" />
                            ) : null}
                        </Pressable>
                    ))}
                </Box>
                <Action
                    disabled={!projectEditor?.name?.trim() || busy}
                    onPress={() =>
                        void run(async () => {
                            if (!projectEditor) return
                            const body = {
                                name: projectEditor.name || '',
                                description: projectEditor.description || '',
                                color: projectEditor.color || rgb(accents[0].light)
                            }
                            if (projectEditor.id) await api.updateProject(projectEditor.id, body)
                            else await api.createProject(body)
                            setProjectEditor(null)
                        })
                    }
                >
                    Сохранить проект
                </Action>
                {projectEditor?.id ? (
                    <Action
                        secondary
                        onPress={() =>
                            confirmDelete(
                                'Удалить проект? Его мысли останутся во входящих.',
                                () =>
                                    void run(async () => {
                                        await api.deleteProject(projectEditor.id!)
                                        setProjectEditor(null)
                                        setSelected('all')
                                    })
                            )
                        }
                    >
                        Удалить проект
                    </Action>
                ) : null}
            </Sheet>
            <Sheet visible={editing !== null} title="Мысль" onClose={() => setEditing(null)}>
                <Field
                    label="Название"
                    value={editing?.title || ''}
                    maxLength={140}
                    onChangeText={(v) => setEditing(editing ? { ...editing, title: v } : null)}
                />
                <Field
                    label="Исходный текст"
                    multiline
                    value={editing?.rawText || ''}
                    maxLength={10000}
                    onChangeText={(v) => setEditing(editing ? { ...editing, rawText: v } : null)}
                />
                <Field
                    label="Резюме"
                    multiline
                    value={editing?.summary || ''}
                    maxLength={800}
                    onChangeText={(v) => setEditing(editing ? { ...editing, summary: v } : null)}
                />
                <Text className="text-sm font-semibold">Проект</Text>
                <Box className="flex-row flex-wrap gap-2">
                    {[{ id: null, name: 'Входящие' }, ...projects].map((p) => (
                        <Pressable
                            key={p.id || 'inbox'}
                            onPress={() =>
                                setEditing(editing ? { ...editing, projectId: p.id } : null)
                            }
                            className={`min-h-12 justify-center rounded-full border px-4 ${editing?.projectId === p.id ? 'border-primary bg-secondary' : 'border-border'}`}
                        >
                            <Text className="text-sm">{p.name}</Text>
                        </Pressable>
                    ))}
                </Box>
                <Text className="text-sm font-semibold">Категория</Text>
                <Box className="flex-row flex-wrap gap-2">
                    {Object.entries(categories).map(([id, name]) => (
                        <Pressable
                            key={id}
                            onPress={() =>
                                setEditing(
                                    editing
                                        ? { ...editing, category: id as Thought['category'] }
                                        : null
                                )
                            }
                            className={`min-h-12 justify-center rounded-full border px-4 ${editing?.category === id ? 'border-primary bg-secondary' : 'border-border'}`}
                        >
                            <Text className="text-sm">{name}</Text>
                        </Pressable>
                    ))}
                </Box>
                <Action
                    disabled={busy || !editing?.rawText.trim()}
                    onPress={() =>
                        void run(async () => {
                            if (!editing) return
                            await api.updateThought(editing.id, {
                                title: editing.title,
                                rawText: editing.rawText,
                                summary: editing.summary,
                                projectId: editing.projectId,
                                category: editing.category,
                                status: 'ready'
                            })
                            setEditing(null)
                        })
                    }
                >
                    Сохранить изменения
                </Action>
                <Action
                    secondary
                    onPress={() =>
                        void run(async () => {
                            if (editing) await api.processThought(editing.id)
                            setEditing(null)
                            setUndoId(null)
                            setNotice('Мысль добавлена в очередь AI')
                        })
                    }
                >
                    Обработать AI ещё раз
                </Action>
                <Action
                    secondary
                    onPress={() =>
                        confirmDelete(
                            'Удалить мысль?',
                            () =>
                                void run(async () => {
                                    if (editing) await api.deleteThought(editing.id)
                                    setEditing(null)
                                })
                        )
                    }
                >
                    Удалить мысль
                </Action>
            </Sheet>
            <Modal visible={voiceScreen} animationType="slide" onRequestClose={cancelVoice}>
                <SafeAreaView className="flex-1 bg-background">
                    <Box className="mx-auto w-full max-w-xl flex-1 gap-6 p-5">
                        <Box className="flex-row items-center justify-between">
                            <Pressable
                                accessibilityLabel="Отменить диктовку"
                                onPress={cancelVoice}
                                className="min-h-12 justify-center"
                            >
                                <Text className="font-semibold">Отмена</Text>
                            </Pressable>
                            <Box className="flex-row items-center gap-1 rounded-full bg-secondary px-3 py-2">
                                <Icon
                                    name={
                                        state.preferences.voiceOnDevice
                                            ? 'lock-closed-outline'
                                            : 'language-outline'
                                    }
                                    tone="text-primary"
                                    size={14}
                                />
                                <Text className="text-xs text-primary">
                                    Русский ·{' '}
                                    {state.preferences.voiceOnDevice
                                        ? 'на устройстве'
                                        : 'системный'}
                                </Text>
                            </Box>
                        </Box>
                        <Box className="items-center gap-3 pt-2">
                            <Text className="font-semibold text-destructive">
                                {voice.active ? 'Идёт запись' : 'Пауза'}
                            </Text>
                            <Text className="text-6xl font-bold">{clock(seconds + elapsed)}</Text>
                        </Box>
                        <Animated.View
                            style={{ opacity: pulse }}
                            className="h-24 flex-row items-center justify-center gap-1"
                        >
                            {[
                                16, 28, 44, 24, 58, 72, 46, 32, 62, 84, 52, 38, 66, 76, 42, 26, 54,
                                68, 36, 22, 46, 58, 32, 18, 30, 20
                            ].map((height, index) => (
                                <Box
                                    key={index}
                                    className="w-1.5 rounded-full bg-primary"
                                    style={{ height }}
                                />
                            ))}
                        </Animated.View>
                        <Box className="gap-3 rounded-3xl border border-border bg-card p-5">
                            <Text className="text-sm font-semibold text-muted-foreground">
                                Распознанный текст
                            </Text>
                            <ScrollView className="max-h-48">
                                <Text className="text-2xl leading-9">
                                    {draft || 'Начни говорить…'}
                                </Text>
                            </ScrollView>
                        </Box>
                        <Text className="text-center text-sm leading-5 text-muted-foreground">
                            Текст появляется по мере речи.{' '}
                            {state.preferences.voiceReview
                                ? 'Проверь его перед сохранением.'
                                : 'После «Готово» мысль сохранится на телефоне.'}
                        </Text>
                        {voice.error ? <Info warning>{voice.error}</Info> : null}
                        <Box className="flex-1" />
                        <Box className="flex-row items-end justify-around pb-4">
                            <Box className="items-center gap-2">
                                <Pressable
                                    accessibilityLabel={
                                        voice.active ? 'Пауза' : 'Продолжить диктовку'
                                    }
                                    onPress={() => {
                                        if (voice.active) {
                                            setElapsed(elapsed + seconds)
                                            setSeconds(0)
                                            voice.stop()
                                        } else void voice.start(draft)
                                    }}
                                    className="h-16 w-16 items-center justify-center rounded-full border border-border bg-card"
                                >
                                    <Icon
                                        name={voice.active ? 'pause' : 'play'}
                                        tone="text-foreground"
                                    />
                                </Pressable>
                                <Text className="text-xs text-muted-foreground">
                                    {voice.active ? 'Пауза' : 'Продолжить'}
                                </Text>
                            </Box>
                            <Box className="items-center gap-2">
                                <Pressable
                                    accessibilityLabel="Готово"
                                    onPress={() => {
                                        voice.stop()
                                        setVoiceScreen(false)
                                        setVoiceDone(true)
                                        input.current?.focus()
                                    }}
                                    className="h-24 w-24 items-center justify-center rounded-full bg-primary"
                                >
                                    <Icon name="stop" size={28} tone="text-primary-foreground" />
                                </Pressable>
                                <Text className="text-sm font-semibold">Готово</Text>
                            </Box>
                            <Box className="items-center gap-2">
                                <Pressable
                                    accessibilityLabel="Удалить результат диктовки"
                                    onPress={cancelVoice}
                                    className="h-16 w-16 items-center justify-center rounded-full border border-border bg-card"
                                >
                                    <Icon name="trash-outline" tone="text-destructive" />
                                </Pressable>
                                <Text className="text-xs text-muted-foreground">Удалить</Text>
                            </Box>
                        </Box>
                    </Box>
                </SafeAreaView>
            </Modal>
        </SafeAreaView>
    )
}
