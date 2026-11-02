import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './global.css';
import { Button as GSButton, ButtonText as GSButtonText, ButtonSpinner as GSButtonSpinner } from './components/ui/button';
import { Card as GSCard, Heading as GSHeading, VStack as GSVStack, Text as GSText } from './components/ui/surfaces';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StatusBar, StyleSheet, Text, TextInput, View, useWindowDimensions
} from 'react-native';
import { api, getApiUrl, loadApiUrl, saveApiUrl, type AIConfig, type Category, type Project, type Settings, type Thought } from './src/api';
import { useVoiceInput } from './src/useVoiceInput';

type Page = 'inbox' | 'projects' | 'settings';
type Selected = 'all' | 'inbox' | string;
const C = {
  bg:'#F6F7FB', ink:'#1E2442',muted:'#858AA0',light:'#AFB4C3',
  purple:'#6259E8',pale:'#F0EFFF',line:'#E7E9F2',white:'#FFFFFF',
  green:'#1F936A',greenBg:'#E8F8F1',amber:'#A36F18',amberBg:'#FFF5E2',red:'#C75058'
};
const categoryLabels: Record<Category,string> = {
  idea:'Идея',task:'Задача',bug:'Баг',research:'Исследование',note:'Заметка'
};
const categoryEmoji: Record<Category,string> = {
  idea:'✦',task:'✓',bug:'!',research:'◈',note:'≡'
};
const colors = ['#6259E8','#2F9C85','#E49B42','#D66A9B','#4D96CE','#A273D2'];
const rdate = (str:string) => {
  try { return new Date(str).toLocaleDateString('ru-RU',{day:'numeric',month:'short'}); }
  catch { return ''; }
};
const trimText = (value:string,n:number) => value.length > n ? `${value.slice(0,n-1)}…` : value;

function Btn({children,onPress,kind='primary',disabled=false,small=false,loading=false}: {
  children:React.ReactNode;onPress:()=>void;kind?:'primary'|'ghost'|'outline'|'danger';
  disabled?:boolean;small?:boolean;loading?:boolean
}) {
  const variant = kind==='primary'?'default':kind==='danger'?'destructive':kind;
  return <GSButton onPress={onPress} disabled={disabled||loading} variant={variant} size={small?'sm':'default'}>
    {loading?<GSButtonSpinner variant={variant}/>:<GSButtonText variant={variant} size={small?'sm':'default'}>{children}</GSButtonText>}
  </GSButton>;
}
function Label({children}: {children:React.ReactNode}) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}
function Chip({children,selected,onPress,color}: {children:React.ReactNode;selected?:boolean;onPress:()=>void;color?:string}) {
  return <GSButton onPress={onPress} variant={selected?'secondary':'outline'} size="sm"
    accessibilityState={{selected:!!selected}} className="rounded-lg">
    <GSButtonText variant={selected?'secondary':'outline'} size="sm">{children}</GSButtonText>
  </GSButton>;
}
function SectionHeading({title,caption,action}: {title:string;caption?:string;action?:React.ReactNode}) {
  return <View style={styles.sectionHeading}><View style={{flex:1}}><GSHeading>{title}</GSHeading>{caption?<Text style={styles.muted}>{caption}</Text>:null}</View>{action}</View>;
}
function Empty({icon,title,description}: {icon:string;title:string;description:string}) {
  return <GSVStack className="items-center rounded-2xl border border-dashed border-border bg-card p-8"><GSText className="text-4xl">{icon}</GSText><GSHeading>{title}</GSHeading><GSText className="text-center text-sm text-muted-foreground">{description}</GSText></GSVStack>;
}
const confirmAction = (title:string, message:string, yes:()=>void) => {
  if (Platform.OS==='web') {
    if (typeof window!=='undefined' && window.confirm(`${title}\n${message}`)) yes();
  } else Alert.alert(title,message,[{text:'Отмена',style:'cancel'},{text:'Удалить',style:'destructive',onPress:yes}]);
};

