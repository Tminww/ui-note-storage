import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './global.css';
import { Button as GSButton, ButtonText as GSButtonText, ButtonSpinner as GSButtonSpinner } from './components/ui/button';
import { Card as GSCard, Heading as GSHeading, VStack as GSVStack, Text as GSText } from './components/ui/surfaces';
import {
  ActivityIndicator, Alert, Animated, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions
} from 'react-native';
import { api, getApiUrl, loadApiUrl, saveApiUrl, type AIConfig, type Category, type Project, type Settings, type Thought } from './src/api';
import { useVoiceInput } from './src/useVoiceInput';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import * as Haptics from 'expo-haptics';
import { useAutomaticUpdates } from './src/useAutomaticUpdates';
import { getStorageMode, initializeDeviceConfig, setStorageMode, getNotionRoot, setNotionRoot, hasSecret, saveSecret, type StorageMode } from './src/deviceConfig';
import { connectNotionMcp, notionMcpDisconnect, notionMcpIsConnected } from './src/notionMcp';

type Page = 'inbox' | 'projects' | 'settings';
type Selected = 'all' | 'inbox' | string;
const C = {
  bg:'#F6F7FB', ink:'#1E2442',muted:'#626981',light:'#737A8D',
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
  const [storageModeState,setStorageModeState] = useState<StorageMode>('server');
  const [rootInput,setRootInput] = useState('');
  const [notionToken,setNotionToken] = useState('');
  const [routerToken,setRouterToken] = useState('');
  const [notionHasToken,setNotionHasToken] = useState(false);
  const [routerHasToken,setRouterHasToken] = useState(false);
  const [mcpConnected,setMcpConnected] = useState(false);
  const updates = useAutomaticUpdates();
  const [draft,setDraft] = useState('');
  const draftInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const voice = useVoiceInput(setDraft);
  const [recordingSeconds,setRecordingSeconds] = useState(0);
  const [showProjectPicker,setShowProjectPicker] = useState(false);
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(()=>{
    if (!voice.active) {setRecordingSeconds(0); pulse.setValue(1);return;}
    const started=Date.now();
    const timer=setInterval(()=>setRecordingSeconds(Math.floor((Date.now()-started)/1000)),1000);
    const animation=Animated.loop(Animated.sequence([
      Animated.timing(pulse,{toValue:1.09,duration:550,useNativeDriver:true}),
      Animated.timing(pulse,{toValue:1,duration:550,useNativeDriver:true})
    ]));
    animation.start();
    return ()=>{clearInterval(timer);animation.stop();pulse.setValue(1);};
  },[voice.active,pulse]);
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
    void Promise.all([initializeDeviceConfig(),loadApiUrl()]).then(async ([,url])=>{
      setStorageModeState(getStorageMode());setRootInput(getNotionRoot());setApiUrlInput(url);
      setNotionHasToken(await hasSecret('notion'));setRouterHasToken(await hasSecret('openrouter'));
      setMcpConnected(await notionMcpIsConnected());
      if(getStorageMode()==='notion'&&!(await hasSecret('notion'))){setPage('settings');setLoading(false);return;}
      return refresh();
    }).catch(e=>{setError((e as Error).message);setLoading(false);});
  },[refresh]);
  const switchMode=(mode:StorageMode)=>void (async()=>{
    try{await setStorageMode(mode);setStorageModeState(mode);setPage('settings');setSelected('all');setProjects([]);setThoughts([]);setSettings(null);setConfig(null);setLoading(true);await refresh();}
    catch(e){setError((e as Error).message);setLoading(false);}
  })();
  const saveNotionConfig=()=>void (async()=>{
    try{
      await setNotionRoot(rootInput);
      if(notionToken.trim())await saveSecret('notion',notionToken);
      if(routerToken.trim())await saveSecret('openrouter',routerToken);
      setNotionToken('');setRouterToken('');
      setNotionHasToken(await hasSecret('notion'));setRouterHasToken(await hasSecret('openrouter'));
      setNotice('Настройки сохранены только на устройстве');
      setLoading(true);await refresh();
    }catch(e){setError((e as Error).message);setLoading(false);}
  })();
  const connectMcp=()=>void (async()=>{
    setBusy(true);setError('');
    try{await connectNotionMcp();setMcpConnected(true);setNotice('Notion MCP подключён по OAuth');}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  })();

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
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(()=>{});
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
    <View style={styles.sideFooter}><Text style={styles.sideFooterText}>{storageModeState==='notion'?'Notion • OpenRouter • Expo':'SQLite • OpenRouter • Expo'}</Text><Text style={styles.sideFooterSmall}>MVP v0.1</Text></View>
  </View>;

  const topMobile=()=><View style={styles.mobileHeader}>
    <View style={{flexDirection:'row',alignItems:'center',gap:10}}><View style={[styles.logo,{width:35,height:35}]}><Text style={styles.logoIcon}>✳</Text></View><Text style={styles.brandText}>thoughts<Text style={{color:C.purple}}>.</Text></Text></View>
    <Pressable onPress={()=>setPage('settings')} style={styles.topSettings} accessibilityRole="button" accessibilityLabel="Настройки"><Ionicons name="settings-outline" size={23} color={C.ink}/></Pressable>
  </View>;

  const composer=()=><GSCard className="border-primary/20 p-4">
    <View style={styles.inputAndMic}>
      <TextInput ref={draftInputRef} accessibilityLabel="Новая мысль" style={styles.composerInput}
        multiline editable={!voice.active} placeholder="Что у тебя в голове?"
        placeholderTextColor={C.muted} value={draft} onChangeText={setDraft} textAlignVertical="top" maxLength={10000}/>
      <Animated.View style={{transform:[{scale:voice.active?pulse:1}]}}>
        <Pressable accessibilityRole="button" accessibilityLabel={voice.active?'Остановить запись':'Начать диктовку'}
          hitSlop={8} disabled={busy} onPress={()=>voice.active?voice.stop():void voice.start(draft)}
          style={[styles.micFab,voice.active&&styles.micFabActive]}>
          <Ionicons name={voice.active?'stop':'mic'} size={26} color="#FFFFFF"/>
        </Pressable>
      </Animated.View>
    </View>
    {voice.active?<View style={styles.recordingRow}>
      <View style={styles.recordingDot}/>
      <Text style={{flex:1,color:C.ink,fontWeight:'600'}}>{voice.state==='listening'?'Слушаю…':voice.state==='starting'?'Включаю микрофон…':'Завершаю…'}</Text>
      <Text style={{color:C.red,fontWeight:'700'}}>{String(Math.floor(recordingSeconds/60)).padStart(2,'0')}:{String(recordingSeconds%60).padStart(2,'0')}</Text>
      <Pressable accessibilityRole="button" onPress={voice.stop} style={styles.stopAction}><Text style={{fontWeight:'700',color:C.red}}>Стоп</Text></Pressable>
    </View>:null}
    {voice.error?<Text style={styles.voiceError}>{voice.error}</Text>:null}
    <View style={styles.composerBottom}>
      <Pressable accessibilityRole="button" accessibilityLabel="Выбрать проект" onPress={()=>setShowProjectPicker(true)} style={styles.projectSelect}>
        <Ionicons name="folder-outline" size={17} color={C.muted}/>
        <Text numberOfLines={1} style={{color:C.ink,fontWeight:'600',fontSize:13,flexShrink:1}}>Проект: {draftProject?projects.find(p=>p.id===draftProject)?.name||'Авто':'Авто'}</Text>
        <Ionicons name="chevron-down" size={15} color={C.muted}/>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Сохранить мысль" disabled={!draft.trim()||busy||voice.active} onPress={createThought}
        style={[styles.saveAction,(!draft.trim()||busy||voice.active)&&styles.saveDisabled]}>
        {busy?<ActivityIndicator size="small" color="#FFFFFF"/>:<Ionicons name="checkmark" size={20} color="#FFFFFF"/>}
        <Text style={{color:'#FFFFFF',fontSize:14,fontWeight:'700'}}>Сохранить</Text>
      </Pressable>
    </View>
    <Pressable onPress={()=>setPage('settings')} style={styles.voiceInfo} accessibilityRole="button" accessibilityLabel="Настройки голосового ввода">
      <Ionicons name="information-circle-outline" size={16} color={C.muted}/>
      <Text style={{fontSize:12,color:C.muted}}>Настройки голоса</Text>
    </Pressable>
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
    {composer()}
    <SectionHeading title={selectedLabel} caption={`${shownThoughts.length} записей`}/>
    <View style={styles.searchField}><Text style={{fontSize:18,color:C.light}}>⌕</Text><TextInput value={search} onChangeText={setSearch} placeholder="Поиск по мыслям и тегам" placeholderTextColor={C.light} style={styles.searchInput}/>{search?<Pressable onPress={()=>setSearch('')}><Text style={{color:C.muted}}>✕</Text></Pressable>:null}</View>
    <View style={styles.filters}>
      <Chip onPress={()=>setFilter('all')} selected={filter==='all'}>Все</Chip>
      <Chip onPress={()=>setFilter('needs_review')} selected={filter==='needs_review'}>На проверку</Chip>
      <Chip onPress={()=>setFilter('ready')} selected={filter==='ready'}>Обработанные</Chip>
    </View>
    {shownThoughts.length?<View style={{gap:12}}>{shownThoughts.map(thoughtCard)}</View>:thoughts.length===0?<View style={styles.emptyWelcome}>
      <Ionicons name="bulb-outline" size={32} color={C.purple}/>
      <Text style={{fontSize:18,color:C.ink,fontWeight:'800'}}>Пока нет мыслей</Text>
      <Text style={{fontSize:13,color:C.muted,textAlign:'center'}}>Продиктуй первую или попробуй пример:</Text>
      {['Идея для проекта','Что сделать завтра','Итоги встречи'].map(v=><Pressable key={v} style={styles.exampleRow} onPress={()=>{setDraft(v);draftInputRef.current?.focus();}}><Text style={{color:C.purple,fontWeight:'600'}}>{v}</Text></Pressable>)}
    </View>:<Empty icon="✳" title="Ничего не найдено" description="Измени поиск или фильтры."/>}
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
    <SectionHeading title="Настройки" caption="Голос, подключения и AI."/>
    <View style={styles.settingsCard}>
      <Text style={styles.settingsTitle}>Голос</Text>
      <Text style={styles.muted}>Язык распознавания: русский</Text>
      {Platform.OS!=='web'?<View style={styles.voiceSwitchRow}>
        <View style={{flex:1}}><Text style={{fontSize:14,color:C.ink,fontWeight:'700'}}>Только на устройстве</Text><Text style={styles.muted}>Нужен офлайн-пакет русского языка</Text></View>
        <Switch accessibilityLabel="Распознавать только на устройстве" value={voice.onDeviceOnly} onValueChange={voice.setOnDeviceOnly} disabled={voice.active}
          trackColor={{false:'#B4BBC9',true:'#B4AAF5'}} thumbColor={voice.onDeviceOnly?C.purple:'#FFFFFF'}/>
      </View>:null}
      <Text style={styles.muted}>Приложение не сохраняет и не отправляет аудио в Thoughts API. Системный распознаватель может использовать сервис производителя.</Text>
    </View>
    <View style={styles.settingsCard}>
      <Text style={styles.settingsTitle}>Где хранить мысли?</Text>
      <Text style={styles.muted}>Можно переключаться между собственным backend и Notion. Данные автоматически не мигрируют.</Text>
      <View style={styles.chipWrap}>
        <Chip selected={storageModeState==='server'} onPress={()=>switchMode('server')}>SQLite / сервер</Chip>
        <Chip selected={storageModeState==='notion'} onPress={()=>switchMode('notion')}>Notion / без backend</Chip>
      </View>
    </View>
    {storageModeState==='server'?<View style={styles.settingsCard}>
      <Text style={styles.settingsTitle}>Сервер Thoughts API</Text>
      <Text style={styles.muted}>Укажи адрес компьютера или сервера, на котором запущен backend. Телефон должен иметь к нему доступ.</Text>
      <Label>URL сервера</Label>
      <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="url" value={apiUrlInput} onChangeText={setApiUrlInput} style={styles.field} placeholder="http://192.168.1.25:4000"/>
      <Btn onPress={updateServer}>Сохранить адрес сервера</Btn>
    </View>:<>
      <View style={styles.settingsCard}>
        <Text style={styles.settingsTitle}>Notion — хранилище без нашего backend</Text>
        <Text style={styles.muted}>Создай внутреннюю интеграцию Notion, дай ей доступ к выбранной странице, скопируй токен из Bitwarden и укажи ID этой страницы.</Text>
        <Label>Страница Notion (ID или URL)</Label>
        <TextInput autoCapitalize="none" autoCorrect={false} value={rootInput} onChangeText={setRootInput} style={styles.field} placeholder="https://www.notion.so/..."/>
        <Label>Notion integration token {notionHasToken?'✓ сохранён':''}</Label>
        <TextInput secureTextEntry autoCapitalize="none" value={notionToken} onChangeText={setNotionToken} style={styles.field} placeholder={notionHasToken?'Оставь пустым, чтобы не менять':'Вставь из Bitwarden'}/>
        <Label>OpenRouter API key {routerHasToken?'✓ сохранён':''}</Label>
        <TextInput secureTextEntry autoCapitalize="none" value={routerToken} onChangeText={setRouterToken} style={styles.field} placeholder={routerHasToken?'Оставь пустым, чтобы не менять':'Вставь из Bitwarden'}/>
        <Text style={styles.muted}>Секреты сохраняются в Android Keystore / iOS Keychain. Веб-режим с личными ключами отключён.</Text>
        <Btn onPress={saveNotionConfig}>Сохранить на телефоне</Btn>
      </View>
      <View style={styles.settingsCard}>
        <Text style={styles.settingsTitle}>Notion MCP — контекст для AI</Text>
        <Text style={styles.muted}>Отдельная OAuth-авторизация в Notion MCP. Модель получает только доступ к чтению через ограниченные MCP-инструменты. Создание заметок выполняется самим приложением через Notion API.</Text>
        <Text style={styles.muted}>Статус: {mcpConnected?'✓ Подключено':'Не подключено'}</Text>
        {mcpConnected?<Btn kind="outline" onPress={()=>void notionMcpDisconnect().then(()=>setMcpConnected(false))}>Отключить MCP</Btn>:<Btn loading={busy} onPress={connectMcp}>Авторизоваться в Notion MCP</Btn>}
      </View>
    </>}
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
      <View style={styles.settingsInfo}><Text style={{color:'#556080',lineHeight:20}}>🔐 {storageModeState==='server'?'API-ключи находятся на сервере в apps/api/.env.':'API-ключи сохранены в системном защищённом хранилище телефона. Ни один ключ не встраивается в APK или EAS Update.'}</Text></View>
      <Btn onPress={saveSettings} loading={busy}>Сохранить настройки</Btn>
    </>:null}
    <View style={styles.settingsCard}>
      <Text style={styles.settingsTitle}>Обновления</Text>
      <Text style={styles.muted}>{updates.enabled?'Интерфейс обновляется автоматически. Новые версии скачиваются при запуске и возвращении в приложение.':'В этом APK автообновления не подключены. После настройки Expo потребуется один новый APK.'}</Text>
      <Btn kind="outline" onPress={()=>void updates.check(true)} disabled={updates.checking}>Проверить сейчас</Btn>
      {updates.status?<Text style={styles.muted}>{updates.status}</Text>:null}
      {updates.ready?<Btn onPress={()=>void updates.apply()}>Применить обновление</Btn>:null}
    </View>
  </View>;

  return <View style={styles.app}>
    <StatusBar barStyle="dark-content"/>
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
            {updates.ready?<View style={[styles.banner,{backgroundColor:C.pale}]}><Text style={{flex:1,color:C.ink}}>Обновление интерфейса готово</Text><Btn small onPress={()=>void updates.apply()}>Применить</Btn></View>:null}
             {error&&page==='settings'?<View style={[styles.banner,{backgroundColor:'#FFF5E2'}]}><Text style={{flex:1,color:C.ink}}>{error}</Text><Btn small kind="outline" onPress={()=>{setLoading(true);void refresh();}}>Повторить</Btn></View>:null}
            {notice?<Pressable onPress={()=>setNotice('')} style={[styles.banner,{backgroundColor:C.greenBg}]}><Text style={{color:C.green,flex:1}}>{notice}</Text><Text style={{color:C.green}}>✕</Text></Pressable>:null}
            {page==='inbox'?inbox():page==='projects'?projectsPage():settingsPage()}
          </View>}
      </ScrollView>
      {error&&page!=='settings'?<View style={styles.errorToast}>
        <Ionicons name="alert-circle-outline" size={20} color={C.amber}/>
        <Text style={{flex:1,color:C.ink,fontSize:12}} numberOfLines={2}>{storageModeState==='notion'?'Подключи Notion, чтобы сохранять мысли.':error}</Text>
        <Pressable accessibilityRole="button" onPress={()=>{if(storageModeState==='notion')setPage('settings');else{setLoading(true);void refresh();}}} style={{paddingHorizontal:7,paddingVertical:10}}>
          <Text style={{color:C.purple,fontWeight:'700',fontSize:13}}>{storageModeState==='notion'?'Настроить':'Повторить'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Закрыть предупреждение" onPress={()=>setError('')} style={{padding:5}}><Ionicons name="close" size={18} color={C.muted}/></Pressable>
      </View>:null}
    </View>

    <Modal visible={showProjectPicker} transparent animationType="slide" onRequestClose={()=>setShowProjectPicker(false)}>
      <View style={styles.projectOverlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={()=>setShowProjectPicker(false)}/>
        <View style={styles.projectSheet}>
          <Text style={styles.settingsTitle}>Проект для мысли</Text>
          {[{id:null,name:'Авто — AI выберет сам'},...projects.map(p=>({id:p.id,name:p.name}))].map(p=>
            <Pressable key={p.id||'auto'} style={styles.projectOption} onPress={()=>{setDraftProject(p.id);setShowProjectPicker(false);}}>
              <Ionicons name={draftProject===p.id?'radio-button-on':'radio-button-off'} size={20} color={draftProject===p.id?C.purple:C.muted}/><Text style={{color:C.ink,fontSize:15}}>{p.name}</Text>
            </Pressable>)}
        </View>
      </View>
    </Modal>
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
  pageContent:{gap:14},greeting:{gap:10,marginBottom:5},eyebrow:{fontSize:10,letterSpacing:2,color:C.purple,fontWeight:'800'},
  title:{fontSize:31,lineHeight:39,color:C.ink,fontWeight:'800',letterSpacing:-1.3},subtitle:{fontSize:14,color:C.muted,lineHeight:23},
  composer:{backgroundColor:C.white,borderColor:'#DBDDFC',borderWidth:1,borderRadius:18,padding:18,shadowColor:'#9993F1',shadowOpacity:.08,shadowRadius:14,shadowOffset:{width:0,height:5},elevation:2},
  composerTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:5},smallMuted:{color:C.light,fontSize:11},
  composerInput:{flex:1,minHeight:105,maxHeight:220,paddingTop:8,paddingBottom:12,fontSize:16,color:C.ink,lineHeight:24,outlineStyle:'none'} as any,
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
  inputAndMic:{flexDirection:'row',gap:10,alignItems:'flex-end'},
  micFab:{width:58,height:58,borderRadius:29,backgroundColor:C.purple,alignItems:'center',justifyContent:'center',marginBottom:6},
  micFabActive:{backgroundColor:C.red},
  recordingRow:{flexDirection:'row',alignItems:'center',gap:8,minHeight:48},
  recordingDot:{width:9,height:9,borderRadius:5,backgroundColor:C.red},
  stopAction:{minHeight:44,justifyContent:'center',paddingHorizontal:8},
  projectSelect:{flex:1,minWidth:0,minHeight:48,flexDirection:'row',alignItems:'center',gap:6},
  saveAction:{backgroundColor:C.purple,minHeight:48,borderRadius:12,paddingHorizontal:13,flexDirection:'row',alignItems:'center',gap:6},
  saveDisabled:{backgroundColor:'#A3A9B6'},
  voiceInfo:{minHeight:32,flexDirection:'row',alignItems:'center',gap:6,alignSelf:'flex-start'},
  voiceSwitchRow:{flexDirection:'row',alignItems:'center',gap:12,minHeight:52},
  emptyWelcome:{backgroundColor:C.white,borderWidth:1,borderColor:C.line,borderRadius:16,padding:20,alignItems:'center',gap:10},
  exampleRow:{alignSelf:'stretch',minHeight:46,borderWidth:1,borderColor:C.line,borderRadius:12,paddingHorizontal:14,justifyContent:'center'},
  projectOverlay:{flex:1,backgroundColor:'rgba(24,29,50,.43)',justifyContent:'flex-end'},
  projectSheet:{backgroundColor:C.white,borderTopLeftRadius:22,borderTopRightRadius:22,paddingHorizontal:22,paddingTop:22,paddingBottom:46,gap:8},
  projectOption:{minHeight:52,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,borderBottomColor:C.line},
  errorToast:{position:'absolute',bottom:20,left:12,right:12,zIndex:6,backgroundColor:'#FFF6E5',borderWidth:1,borderColor:'#EAD5A9',borderRadius:12,flexDirection:'row',alignItems:'center',gap:7,padding:10,elevation:5},
  colorChoice:{width:28,height:28,borderRadius:14,borderWidth:2,borderColor:'transparent'}
});
