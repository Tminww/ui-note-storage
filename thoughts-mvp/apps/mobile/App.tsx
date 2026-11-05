import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import './global.css'
import {
    ActivityIndicator,
    AppState,
    BackHandler,
    Keyboard,
    KeyboardAvoidingView,
    Linking,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Share,
    StatusBar,
    TextInput
} from 'react-native'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { SafeAreaView } from './components/ui/safe-area'
import * as Haptics from 'expo-haptics'
import * as Clipboard from 'expo-clipboard'
import { Box, Text, Heading } from './components/ui/surfaces'
import { Action, Field, Icon, Info, Sheet, confirmDelete, type IconName } from './components/ui/app-controls'
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
import { allTypes } from './src/taxonomy'
import { checklistFromList, checklistItem } from './src/checklist'
import { syncLocalData } from './src/localService'

type Page = 'thoughts' | 'projects' | 'ai' | 'settings'
const clock = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

function NoteSummary({ summary, onToggle, onConvert, disabled }: {
    summary: string
    onToggle: (index: number) => void
    onConvert: () => void
    disabled: boolean
}) {
    const lines = summary.split(/\r?\n/)
    const checklist = lines.map(checklistItem).filter((item) => item !== null)
    const converted = checklistFromList(summary)
    return (
        <Box className="gap-2">
            {checklist.length ? (
                <Text className="text-sm text-muted-foreground">
                    Выполнено {checklist.filter((item) => item.checked).length} из {checklist.length}
                </Text>
            ) : null}
            {lines.map((line, index) => {
                if (!line.trim()) return null
                const task = checklistItem(line)
                if (task) return (
                    <Pressable key={index} accessibilityRole="checkbox" accessibilityLabel={task.text}
                        accessibilityState={{ checked: task.checked, disabled }} disabled={disabled}
                        onPress={() => onToggle(index)}
                        className="min-h-11 flex-row items-center gap-3 rounded-lg px-1 active:bg-muted">
                        <Icon name={task.checked ? 'checkbox-outline' : 'square-outline'}
                            tone={task.checked ? 'text-primary' : 'text-muted-foreground'} />
                        <Text className={`flex-1 text-base leading-6 ${task.checked ? 'text-muted-foreground line-through' : ''}`}>
                            {task.text}
                        </Text>
                    </Pressable>
                )
                const item = line.trim().match(/^([-*•]|\d+[.)])\s+(.+)$/)
                if (!item) return <Text key={index} selectable className="text-base leading-6">{line}</Text>
                return (
                    <Box key={index} className="flex-row gap-2 pl-1">
                        <Text className="text-base leading-6 text-muted-foreground">
                            {/^\d/.test(item[1]) ? item[1] : '•'}
                        </Text>
                        <Text selectable className="flex-1 text-base leading-6">{item[2]}</Text>
                    </Box>
                )
            })}
            {converted !== lines.join('\n') && converted.length <= 800 ? (
                <Pressable accessibilityRole="button" disabled={disabled} onPress={onConvert}
                    className="min-h-11 justify-center self-start px-1">
                    <Text className="text-sm font-semibold text-primary">Сделать чек-листом</Text>
                </Pressable>
            ) : null}
        </Box>
    )
}
export default function App() {
    return (
        <SafeAreaProvider>
            <ThoughtsApp />
        </SafeAreaProvider>
    )
}
function ThoughtsApp() {
    const { top } = useSafeAreaInsets()
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
    const [keyboardOpen, setKeyboardOpen] = useState(false)
    const [selected, setSelected] = useState('all')
    const [draftProject, setDraftProject] = useState<string | null>(null)
    const [picker, setPicker] = useState(false)
    const [reviewPicker, setReviewPicker] = useState<LocalThought | null>(null)
    const [showSearch, setShowSearch] = useState(false)
    const [search, setSearch] = useState('')
    const [bannerHidden, setBannerHidden] = useState(false)
    const [error, setError] = useState('')
    const [notice, setNotice] = useState('')
    const [undoId, setUndoId] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [projectEditor, setProjectEditor] = useState<Partial<Project> | null>(null)
    const savedProject = state.projects.find((project) => project.id === projectEditor?.id)
    const linkedProjectPage = savedProject?.notionPageRoot === getNotionRoot()
        ? savedProject?.notionPageId : null
    const [editing, setEditing] = useState<LocalThought | null>(null)
    const [noteMode, setNoteMode] = useState<'read' | 'edit' | 'revise'>('read')
    const [noteMenu, setNoteMenu] = useState(false)
    const [feedback, setFeedback] = useState('')
    const [copyNotice, setCopyNotice] = useState('')
    const savedEditing = state.thoughts.find((t) => t.id === editing?.id && !t.deleted)
    const proposalNote = editing?.revision === savedEditing?.revision ? editing : savedEditing
    const hasUnsavedEdits = Boolean(editing && savedEditing && (['title', 'rawText', 'summary', 'projectId', 'category'] as const).some((key) => editing[key] !== savedEditing[key]))
    const categories: Record<string, string> = Object.fromEntries(allTypes(state.customCategories).map((c) => [c.id, c.name]))
    const [historyId, setHistoryId] = useState<string | null>(null)
    const [historyLimit, setHistoryLimit] = useState(20)
    const historyEntry = state.aiHistory.find((h) => h.id === historyId)
    const historyStatus = { started: 'Начата', success: 'Успешно', partial: 'С замечаниями', error: 'Ошибка' }
    const [voiceScreen, setVoiceScreen] = useState(false)
    const voiceAction = useRef(0)
    const input = useRef<React.ComponentRef<typeof TextInput>>(null)
    const persistDraft = (text: string) => {
        setDraft(text)
        void localRepository.setDraft(text).catch((e) => setError(e.message))
    }
    const voice = useVoiceInput(persistDraft, state.preferences.voiceOnDevice)
    const hasDraft = Boolean(draft.trim())
    const projects = state.projects.filter((p) => !p.deleted)
    const thoughts = state.thoughts
        .filter((t) => !t.deleted)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const inboxCount = thoughts.filter((t) => !t.projectId).length
    const pending = thoughts.filter((t) => t.aiPending)
    const review = thoughts.filter((t) => t.status === 'needs_review')
    const inboxReview = review.filter((t) => !t.aiPending)
    const notionRoot = getNotionRoot()
    const notionPending = thoughts.filter((t) => t.notion[notionRoot]?.revision !== t.revision).length
    const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name || 'Входящие'
    const notionStatus = (note: LocalThought) => {
        const link = note.notion[notionRoot]
        if (!sync.notionConfigured) return { label: 'На телефоне' }
        if (link?.revision === note.revision) return { label: 'Сохранено в Notion', link }
        const failure = note.notionErrors?.[notionRoot]
        const error = (failure?.revision === note.revision ? failure.message : undefined) ??
            (sync.notionReadError?.root === notionRoot ? sync.notionReadError.message : undefined)
        return { label: error ? 'Ошибка Notion' : 'В очереди Notion', error, link }
    }
    const editingNotion = savedEditing ? notionStatus(savedEditing) : null
    const editingNotionUrl = editingNotion?.link ? `https://www.notion.so/${editingNotion.link.id}` : null
    const editingText = savedEditing
        ? [...new Set([savedEditing.title, savedEditing.summary, savedEditing.rawText].map((text) => text.trim()).filter(Boolean))].join('\n\n')
        : ''
    const notionErrorCount = thoughts.filter((note) => notionStatus(note).error).length
    const lastProject = projects.find((project) => project.id === state.lastProjectId)
    const draftDestination = (projectId: string | null) => {
        if (!sync.notionConfigured) return 'Место сохранения: на телефоне'
        const project = projects.find((p) => p.id === projectId)
        if (!project) return null
        if (project.notionPageId && project.notionPageRoot === notionRoot) {
            return project.notionPageTitle
                ? `Notion → ${project.notionPageTitle}`
                : `Notion → привязанная страница проекта «${project.name}»`
        }
        return `Notion → общее хранилище → ${project.name}`
    }
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
        const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true))
        const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false))
        return () => {
            show.remove()
            hide.remove()
        }
    }, [])
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
        const app = AppState.addEventListener('change', (value) => {
            if (value !== 'active' && voice.nativeBusy) voice.pause()
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
    }, [voice.nativeBusy, voiceScreen, page, section])
    const haptic = () => {
        if (state.preferences.haptics) void Haptics.selectionAsync().catch(() => {})
    }
    async function saveThought() {
        if (!draft.trim() || busy || voice.active) return
        await saveText(draft)
    }
    async function saveText(text: string) {
        await run(async () => {
            const saved = await api.createThought(text, draftProject)
            Keyboard.dismiss()
            setDraft('')
            setDraftProject(null)
            setUndoId(saved.id)
            setNotice('Сохранено на телефоне')
            haptic()
        })
    }
    const copyThought = async (text: string, message: string) => {
        setCopyNotice('')
        if (!await Clipboard.setStringAsync(text)) throw new Error('Не удалось скопировать')
        setCopyNotice(message)
    }
    const shareThought = async () => {
        setCopyNotice('')
        if (Platform.OS !== 'web') {
            await Share.share({ message: editingText })
            return
        }
        if (typeof navigator.share === 'function') {
            await navigator.share({ text: editingText }).catch((error) => {
                if (error?.name !== 'AbortError') throw error
            })
        } else {
            await copyThought(editingText, 'Текст скопирован')
        }
    }
    const closeNote = () => {
        if (busy) return
        setError('')
        if (noteMenu) setNoteMenu(false)
        else if (noteMode !== 'read') {
            setNoteMode('read')
            if (savedEditing) setEditing({ ...savedEditing })
        } else setEditing(null)
    }
    const noteAction = (label: string, icon: IconName, action: () => void, destructive = false) => (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            disabled={busy}
            className="min-h-11 flex-row items-center gap-3 rounded-lg px-3 active:bg-muted"
            onPress={() => {
                setNoteMenu(false)
                setError('')
                action()
            }}
        >
            <Icon name={icon} size={19} tone={destructive ? 'text-destructive' : 'text-muted-foreground'} />
            <Text className={destructive ? 'text-destructive' : ''}>{label}</Text>
        </Pressable>
    )
    const startVoice = () => {
        Keyboard.dismiss()
        voiceAction.current++
        setVoiceScreen(true)
        haptic()
        void voice.start(draft)
    }
    const cancelVoice = () => {
        voiceAction.current++
        voice.cancel()
        setVoiceScreen(false)
    }
    const finishVoice = async () => {
        const action = ++voiceAction.current
        const text = await voice.finish()
        if (action !== voiceAction.current) return
        setVoiceScreen(false)
        if (!state.preferences.voiceReview && text.trim()) await saveText(text)
        else input.current?.focus()
    }
    const assignReviewProject = (thought: LocalThought, projectId: string | null) => void run(async () => {
        await api.updateThought(thought.id, { projectId, status: 'ready' }, thought.revision)
        setReviewPicker(null)
    })
    const noteCard = (t: LocalThought) => {
        const status = notionStatus(t)
        const showReviewActions = page === 'thoughts' && selected === 'review'
        const suggestedProject = t.classificationProposal?.project
        const canAcceptProject = suggestedProject || t.projectId
        const color = state.preferences.projectColors
            ? projects.find((p) => p.id === t.projectId)?.color
            : undefined
        return (
            <Box key={t.id} className="rounded-2xl border border-border bg-card">
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Открыть мысль: ${t.title}`}
                onPress={() => {
                    setError('')
                    setCopyNotice('')
                    setNoteMode('read')
                    setNoteMenu(false)
                    setEditing({ ...t })
                }}
                className="gap-2 rounded-2xl p-4 active:bg-muted"
            >
                <Text className="text-base font-semibold leading-6" numberOfLines={2}>{t.title || t.rawText}</Text>
                {t.summary || (t.title && t.title !== t.rawText) ? (
                    <Text className="text-sm leading-5 text-muted-foreground" numberOfLines={2}>
                        {t.summary || t.rawText}
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
                {status.error ? <Text className="text-xs text-destructive">{status.label}</Text> : null}
                {!showReviewActions && (t.aiPending || t.status === 'needs_review') ? (
                    <Text className="text-xs text-muted-foreground">
                        {t.aiPending
                            ? sync.online
                                ? 'Ждёт обработки AI'
                                : 'AI обработает после подключения'
                            : 'На проверку'}
                    </Text>
                ) : null}
            </Pressable>
            {showReviewActions ? (
                <Box className="flex-row flex-wrap gap-2 border-t border-border px-4 py-2">
                    {canAcceptProject ? (
                        <Pressable accessibilityRole="button" disabled={busy} className="min-h-11 justify-center rounded-xl bg-secondary px-3"
                            onPress={() => {
                                if (!suggestedProject || !t.classificationProposal) {
                                    assignReviewProject(t, t.projectId)
                                    return
                                }
                                const proposal = t.classificationProposal
                                void run(async () => {
                                    await localRepository.confirmClassification(t.id, t.revision, proposal, true)
                                    void syncLocalData()
                                })
                            }}>
                            <Text className="text-sm font-semibold text-primary">
                                Принять «{suggestedProject?.name ?? projectName(t.projectId)}»
                            </Text>
                        </Pressable>
                    ) : null}
                    <Pressable accessibilityRole="button" disabled={busy || !projects.length} className="min-h-11 justify-center px-2"
                        onPress={() => setReviewPicker(t)}>
                        <Text className={`text-sm ${projects.length ? 'text-primary' : 'text-muted-foreground'}`}>Выбрать проект</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" disabled={busy} className="min-h-11 justify-center px-2"
                        onPress={() => assignReviewProject(t, null)}>
                        <Text className="text-sm">Оставить во входящих</Text>
                    </Pressable>
                </Box>
            ) : null}
            </Box>
        )
    }
    const thoughtsScreen = () => {
        const filtered = thoughts.filter(
            (t) =>
                (selected === 'all' ||
                    (selected === 'inbox' && !t.projectId) ||
                    (selected === 'review' && !t.aiPending && t.status === 'needs_review') ||
                    (selected === 'notion-errors' && Boolean(notionStatus(t).error)) ||
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
                            ...(inboxReview.length || selected === 'review'
                                ? [{ id: 'review', name: `На проверку · ${inboxReview.length}` }]
                                : []),
                            ...(notionErrorCount || selected === 'notion-errors'
                                ? [{ id: 'notion-errors', name: `Ошибки Notion · ${notionErrorCount}` }]
                                : []),
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
                                {selected === 'notion-errors' && !notionErrorCount
                                    ? 'Ошибок Notion нет'
                                    : selected === 'review' && !inboxReview.length
                                        ? 'Всё разобрано'
                                        : thoughts.length ? 'Ничего не найдено' : 'Пока нет мыслей'}
                            </Heading>
                            <Text className="text-center text-sm leading-5 text-muted-foreground">
                                {selected === 'notion-errors' && !notionErrorCount
                                    ? 'Здесь появятся мысли, которые не удалось синхронизировать.'
                                    : selected === 'review' && !inboxReview.length
                                    ? 'Новые предложения появятся здесь.'
                                    : thoughts.length
                                    ? 'Попробуй другой поиск или фильтр.'
                                    : 'Запиши или продиктуй первую мысль. Интернет для сохранения не нужен.'}
                            </Text>
                            {!thoughts.length && selected !== 'notion-errors'
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
                <Box className="shrink-0 gap-2 border-t border-border bg-card px-5 py-3">
                    <TextInput
                        ref={input}
                        accessibilityLabel="Новая мысль"
                        placeholder="Что у тебя в голове?"
                        value={draft}
                        onChangeText={persistDraft}
                        multiline
                        maxLength={10000}
                        editable={!busy}
                        className="max-h-28 min-h-11 py-2 text-base text-foreground placeholder:text-muted-foreground"
                    />
                    <Box className="flex-row items-center justify-between gap-3">
                        <Pressable
                            accessibilityRole="button"
                            onPress={() => {
                                Keyboard.dismiss()
                                setPicker(true)
                            }}
                            className="min-h-11 max-w-[80%] flex-row items-center gap-2 rounded-full bg-secondary px-3"
                        >
                            <Text className="shrink text-sm font-medium" numberOfLines={1}>
                                Проект: {draftProject ? projectName(draftProject) : 'Авто'}
                            </Text>
                            <Icon name="chevron-down" size={16} />
                        </Pressable>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={hasDraft ? 'Сохранить мысль' : 'Начать диктовку'}
                            disabled={busy || voice.nativeBusy}
                            onPress={hasDraft ? () => void saveThought() : startVoice}
                            className={`h-12 w-12 items-center justify-center rounded-full bg-primary ${busy || voice.nativeBusy ? 'opacity-50' : ''}`}
                        >
                            <Icon
                                name={hasDraft ? 'arrow-up' : 'mic-outline'}
                                tone="text-primary-foreground"
                            />
                        </Pressable>
                    </Box>
                </Box>
            </>
        )
    }
    const projectsScreen = () => (
        <ScrollView className="flex-1" contentContainerClassName="gap-5 px-5 pb-8">
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
                        onPress={() => {
                            setError('')
                            setProjectEditor({
                                ...p,
                                notionPageId: p.notionPageRoot === getNotionRoot() ? p.notionPageId : undefined
                            })
                        }}
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
        <ScrollView className="flex-1" contentContainerClassName="gap-5 px-5 pb-8">
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
            <Heading>История использования ИИ</Heading>
            <Text className="text-sm text-muted-foreground">Последние 500 обработок · история хранится на телефоне</Text>
            {!state.aiHistory.length ? <Info>Здесь появятся обращения к ИИ после первой обработки мысли. Без сети новые обращения не выполняются.</Info> : null}
            {[...state.aiHistory].reverse().slice(0, historyLimit).map((entry) => (
                <Pressable key={entry.id} accessibilityLabel={`Обработка ИИ: ${entry.inputText.slice(0, 70)}`} onPress={() => setHistoryId(entry.id)} className="gap-2 rounded-3xl border border-border bg-card p-4">
                    <Box className="flex-row justify-between gap-3">
                        <Text className={`text-sm font-semibold ${entry.status === 'error' ? 'text-destructive' : 'text-primary'}`}>{historyStatus[entry.status]}</Text>
                        <Text className="text-xs text-muted-foreground">{new Date(entry.startedAt).toLocaleString('ru-RU')}</Text>
                    </Box>
                    <Text numberOfLines={2}>{entry.inputText}</Text>
                    <Text className="text-xs text-muted-foreground" numberOfLines={2}>{[entry.generatorModel, entry.decisionModel].filter(Boolean).join(' · ') || 'Модель не сообщена'}</Text>
                    <Text className="text-xs text-muted-foreground">{entry.durationMs === undefined ? 'Завершение не получено' : `${(entry.durationMs / 1000).toFixed(1)} с`}{entry.usage?.totalTokens !== undefined ? ` · ${entry.usage.totalTokens} токенов` : ''}{entry.usage?.costUsd !== undefined ? ` · $${entry.usage.costUsd.toFixed(6)}` : ''}</Text>
                </Pressable>
            ))}
            {state.aiHistory.length > historyLimit ? <Action secondary onPress={() => setHistoryLimit(historyLimit + 20)}>Показать ещё</Action> : null}
        </ScrollView>
    )
    return (
        <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-background">
            <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
            <KeyboardAvoidingView
                className="mx-auto w-full max-w-3xl flex-1"
                behavior={Platform.OS === 'web' ? undefined : 'padding'}
                keyboardVerticalOffset={top}
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
                            onPress={() => {
                                setError('')
                                setProjectEditor({
                                    name: '',
                                    description: '',
                                    color: rgb(accents[0].light)
                                })
                            }}
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
                {!keyboardOpen && (page !== 'settings' || section === 'home') ? (
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
                                            page === tab.id
                                                ? 'text-primary'
                                                : 'text-muted-foreground'
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
                ) : null}
            </KeyboardAvoidingView>
            <Sheet visible={Boolean(historyEntry)} title="Обработка ИИ" onClose={() => setHistoryId(null)}>
                {historyEntry ? <>
                    <Info>{historyStatus[historyEntry.status]} · {new Date(historyEntry.startedAt).toLocaleString('ru-RU')}</Info>
                    <Text className="text-sm font-semibold">Исходный текст</Text>
                    <Text selectable>{historyEntry.inputText}</Text>
                    <Text className="text-sm font-semibold">Модели</Text>
                    <Text selectable>{[historyEntry.provider, historyEntry.generatorModel, historyEntry.decisionModel].filter(Boolean).join('\n') || 'Не сообщены'}</Text>
                    {historyEntry.result ? <>
                        <Text className="text-sm font-semibold">Ответ ИИ</Text>
                        <Text selectable>{historyEntry.result.title}</Text>
                        <Text selectable>{historyEntry.result.summary}</Text>
                        <Text className="text-sm text-muted-foreground">{historyEntry.result.category ? categories[historyEntry.result.category] : ''} · {projectName(historyEntry.result.projectId || null)}</Text>
                        {historyEntry.result.classificationProposal ? <Info>Предложение, возвращённое ИИ: {[historyEntry.result.classificationProposal.project?.name, historyEntry.result.classificationProposal.category?.name].filter(Boolean).join(' · ')}. {historyEntry.result.classificationProposal.reason}</Info> : null}
                        {historyEntry.applied === false ? <Info warning>Ответ сохранён в истории, но не применён: мысль была изменена или удалена во время обработки.</Info> : null}
                    </> : null}
                    {historyEntry.error ? <Info warning>{historyEntry.error}</Info> : null}
                    <Text className="text-sm font-semibold">Расход, сообщённый провайдером</Text>
                    <Text>{historyEntry.usage?.requests !== undefined ? `Запросов: ${historyEntry.usage.requests}\n` : ''}{historyEntry.usage?.promptTokens !== undefined ? `Вход: ${historyEntry.usage.promptTokens} токенов\n` : ''}{historyEntry.usage?.completionTokens !== undefined ? `Выход: ${historyEntry.usage.completionTokens} токенов\n` : ''}{historyEntry.usage?.costUsd !== undefined ? `Стоимость из ответов: $${historyEntry.usage.costUsd.toFixed(6)}` : 'Стоимость не сообщена'}</Text>
                    <Text className="text-xs text-muted-foreground">Ключи доступа и заголовки запросов в историю не записываются.</Text>
                </> : null}
            </Sheet>
            <Sheet visible={picker} title="Проект для мысли" onClose={() => setPicker(false)}>
                {[{ id: null, name: 'Авто' }, ...(lastProject ? [lastProject] : []),
                    ...projects.filter((project) => project.id !== lastProject?.id)].map((p) => (
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
                        <Box className="flex-1 py-2">
                            <Text>{p.name}{p.id === lastProject?.id ? ' · Недавний' : ''}</Text>
                            {p.id ? <Text className="text-xs text-muted-foreground">{draftDestination(p.id)}</Text> : null}
                        </Box>
                    </Pressable>
                ))}
            </Sheet>
            <Sheet visible={Boolean(reviewPicker)} title="Выбрать проект" onClose={() => setReviewPicker(null)}>
                {error ? <Info warning>{error}</Info> : null}
                {reviewPicker ? projects.map((project) => (
                    <Pressable key={project.id} accessibilityRole="button" disabled={busy}
                        onPress={() => assignReviewProject(reviewPicker, project.id)}
                        className="min-h-11 justify-center border-b border-border">
                        <Text>{project.name}</Text>
                    </Pressable>
                )) : null}
            </Sheet>
            <Sheet
                visible={projectEditor !== null}
                title={projectEditor?.id ? 'Изменить проект' : 'Новый проект'}
                onClose={() => setProjectEditor(null)}
            >
                {error ? <Info warning>{error}</Info> : null}
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
                <Field
                    label="Страница проекта в Notion"
                    placeholder="Ссылка или ID страницы"
                    autoCapitalize="none"
                    value={projectEditor?.notionPageId ?? ''}
                    onChangeText={(value) => setProjectEditor({ ...projectEditor, notionPageId: value })}
                />
                <Text className="text-sm text-muted-foreground">
                    Дай интеграции доступ к странице. Пустое поле возвращает заметки в папку проекта
                    внутри общего хранилища Thoughts.
                </Text>
                {linkedProjectPage ? (
                    <Action secondary onPress={() => void run(() =>
                        Linking.openURL(`https://www.notion.so/${linkedProjectPage}`)
                    )}>
                        Открыть в Notion
                    </Action>
                ) : null}
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
                                color: projectEditor.color || rgb(accents[0].light),
                                notionPageId: projectEditor.notionPageId
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
            <Sheet
                visible={Boolean(savedEditing)}
                title={noteMode === 'edit' ? 'Редактирование' : noteMode === 'revise' ? 'Правка с ИИ' : 'Мысль'}
                onClose={closeNote}
                headerActions={noteMode === 'read' ? (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Действия с мыслью"
                        accessibilityState={{ expanded: noteMenu }}
                        disabled={busy}
                        className="h-12 w-12 items-center justify-center rounded-full active:bg-muted"
                        onPress={() => setNoteMenu(!noteMenu)}
                    >
                        <Icon name="ellipsis-horizontal" tone="text-foreground" />
                    </Pressable>
                ) : null}
            >
                {noteMenu && savedEditing ? (
                    <Box className="w-full max-w-xs self-end rounded-2xl border border-border bg-card p-1">
                        {noteAction('Редактировать', 'create-outline', () => {
                            setEditing({ ...savedEditing })
                            setCopyNotice('')
                            setNoteMode('edit')
                        })}
                        {noteAction('Поделиться мыслью', 'share-outline', () => void run(shareThought))}
                        {noteAction('Скопировать текст', 'copy-outline', () => void run(() =>
                            copyThought(editingText, 'Текст скопирован')
                        ))}
                        {editingNotionUrl ? <>
                            {noteAction('Открыть в Notion', 'open-outline', () => void run(() => Linking.openURL(editingNotionUrl)))}
                            {noteAction('Скопировать ссылку Notion', 'link-outline', () => void run(() =>
                                copyThought(editingNotionUrl, 'Ссылка Notion скопирована')
                            ))}
                        </> : null}
                        {noteAction('Обработать ИИ ещё раз', 'refresh-outline', () => {
                            setFeedback(savedEditing.aiFeedback || '')
                            setCopyNotice('')
                            setNoteMode('revise')
                        })}
                        <Box className="my-1 border-t border-border" />
                        {noteAction('Удалить мысль', 'trash-outline', () => confirmDelete('Удалить мысль?', () =>
                            void run(async () => {
                                await api.deleteThought(savedEditing.id)
                                setEditing(null)
                            })
                        ), true)}
                    </Box>
                ) : null}
                {error ? <Info warning>{error}</Info> : null}
                {copyNotice && noteMode === 'read' ? <Text accessibilityLiveRegion="polite" className="text-sm text-primary">{copyNotice}</Text> : null}
                {noteMode === 'read' && savedEditing ? <>
                    <Box className="gap-2">
                        <Text className="text-sm text-muted-foreground">{projectName(savedEditing.projectId)} · {categories[savedEditing.category] || 'Заметка'}</Text>
                        <Heading selectable className="text-2xl">
                            {savedEditing.title || 'Без названия'}
                        </Heading>
                    </Box>
                    {savedEditing.summary ? (
                        <NoteSummary summary={savedEditing.summary} disabled={busy}
                            onToggle={(index) => void run(() => api.updateChecklist(savedEditing.id, savedEditing.revision, index))}
                            onConvert={() => void run(() => api.updateChecklist(savedEditing.id, savedEditing.revision))}
                        />
                    ) : null}
                    <Box className="gap-2">
                        <Text className="text-sm font-semibold text-muted-foreground">Исходный текст</Text>
                        <Text selectable className="text-base leading-6">{savedEditing.rawText}</Text>
                    </Box>
                    {savedEditing.tags.length ? (
                        <Text className="text-sm text-muted-foreground">{savedEditing.tags.join(' · ')}</Text>
                    ) : null}
                    <Box className="gap-2 border-t border-border pt-3">
                        <Text className="text-xs text-muted-foreground">
                            {editingNotion?.label}
                            {savedEditing.aiPending ? (savedEditing.aiFeedback ? ' · Правка ИИ в очереди' : ' · В очереди ИИ') : ''}
                        </Text>
                        {savedEditing.aiFeedback && savedEditing.errorMessage ? <Info warning>{savedEditing.errorMessage}</Info> : null}
                        {editingNotion?.error ? <>
                            <Info warning>{editingNotion.error}</Info>
                            <Action secondary disabled={busy || !sync.online || sync.syncing}
                                onPress={() => void run(syncLocalData)}>
                                Повторить синхронизацию
                            </Action>
                        </> : null}
                    </Box>
                    {proposalNote?.classificationProposal ? (
                        <Box className="gap-4 rounded-3xl border border-primary bg-secondary p-4">
                            <Text className="text-base font-semibold">Предложение DeepSeek</Text>
                            <Text className="text-sm">Jev не определил проект или тип уверенно. Ничего не создаётся без твоего подтверждения.</Text>
                            <Text className="text-sm text-muted-foreground">{proposalNote.classificationProposal.reason}</Text>
                            {(['project', 'category'] as const).map((key) => {
                                const item = proposalNote.classificationProposal?.[key]
                                return item ? <Box key={key} className="gap-2">
                                    <Field label={key === 'project' ? 'Предложен новый проект' : 'Предложен новый тип'} value={item.name} maxLength={80} onChangeText={(name) => setEditing({ ...proposalNote, classificationProposal: { ...proposalNote.classificationProposal!, [key]: { ...item, name } } })} />
                                    <Field label="Описание" value={item.description} maxLength={400} onChangeText={(description) => setEditing({ ...proposalNote, classificationProposal: { ...proposalNote.classificationProposal!, [key]: { ...item, description } } })} />
                                </Box> : null
                            })}
                            <Action disabled={busy} onPress={() => void run(async () => {
                                await localRepository.confirmClassification(proposalNote.id, proposalNote.revision, proposalNote.classificationProposal!)
                                void syncLocalData()
                                setEditing(null)
                                setNotice('Предложение подтверждено и сохранено на телефоне')
                            })}>Подтвердить создание и применить</Action>
                            <Action secondary disabled={busy} onPress={() => void run(async () => {
                                await localRepository.dismissClassification(proposalNote.id, proposalNote.revision)
                                setEditing(null)
                                setNotice('Предложение отклонено. Можно выбрать проект и тип вручную.')
                            })}>Отклонить предложение</Action>
                        </Box>
                    ) : null}
                </> : null}
                {noteMode === 'edit' ? <>
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
                        disabled={busy || !hasUnsavedEdits || !editing?.rawText.trim()}
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
                                }, editing.revision)
                                setNoteMode('read')
                            })
                        }
                    >
                        Сохранить изменения
                    </Action>
                </> : null}
                {noteMode === 'revise' && savedEditing ? <>
                    <Field
                        label="Что исправить?"
                        placeholder="Например, сократи резюме и вынеси задачи списком"
                        value={feedback}
                        onChangeText={setFeedback}
                        multiline
                        maxLength={1000}
                        editable={!busy}
                    />
                    <Text className="text-sm text-muted-foreground">ИИ обновит название, резюме и теги по твоей правке. Исходный текст сохранится.</Text>
                    <Action disabled={busy || !feedback.trim()} onPress={() => void run(async () => {
                        await api.processThought(savedEditing.id, feedback)
                        setFeedback('')
                        setNoteMode('read')
                    })}>
                        Применить правку
                    </Action>
                </> : null}
            </Sheet>
            <Modal visible={voiceScreen} animationType="slide" onRequestClose={cancelVoice}>
                <SafeAreaView className="flex-1 bg-background">
                    <Box className="mx-auto w-full max-w-xl flex-1 px-5 pt-5">
                    <ScrollView className="flex-1" contentContainerClassName="gap-6 pb-4">
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
                                {voice.phase === 'starting' ? 'Запускаем микрофон…'
                                    : voice.recording ? 'Идёт запись'
                                    : voice.phase === 'finishing' ? 'Завершаем диктовку…'
                                    : voice.phase === 'error' ? 'Запись остановлена' : 'Пауза'}
                            </Text>
                            <Text accessibilityLabel={`Время записи ${clock(voice.seconds)}`} className="text-6xl font-bold">{clock(voice.seconds)}</Text>
                        </Box>
                        <Box accessibilityLabel="Уровень звука микрофона" className="h-24 flex-row items-center justify-center gap-1">
                            {[
                                16, 28, 44, 24, 58, 72, 46, 32, 62, 84, 52, 38, 66, 76, 42, 26, 54,
                                68, 36, 22, 46, 58, 32, 18, 30, 20
                            ].map((height, index) => (
                                <Box
                                    key={index}
                                    className="w-1.5 rounded-full bg-primary"
                                    style={{ height: 6 + height * voice.level }}
                                />
                            ))}
                        </Box>
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
                        {voice.hint ? <Info>{voice.hint}</Info> : null}
                    </ScrollView>
                        <Box className="flex-row items-end justify-around pb-4">
                            <Box className="items-center gap-2">
                                <Pressable
                                    accessibilityLabel={
                                        voice.recording || voice.phase === 'starting' ? 'Пауза' : 'Продолжить диктовку'
                                    }
                                    disabled={voice.phase === 'pausing' || voice.phase === 'finishing' || (voice.nativeBusy && !voice.recording && voice.phase !== 'starting')}
                                    onPress={() => {
                                        if (voice.recording || voice.phase === 'starting') voice.pause()
                                        else void voice.resume()
                                    }}
                                    className="h-16 w-16 items-center justify-center rounded-full border border-border bg-card"
                                >
                                    <Icon
                                        name={voice.recording || voice.phase === 'starting' ? 'pause' : 'play'}
                                        tone="text-foreground"
                                    />
                                </Pressable>
                                <Text className="text-xs text-muted-foreground">
                                    {voice.recording || voice.phase === 'starting' ? 'Пауза' : 'Продолжить'}
                                </Text>
                            </Box>
                            <Box className="items-center gap-2">
                                <Pressable
                                    accessibilityLabel="Готово"
                                    disabled={voice.phase === 'finishing'}
                                    onPress={() => void finishVoice()}
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