export default function App() {
  const {width} = useWindowDimensions();
  const wide = width>=920;
  const [page,setPage] = useState<Page>('inbox');
  const [selected,setSelected] = useState<Selected>('all');
  const [projects,setProjects] = useState<Project[]>([]);
  const [thoughts,setThoughts] = useState<Thought[]>([]);
  const [settings,setSettings] = useState<Settings|null>(null);
  const [config,setConfig] = useState<AIConfig|null>(null);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [apiUrlInput,setApiUrlInput] = useState(getApiUrl());
  const [draft,setDraft] = useState('');
  const voice = useVoiceInput(setDraft);
  const [draftProject,setDraftProject] = useState<string|null>(null);
  const [search,setSearch] = useState('');
  const [filter,setFilter] = useState<'all'|'needs_review'|'ready'>('all');
  const [projectModal,setProjectModal] = useState(false);
  const [projectEdit,setProjectEdit] = useState<Project|null>(null);
  const [projectName,setProjectName] = useState('');
  const [projectDesc,setProjectDesc] = useState('');
  const [projectColor,setProjectColor] = useState(colors[0]);
  const [editing,setEditing] = useState<Thought|null>(null);
  const [editTitle,setEditTitle] = useState('');
  const [editRaw,setEditRaw] = useState('');
  const [editSummary,setEditSummary] = useState('');
  const [editProject,setEditProject] = useState<string|null>(null);
  const [editCategory,setEditCategory] = useState<Category>('note');

  const refresh = useCallback(async () => {
    try {
      const [p,t,s,c] = await Promise.all([api.projects(),api.thoughts(),api.settings(),api.config()]);
      setProjects(p);setThoughts(t);setSettings(s);setConfig(c);setError('');
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(()=>{
    void loadApiUrl().then(url=>{setApiUrlInput(url);return refresh();});
  },[refresh]);
  const updateServer = () => {
    void (async () => {
      try {
        await saveApiUrl(apiUrlInput);
        setNotice('Адрес сервера сохранён на устройстве');
        setLoading(true);
        await refresh();
      } catch(e) { setError((e as Error).message); }
      finally { setLoading(false); }
    })();
  };

  const shownThoughts = useMemo(()=>thoughts.filter(t=>{
    if (selected==='inbox' && t.projectId!==null) return false;
    if (selected!=='inbox' && selected!=='all' && t.projectId!==selected) return false;
    if (filter!=='all' && t.status!==filter) return false;
    const q=search.toLocaleLowerCase().trim();
    return !q || [t.rawText,t.title,t.summary,...t.tags].join(' ').toLocaleLowerCase().includes(q);
  }),[thoughts,selected,filter,search]);
  const reviewCount = thoughts.filter(t=>t.status==='needs_review').length;
  const unassignedCount=thoughts.filter(t=>!t.projectId).length;
  const selectedLabel=selected==='all'?'Все мысли':selected==='inbox'?'Без проекта':projects.find(p=>p.id===selected)?.name||'Проект';
  const projectNameById=(id:string|null)=>projects.find(p=>p.id===id)?.name||'Inbox';

  const goInbox=(id:Selected='all')=>{setPage('inbox');setSelected(id);setFilter('all');};
  const perform = async(fn:()=>Promise<void>)=>{
    setBusy(true);setError('');setNotice('');
    try {await fn();await refresh();} catch(e){setError((e as Error).message);} finally {setBusy(false);}
  };
  const createThought=()=>{
    if(!draft.trim()||busy||voice.active) return;
    void perform(async()=>{
      const t=await api.createThought(draft.trim(),draftProject);
      setDraft('');setDraftProject(null);
      setNotice(t.status==='ready'?'Мысль сохранена и распределена по проекту':t.status==='needs_review'?'Мысль сохранена. Проверь классификацию':'Мысль сохранена в SQLite. Обработку можно повторить позже');
      setPage('inbox');setSelected('all');
    });
  };
  const showNewProject=(p?:Project)=>{
    setProjectEdit(p||null);setProjectName(p?.name||'');setProjectDesc(p?.description||'');setProjectColor(p?.color||colors[projects.length%colors.length]);setProjectModal(true);
  };
  const saveProject=()=>{
    if (!projectName.trim()) return;
    void perform(async()=>{
      if(projectEdit) await api.updateProject(projectEdit.id,{name:projectName.trim(),description:projectDesc.trim(),color:projectColor});
      else await api.createProject({name:projectName.trim(),description:projectDesc.trim(),color:projectColor});
      setProjectModal(false);
    });
  };
  const showEdit=(t:Thought)=>{
    setEditing(t);setEditTitle(t.title);setEditRaw(t.rawText);setEditSummary(t.summary);setEditProject(t.projectId);setEditCategory(t.category);
  };
  const saveThought=()=>{
    if(!editing||!editRaw.trim()||!editTitle.trim()) return;
    void perform(async()=>{
      await api.updateThought(editing.id,{title:editTitle.trim(),rawText:editRaw.trim(),summary:editSummary.trim(),projectId:editProject,category:editCategory,status:'ready'});
      setEditing(null);
      setNotice('Изменения сохранены');
    });
  };
  const process=(id:string)=>void perform(async()=>{
    const t=await api.processThought(id);
    setNotice(t.status==='ready'?'AI обработка завершена':'Мысль обновлена. Проверь её статус');
  });
  const deleteThought=(t:Thought)=>confirmAction('Удалить мысль?', 'Это действие нельзя отменить.',()=>void perform(async()=>{
    await api.deleteThought(t.id);setEditing(null);
  }));
  const deleteProject=(p:Project)=>confirmAction('Удалить проект?', 'Его мысли останутся в Inbox без проекта.',()=>void perform(async()=>{
    await api.deleteProject(p.id);setProjectModal(false);goInbox();
  }));
  const saveSettings=()=>{
    if (!settings) return;
    void perform(async()=>{
      setSettings(await api.saveSettings(settings));setNotice('Настройки AI сохранены');
    });
  };

  const sideNav=()=><View style={styles.sidebar}>
    <View style={styles.brand}><View style={styles.logo}><Text style={styles.logoIcon}>✳</Text></View><View><Text style={styles.brandText}>thoughts<Text style={{color:C.purple}}>.</Text></Text><Text style={styles.brandCaption}>YOUR SECOND BRAIN</Text></View></View>
    <View style={styles.sideSection}>
      <Text style={styles.sideOverline}>РАБОЧЕЕ ПРОСТРАНСТВО</Text>
      <Pressable onPress={()=>goInbox()} style={[styles.navItem,page==='inbox'&&selected==='all'&&styles.navSelected]}><Text style={styles.navIcon}>▦</Text><Text style={[styles.navLabel,page==='inbox'&&selected==='all'&&styles.navLabelSelected]}>Все мысли</Text><Text style={styles.navCounter}>{thoughts.length}</Text></Pressable>
      <Pressable onPress={()=>goInbox('inbox')} style={[styles.navItem,page==='inbox'&&selected==='inbox'&&styles.navSelected]}><Text style={styles.navIcon}>⌑</Text><Text style={styles.navLabel}>Inbox</Text><Text style={styles.navCounter}>{unassignedCount}</Text></Pressable>
      <Pressable onPress={()=>{goInbox();setFilter('needs_review');}} style={styles.navItem}><Text style={styles.navIcon}>◇</Text><Text style={styles.navLabel}>На проверку</Text><Text style={styles.navCounter}>{reviewCount}</Text></Pressable>
    </View>
    <View style={[styles.sideSection,{marginTop:20}]}>
      <View style={styles.sideHeadingRow}><Text style={styles.sideOverline}>ПРОЕКТЫ</Text><Pressable onPress={()=>showNewProject()} style={styles.plus}><Text style={{fontSize:20,color:C.purple}}>＋</Text></Pressable></View>
      {projects.map(p=><Pressable key={p.id} onPress={()=>goInbox(p.id)} style={[styles.navItem,page==='inbox'&&selected===p.id&&styles.navSelected]}><View style={[styles.projectDot,{backgroundColor:p.color}]}/><Text numberOfLines={1} style={styles.navLabel}>{p.name}</Text><Text style={styles.navCounter}>{p.thoughtCount||0}</Text></Pressable>)}
      <Pressable onPress={()=>setPage('projects')} style={styles.simpleLink}><Text style={{color:C.purple,fontWeight:'600'}}>Управление проектами →</Text></Pressable>
    </View>
    <View style={{flex:1}}/>
    <Pressable onPress={()=>setPage('settings')} style={[styles.navItem,page==='settings'&&styles.navSelected]}><Text style={styles.navIcon}>⚙</Text><Text style={styles.navLabel}>Настройки AI</Text></Pressable>
    <View style={styles.sideFooter}><Text style={styles.sideFooterText}>SQLite • OpenRouter • Expo</Text><Text style={styles.sideFooterSmall}>MVP v0.1</Text></View>
  </View>;

  const topMobile=()=><View style={styles.mobileHeader}>
    <View style={{flexDirection:'row',alignItems:'center',gap:10}}><View style={[styles.logo,{width:35,height:35}]}><Text style={styles.logoIcon}>✳</Text></View><Text style={styles.brandText}>thoughts<Text style={{color:C.purple}}>.</Text></Text></View>
    <Pressable onPress={()=>setPage('settings')} style={styles.topSettings}><Text style={{fontSize:19}}>⚙</Text></Pressable>
  </View>;

  const composer=()=><GSCard className="border-primary/20 p-5">
    <View style={styles.composerTop}><Text style={{fontWeight:'700',color:C.ink,fontSize:15}}>✦  Новая мысль</Text><Text style={styles.smallMuted}>Напиши или продиктуй на русском</Text></View>
    <TextInput accessibilityLabel="Запиши свою мысль" style={styles.composerInput} multiline editable={!voice.active} placeholder="Напиши идею или нажми 🎙 и скажи её вслух…" placeholderTextColor={C.light} value={draft} onChangeText={setDraft} textAlignVertical="top" maxLength={10000}/>
    <View style={styles.voiceRow}>
      <Pressable accessibilityRole="button" accessibilityLabel={voice.active?'Остановить запись голоса':'Начать диктовку на русском'}
        onPress={()=>voice.active?voice.stop():void voice.start(draft)} disabled={busy}
        style={[styles.voiceButton,voice.active&&styles.voiceButtonActive]}>
        <Text style={{fontWeight:'800',color:voice.active?C.red:C.purple}}>{voice.active?'■ Завершить':'🎙 Диктовать'}</Text>
      </Pressable>
      <Text style={styles.voiceState}>{voice.state==='listening'?'● Слушаю…':voice.state==='starting'?'Запуск микрофона…':voice.state==='stopping'?'Завершаю…':'Русский · ru-RU'}</Text>
    </View>
    {voice.error?<Text style={styles.voiceError}>{voice.error}</Text>:null}
    {Platform.OS!=='web'?<Pressable onPress={()=>!voice.active&&voice.setOnDeviceOnly(!voice.onDeviceOnly)} disabled={voice.active}>
      <Text style={styles.voicePrivacy}>{voice.onDeviceOnly?'☑':'☐'} Только на устройстве (нужен русский офлайн-пакет)</Text>
    </Pressable>:null}
    <Text style={styles.voicePrivacy}>Аудио не отправляется в Thoughts API и не сохраняется. Системный распознаватель может передавать его своему провайдеру. Проверяй текст перед сохранением.</Text>
    <View style={styles.composerDivider}/>
    <View style={styles.composerBottom}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flex:1}} contentContainerStyle={{gap:6,alignItems:'center'}}>
        <Chip selected={!draftProject} onPress={()=>setDraftProject(null)}>✧ Авто-проект</Chip>
        {projects.map(p=><Chip key={p.id} selected={draftProject===p.id} onPress={()=>setDraftProject(p.id)}>{p.name}</Chip>)}
      </ScrollView>
      <Btn onPress={createThought} disabled={!draft.trim()||busy||voice.active} loading={busy} small>Сохранить ↗</Btn>
    </View>
  </GSCard>;

  const thoughtCard=(t:Thought)=><Pressable key={t.id} onPress={()=>showEdit(t)} style={({pressed})=>[styles.thoughtCard,pressed&&{opacity:.78}]}>
    <View style={styles.cardTop}>
      <View style={[styles.catIcon,{backgroundColor:t.category==='idea'?'#F0EFFF':t.category==='task'?'#E9F8F2':'#F3F5FA'}]}><Text style={{color:C.purple,fontSize:19,fontWeight:'800'}}>{categoryEmoji[t.category]}</Text></View>
      <View style={{flex:1}}><Text style={styles.thoughtTitle} numberOfLines={2}>{t.title||trimText(t.rawText,70)}</Text><Text style={styles.thoughtMeta}>{rdate(t.createdAt)} · {categoryLabels[t.category]}</Text></View>
      <View style={[styles.statusBadge,t.status==='ready'?{backgroundColor:C.greenBg}:t.status==='needs_review'?{backgroundColor:C.amberBg}:{backgroundColor:'#F2F2F6'}]}><Text style={[styles.statusBadgeText,{color:t.status==='ready'?C.green:t.status==='needs_review'?C.amber:C.muted}]}>{t.status==='ready'?'✓ Готово':t.status==='needs_review'?'◇ Проверить':t.status==='processing'?'⌛ В работе':'◌ Ожидает'}</Text></View>
    </View>
    <Text style={styles.thoughtSummary} numberOfLines={3}>{t.summary||t.rawText}</Text>
    <View style={styles.thoughtBottom}>
      <View style={styles.projectTag}><View style={[styles.projectDot,{backgroundColor:projects.find(p=>p.id===t.projectId)?.color||'#ABB1C8'}]}/><Text style={styles.projectTagText} numberOfLines={1}>{projectNameById(t.projectId)}</Text></View>
      {t.tags.slice(0,2).map(tag=><Text key={tag} style={styles.hashTag}>#{tag}</Text>)}
      <View style={{flex:1}}/><Text style={{color:C.light,fontSize:18}}>›</Text>
    </View>
  </Pressable>;

  const inbox=()=><View style={styles.pageContent}>
    <View style={styles.greeting}><Text style={styles.eyebrow}>ЛИЧНОЕ ПРОСТРАНСТВО ДЛЯ ИДЕЙ</Text><Text style={styles.title}>Сохраняй мысли.<Text style={{color:C.purple}}> Думай дальше.</Text></Text><Text style={styles.subtitle}>Всё важное в одном месте. Jev разложит по проектам, DeepSeek выделит главное.</Text></View>
    {composer()}
    <View style={styles.metrics}>
      <View style={styles.metricCard}><Text style={styles.metricCount}>{thoughts.length}</Text><Text style={styles.metricLabel}>Всего мыслей</Text></View>
      <View style={styles.metricCard}><Text style={styles.metricCount}>{projects.length}</Text><Text style={styles.metricLabel}>Проектов</Text></View>
      <View style={styles.metricCard}><Text style={[styles.metricCount,{color:reviewCount?C.amber:C.ink}]}>{reviewCount}</Text><Text style={styles.metricLabel}>На проверку</Text></View>
    </View>
    <SectionHeading title={selectedLabel} caption={`${shownThoughts.length} записей`}/>
    <View style={styles.searchField}><Text style={{fontSize:18,color:C.light}}>⌕</Text><TextInput value={search} onChangeText={setSearch} placeholder="Поиск по мыслям и тегам" placeholderTextColor={C.light} style={styles.searchInput}/>{search?<Pressable onPress={()=>setSearch('')}><Text style={{color:C.muted}}>✕</Text></Pressable>:null}</View>
    <View style={styles.filters}>
      <Chip onPress={()=>setFilter('all')} selected={filter==='all'}>Все</Chip>
      <Chip onPress={()=>setFilter('needs_review')} selected={filter==='needs_review'}>На проверку</Chip>
      <Chip onPress={()=>setFilter('ready')} selected={filter==='ready'}>Обработанные</Chip>
    </View>
    {shownThoughts.length?<View style={{gap:12}}>{shownThoughts.map(thoughtCard)}</View>:<Empty icon="✳" title="Здесь пока пусто" description="Запиши первую мысль — приложение поможет её разобрать и сохранить."/>}
  </View>;

  const projectsPage=()=><View style={styles.pageContent}>
    <Text style={styles.eyebrow}>ОРГАНИЗАЦИЯ ЗНАНИЙ</Text>
    <SectionHeading title="Проекты" caption="Контекст для Jev: описание помогает правильно классифицировать мысли." action={<Btn small onPress={()=>showNewProject()}>＋ Создать</Btn>}/>
    {projects.length?projects.map(p=><View key={p.id} style={styles.projectCard}>
      <View style={[styles.projectBigIcon,{backgroundColor:p.color+'1A'}]}><Text style={{fontSize:24,color:p.color}}>◈</Text></View>
      <View style={{flex:1,gap:4}}><Text style={styles.projectName}>{p.name}</Text><Text style={styles.thoughtSummary}>{p.description||'Без описания. Добавь контекст для лучшей классификации.'}</Text><Text style={styles.projectStat}>{p.thoughtCount||0} мыслей</Text></View>
      <View style={{gap:8}}><Btn small kind="outline" onPress={()=>goInbox(p.id)}>Открыть</Btn><Btn small kind="ghost" onPress={()=>showNewProject(p)}>Изменить</Btn></View>
    </View>):<Empty icon="◈" title="Создай первый проект" description="Например: Работа, Разработка, Обучение или Личное. Добавь описание, чтобы Jev понимал контекст."/>}
  </View>;

  const settingsPage=()=><View style={styles.pageContent}>
    <Text style={styles.eyebrow}>КОНФИГУРАЦИЯ</Text>
    <SectionHeading title="Настройки AI" caption="Модели можно менять без правок в мобильном приложении."/>
    <View style={styles.settingsCard}>
      <Text style={styles.settingsTitle}>Сервер Thoughts API</Text>
      <Text style={styles.muted}>Укажи адрес компьютера или сервера, на котором запущен backend. Телефон должен иметь к нему доступ.</Text>
      <Label>URL сервера</Label>
      <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="url" value={apiUrlInput} onChangeText={setApiUrlInput} style={styles.field} placeholder="http://192.168.1.25:4000"/>
      <Btn onPress={updateServer}>Сохранить адрес сервера</Btn>
    </View>
    {settings?<>
      <View style={styles.settingsCard}>
        <Text style={styles.settingsTitle}>✦ Генерация названия и резюме</Text><Text style={styles.muted}>OpenAI-compatible Chat Completions. DeepSeek через OpenRouter — по умолчанию.</Text>
        <Label>Провайдер</Label>
        <View style={styles.chipWrap}>{config?.generators.map(p=><Chip key={p.id} selected={settings.generatorProvider===p.id} onPress={()=>setSettings({...settings,generatorProvider:p.id})}>{p.label}{!p.configured?' · нет ключа':''}</Chip>)}</View>
        <Label>ID модели</Label><TextInput autoCapitalize="none" value={settings.generatorModel} onChangeText={v=>setSettings({...settings,generatorModel:v})} style={styles.field} placeholder="deepseek/deepseek-v4.1-flash-1017"/>
      </View>
      <View style={styles.settingsCard}>
        <Text style={styles.settingsTitle}>◇ Классификация — Jev</Text><Text style={styles.muted}>Отдельный Decisions API, умеет выбирать категорию и проект с уверенностью.</Text>
        <Label>Decisions-провайдер</Label>
        <View style={styles.chipWrap}>{config?.decisions.map(p=><Chip key={p.id} selected={settings.decisionProvider===p.id} onPress={()=>setSettings({...settings,decisionProvider:p.id})}>{p.label}{!p.configured?' · нет ключа':''}</Chip>)}</View>
        <Label>ID модели</Label><TextInput autoCapitalize="none" value={settings.decisionModel} onChangeText={v=>setSettings({...settings,decisionModel:v})} style={styles.field} placeholder="typesafe/jev-1.14"/>
        <Label>Порог уверенности: {Math.round(settings.confidenceThreshold*100)}%</Label>
        <View style={styles.chipWrap}>{[.5,.6,.7,.8,.9].map(v=><Chip key={v} selected={settings.confidenceThreshold===v} onPress={()=>setSettings({...settings,confidenceThreshold:v})}>{Math.round(v*100)}%</Chip>)}</View>
      </View>
      <View style={styles.settingsInfo}><Text style={{color:'#556080',lineHeight:20}}>🔐 API-ключи находятся только на сервере в файле apps/api/.env. Никогда не помещай их в EXPO_PUBLIC_*.</Text></View>
      <Btn onPress={saveSettings} loading={busy}>Сохранить настройки</Btn>
    </>:null}
  </View>;

  return <View style={styles.app}>
    <StatusBar barStyle="dark-content" backgroundColor={C.bg}/>
    {wide?sideNav():topMobile()}
    <View style={styles.main}>
      {!wide?<View style={styles.mobileTabs}>
        <Chip selected={page==='inbox'&&selected==='all'} onPress={()=>goInbox()}>Все мысли</Chip>
        <Chip selected={page==='inbox'&&selected==='inbox'} onPress={()=>goInbox('inbox')}>Inbox</Chip>
        <Chip selected={page==='projects'} onPress={()=>setPage('projects')}>Проекты</Chip>
        <Chip selected={page==='settings'} onPress={()=>setPage('settings')}>AI</Chip>
      </View>:null}
      <ScrollView style={{flex:1}} keyboardShouldPersistTaps="handled" contentContainerStyle={{flexGrow:1,alignItems:'center'}}>
        {loading?<View style={{paddingTop:110}}><ActivityIndicator size="large" color={C.purple}/></View>:
          <View style={{width:'100%',maxWidth:850,paddingHorizontal:wide?36:18,paddingBottom:80,paddingTop:wide?52:24}}>
            {error?<View style={[styles.banner,{backgroundColor:'#FFF0F1'}]}><Text style={{flex:1,color:C.red}}>{error}</Text><Btn small kind="outline" onPress={()=>{setLoading(true);void refresh();}}>Обновить</Btn></View>:null}
            {notice?<Pressable onPress={()=>setNotice('')} style={[styles.banner,{backgroundColor:C.greenBg}]}><Text style={{color:C.green,flex:1}}>{notice}</Text><Text style={{color:C.green}}>✕</Text></Pressable>:null}
            {page==='inbox'?inbox():page==='projects'?projectsPage():settingsPage()}
          </View>}
      </ScrollView>
    </View>

    <Modal visible={projectModal} transparent animationType="fade" onRequestClose={()=>setProjectModal(false)}>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={styles.modalOverlay}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalScroll}>
        <View style={styles.modalCard}>
          <View style={styles.modalHead}><Text style={styles.h2}>{projectEdit?'Изменить проект':'Новый проект'}</Text><Pressable onPress={()=>setProjectModal(false)}><Text style={styles.close}>✕</Text></Pressable></View>
          <Label>Название</Label><TextInput value={projectName} onChangeText={setProjectName} maxLength={80} placeholder="Название проекта" placeholderTextColor={C.light} style={styles.field}/>
          <Label>Описание / контекст для Jev</Label><TextInput value={projectDesc} onChangeText={setProjectDesc} maxLength={400} multiline placeholder="Например: Разработка онлайн-сервиса, backend, формы, интеграции…" placeholderTextColor={C.light} style={[styles.field,{height:100,textAlignVertical:'top'}]}/>
          <Label>Цвет</Label><View style={styles.chipWrap}>{colors.map(color=><Pressable key={color} onPress={()=>setProjectColor(color)} style={[styles.colorChoice,{backgroundColor:color},projectColor===color&&{borderColor:C.ink,borderWidth:3}]}/>)}</View>
          <View style={{flexDirection:'row',justifyContent:'space-between',gap:12,marginTop:12}}>{projectEdit?<Btn kind="danger" onPress={()=>deleteProject(projectEdit)}>Удалить</Btn>:<View/>}<Btn onPress={saveProject} disabled={!projectName.trim()||busy} loading={busy}>Сохранить проект</Btn></View>
        </View>
      </ScrollView></KeyboardAvoidingView>
    </Modal>

    <Modal visible={!!editing} transparent animationType="fade" onRequestClose={()=>setEditing(null)}>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={styles.modalOverlay}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalScroll}>
        <View style={styles.modalCard}>
          <View style={styles.modalHead}><Text style={styles.h2}>Детали мысли</Text><Pressable onPress={()=>setEditing(null)}><Text style={styles.close}>✕</Text></Pressable></View>
          <Label>Название</Label><TextInput value={editTitle} onChangeText={setEditTitle} style={styles.field} maxLength={140}/>
          <Label>Исходная мысль</Label><TextInput value={editRaw} onChangeText={setEditRaw} style={[styles.field,{minHeight:120,textAlignVertical:'top'}]} multiline maxLength={10000}/>
          <Label>Краткое описание</Label><TextInput value={editSummary} onChangeText={setEditSummary} style={[styles.field,{minHeight:78,textAlignVertical:'top'}]} multiline maxLength={800}/>
          <Label>Проект</Label><View style={styles.chipWrap}><Chip selected={editProject===null} onPress={()=>setEditProject(null)}>Inbox</Chip>{projects.map(p=><Chip key={p.id} selected={editProject===p.id} onPress={()=>setEditProject(p.id)}>{p.name}</Chip>)}</View>
          <Label>Категория</Label><View style={styles.chipWrap}>{(Object.keys(categoryLabels) as Category[]).map(k=><Chip key={k} selected={editCategory===k} onPress={()=>setEditCategory(k)}>{categoryLabels[k]}</Chip>)}</View>
          {editing?.errorMessage?<Text style={[styles.muted,{color:C.amber,marginTop:8}]}>{editing.errorMessage}</Text>:null}
          {editing?.confidence!==null?<Text style={[styles.muted,{marginTop:8}]}>Уверенность классификации: {Math.round((editing?.confidence||0)*100)}%</Text>:null}
          <View style={{flexDirection:'row',justifyContent:'space-between',gap:8,marginTop:20,flexWrap:'wrap'}}>
            <Btn kind="danger" small onPress={()=>editing&&deleteThought(editing)}>Удалить</Btn>
            <View style={{flexDirection:'row',gap:8}}>
              <Btn kind="outline" small loading={busy} onPress={()=>{if(editing){const id=editing.id;setEditing(null);process(id);}}}>↻ AI</Btn>
              <Btn small loading={busy} disabled={!editRaw.trim()||!editTitle.trim()} onPress={saveThought}>Сохранить</Btn>
            </View>
          </View>
        </View>
      </ScrollView></KeyboardAvoidingView>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  app:{flex:1,backgroundColor:C.bg,flexDirection:'row'},
  sidebar:{width:260,backgroundColor:C.white,borderRightWidth:1,borderRightColor:C.line,paddingHorizontal:18,paddingTop:32,paddingBottom:20},
  brand:{flexDirection:'row',gap:11,alignItems:'center',paddingHorizontal:12,marginBottom:50},
  logo:{width:43,height:43,borderRadius:14,backgroundColor:C.purple,alignItems:'center',justifyContent:'center'},
  logoIcon:{color:C.white,fontSize:25,fontWeight:'900'},brandText:{fontSize:25,fontWeight:'900',letterSpacing:-1.1,color:C.ink},
  brandCaption:{color:C.light,letterSpacing:1.6,fontSize:8.5,fontWeight:'700',marginTop:-1},
  sideSection:{gap:4},sideOverline:{fontSize:10,fontWeight:'800',letterSpacing:1.2,color:C.light,marginBottom:13,marginLeft:12},
  sideHeadingRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},plus:{marginTop:-9,padding:8},
  navItem:{height:42,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:11,borderRadius:10},
  navSelected:{backgroundColor:C.pale},navIcon:{fontSize:19,color:C.purple,width:20,textAlign:'center'},
  navLabel:{color:'#626A81',flex:1,fontSize:13,fontWeight:'600'},navLabelSelected:{color:C.purple},
  navCounter:{fontSize:11,color:C.light},projectDot:{width:9,height:9,borderRadius:5},simpleLink:{padding:13,marginTop:4},
  sideFooter:{borderTopWidth:1,borderTopColor:C.line,paddingTop:15,paddingHorizontal:12,marginTop:15,gap:5},
  sideFooterText:{fontSize:11,color:C.muted},sideFooterSmall:{fontSize:10,color:C.light},main:{flex:1,minWidth:0},
  mobileHeader:{position:'absolute',top:0,left:0,right:0,zIndex:2,height:76,backgroundColor:C.white,paddingTop:Platform.OS==='android'?28:Platform.OS==='ios'?35:12,paddingHorizontal:20,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderBottomWidth:1,borderBottomColor:C.line},
  topSettings:{padding:6},mobileTabs:{marginTop:76,flexDirection:'row',gap:5,paddingHorizontal:12,paddingVertical:9,backgroundColor:C.white,borderBottomWidth:1,borderBottomColor:C.line,flexWrap:'wrap'},
  pageContent:{gap:17},greeting:{gap:10,marginBottom:5},eyebrow:{fontSize:10,letterSpacing:2,color:C.purple,fontWeight:'800'},
  title:{fontSize:31,lineHeight:39,color:C.ink,fontWeight:'800',letterSpacing:-1.3},subtitle:{fontSize:14,color:C.muted,lineHeight:23},
  composer:{backgroundColor:C.white,borderColor:'#DBDDFC',borderWidth:1,borderRadius:18,padding:18,shadowColor:'#9993F1',shadowOpacity:.08,shadowRadius:14,shadowOffset:{width:0,height:5},elevation:2},
  composerTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:5},smallMuted:{color:C.light,fontSize:11},
  composerInput:{minHeight:112,maxHeight:225,paddingTop:18,paddingBottom:14,fontSize:15,color:C.ink,lineHeight:23,outlineStyle:'none'} as any,
  composerDivider:{height:1,backgroundColor:C.line,marginBottom:12},composerBottom:{flexDirection:'row',gap:12,alignItems:'center'},
  voiceRow:{flexDirection:'row',alignItems:'center',gap:12,marginBottom:8},voiceButton:{paddingVertical:9,paddingHorizontal:13,borderRadius:9,backgroundColor:C.pale},voiceButtonActive:{backgroundColor:'#FFF0F1'},voiceState:{fontSize:12,color:C.muted},voiceError:{fontSize:12,color:C.red,marginBottom:6},voicePrivacy:{fontSize:11,color:C.muted,lineHeight:17,marginBottom:8},
  metrics:{flexDirection:'row',gap:10,marginVertical:2},metricCard:{flex:1,backgroundColor:C.white,borderWidth:1,borderColor:C.line,borderRadius:13,paddingHorizontal:18,paddingVertical:16},
  metricCount:{color:C.ink,fontWeight:'800',fontSize:26},metricLabel:{color:C.muted,fontSize:11,marginTop:6},
  sectionHeading:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:12,gap:10},
  h2:{fontSize:21,fontWeight:'800',color:C.ink,letterSpacing:-.6},muted:{color:C.muted,fontSize:12,lineHeight:19,marginTop:4},
  searchField:{height:47,borderWidth:1,borderColor:C.line,backgroundColor:C.white,borderRadius:12,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:12},
  searchInput:{flex:1,fontSize:13,color:C.ink,outlineStyle:'none'} as any,
  filters:{flexDirection:'row',gap:7,flexWrap:'wrap'},chip:{borderWidth:1,borderColor:C.line,backgroundColor:C.white,borderRadius:9,paddingHorizontal:11,paddingVertical:8,justifyContent:'center',alignItems:'center'},
  chipText:{color:'#6F758C',fontSize:11,fontWeight:'600'},
  thoughtCard:{backgroundColor:C.white,borderWidth:1,borderColor:C.line,borderRadius:15,padding:17,gap:12},
  cardTop:{flexDirection:'row',gap:12,alignItems:'center'},catIcon:{width:39,height:39,borderRadius:12,alignItems:'center',justifyContent:'center'},
  thoughtTitle:{fontSize:15,fontWeight:'700',color:C.ink,lineHeight:21},thoughtMeta:{fontSize:11,color:C.light,marginTop:4},
  statusBadge:{paddingHorizontal:9,paddingVertical:6,borderRadius:7},statusBadgeText:{fontSize:10,fontWeight:'700'},
  thoughtSummary:{fontSize:13,color:'#71788F',lineHeight:21},thoughtBottom:{borderTopWidth:1,borderTopColor:C.line,paddingTop:12,flexDirection:'row',alignItems:'center',gap:8},
  projectTag:{flexDirection:'row',alignItems:'center',backgroundColor:'#F4F5F9',borderRadius:7,paddingHorizontal:9,paddingVertical:6,gap:6,maxWidth:160},
  projectTagText:{fontSize:11,color:'#747B93',fontWeight:'600'},hashTag:{fontSize:10,color:C.purple},
  empty:{alignItems:'center',paddingVertical:54,paddingHorizontal:18,gap:5,borderWidth:1,borderStyle:'dashed',borderColor:'#D4D8ED',borderRadius:15,backgroundColor:'#FBFBFE'},
  emptyTitle:{fontSize:16,fontWeight:'800',color:C.ink},emptyDesc:{textAlign:'center',fontSize:12,color:C.muted,lineHeight:19,maxWidth:310},
  btn:{borderRadius:10,paddingHorizontal:17,paddingVertical:12,alignItems:'center',justifyContent:'center',minHeight:41},btnSmall:{paddingHorizontal:13,paddingVertical:9,minHeight:35},
  btnPrimary:{backgroundColor:C.purple},btnOutline:{backgroundColor:C.white,borderWidth:1,borderColor:C.line},btnGhost:{backgroundColor:'transparent'},btnDanger:{backgroundColor:'#FFF0F1'},
  btnText:{fontSize:13,fontWeight:'700'},
  projectCard:{borderRadius:14,backgroundColor:C.white,padding:17,borderWidth:1,borderColor:C.line,flexDirection:'row',gap:14,alignItems:'center'},
  projectBigIcon:{width:50,height:50,borderRadius:15,alignItems:'center',justifyContent:'center'},projectName:{fontSize:16,fontWeight:'800',color:C.ink},projectStat:{fontSize:11,color:C.purple,marginTop:5,fontWeight:'700'},
  settingsCard:{padding:18,backgroundColor:C.white,borderColor:C.line,borderWidth:1,borderRadius:15,gap:12},
  settingsTitle:{fontSize:16,fontWeight:'800',color:C.ink},fieldLabel:{fontSize:12,fontWeight:'700',color:C.ink,marginTop:12,marginBottom:1},
  field:{borderWidth:1,borderColor:C.line,borderRadius:10,backgroundColor:C.white,minHeight:44,paddingHorizontal:12,paddingVertical:11,color:C.ink,fontSize:13},
  chipWrap:{flexDirection:'row',flexWrap:'wrap',gap:7},settingsInfo:{borderRadius:12,backgroundColor:'#EEF2FC',padding:16},
  banner:{borderRadius:10,paddingHorizontal:14,paddingVertical:12,flexDirection:'row',gap:10,alignItems:'center',marginBottom:16},
  modalOverlay:{flex:1,backgroundColor:'rgba(24,29,50,.43)',justifyContent:'center',alignItems:'center',paddingHorizontal:14},modalScroll:{flexGrow:1,width:'100%',justifyContent:'center',alignItems:'center',paddingVertical:24},
  modalCard:{backgroundColor:C.white,borderRadius:18,width:'100%',maxWidth:570,padding:23,gap:8},modalHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:10},close:{fontSize:19,color:C.muted,padding:5},
  colorChoice:{width:28,height:28,borderRadius:14,borderWidth:2,borderColor:'transparent'}
});
