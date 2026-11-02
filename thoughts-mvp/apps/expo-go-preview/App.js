/**
 * Thoughts — UI-only Expo Go / Snack demo.
 * Requires React and React Native ONLY. No API, native voice recognizer,
 * permissions, network requests, keys or saved user data.
 * This file is intentionally independent of apps/mobile to support Expo Go.
 */
import React, { useMemo, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StatusBar, StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';

const C = {
  bg: '#F6F7FB', white: '#FFFFFF', ink: '#1E2442', muted: '#858AA0',
  light: '#AFB4C3', purple: '#6259E8', pale: '#F0EFFF', line: '#E7E9F2',
  green: '#1F936A', greenBg: '#E8F8F1', amber: '#A36F18',
  amberBg: '#FFF5E2', red: '#C75058',
};
const initialProjects = [
  { id: 'p1', name: 'Разработка', desc: 'Продукты, технологии, приложения', color: '#6259E8' },
  { id: 'p2', name: 'Личное', desc: 'Повседневные мысли и планы', color: '#2F9C85' },
  { id: 'p3', name: 'Обучение', desc: 'Книги, курсы и новые знания', color: '#E49B42' },
];
const initialThoughts = [
  { id: 't1', title: 'Сделать приложение для записи идей', text: 'Хочу быстро сохранять идеи голосом, чтобы AI сам распределял их по проектам.', summary: 'Приложение с AI-классификацией и быстрым вводом мыслей.', category: 'idea', projectId: 'p1', status: 'ready', date: 'Сегодня', tags: ['приложение', 'AI'] },
  { id: 't2', title: 'Разобраться с Expo и EAS Update', text: 'Изучить, как обновлять мобильное приложение без новой установки APK.', summary: 'Настроить доставку обновлений интерфейса через Expo.', category: 'task', projectId: 'p3', status: 'ready', date: 'Сегодня', tags: ['expo', 'react-native'] },
  { id: 't3', title: 'Идея: Notion как хранилище', text: 'Вместо собственного сервера можно попробовать Notion API и MCP для контекста.', summary: 'Исследовать хранение мыслей в Notion и подключение MCP.', category: 'research', projectId: 'p1', status: 'needs_review', date: 'Вчера', tags: ['notion', 'MCP'] },
  { id: 't4', title: 'Прочитать статью о продуктивности', text: 'Найти хорошую статью о том, как не терять внезапные идеи.', summary: 'Сохранить материал для чтения на выходных.', category: 'note', projectId: null, status: 'ready', date: 'Вчера', tags: ['чтение'] },
];
const categoryName = { idea: 'Идея', task: 'Задача', research: 'Исследование', note: 'Заметка', bug: 'Баг' };
const categoryIcon = { idea: '✦', task: '✓', research: '◈', note: '≡', bug: '!' };
const projectColors = ['#6259E8','#2F9C85','#E49B42','#D66A9B','#4D96CE'];
const uid = () => `${Date.now()}-${Math.floor(Math.random()*99999)}`;

function Pill({label,active,onPress,tone='normal'}) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.pill, active && styles.pillActive, tone==='green' && {backgroundColor:C.greenBg,borderColor:C.greenBg}]}>
    <Text style={[styles.pillText,active&&{color:C.purple},tone==='green'&&{color:C.green}]}>{label}</Text>
  </Pressable>;
}
function Button({label,onPress,secondary=false,disabled=false}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button,secondary?styles.buttonSecondary:styles.buttonMain,disabled&&{opacity:.45}]}>
    <Text style={[styles.buttonText, secondary&&{color:C.purple}]}>{label}</Text>
  </Pressable>;
}
function Field({label,value,onChangeText,placeholder,multiline=false}) {
  return <View style={{gap:7,marginTop:10}}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={C.light} multiline={multiline} style={[styles.field,multiline&&{height:96,textAlignVertical:'top'}]}/>
  </View>;
}
function Header({onSettings}) {
  return <View style={styles.header}>
    <View style={styles.brandRow}><View style={styles.brandIcon}><Text style={styles.brandStar}>✳</Text></View><View><Text style={styles.brand}>thoughts<Text style={{color:C.purple}}>.</Text></Text><Text style={styles.brandCaption}>YOUR SECOND BRAIN</Text></View></View>
    <Pressable accessibilityRole="button" accessibilityLabel="Настройки" onPress={onSettings} style={styles.settingsIcon}><Text style={{fontSize:22,color:C.ink}}>⚙</Text></Pressable>
  </View>;
}
function InfoCard({children,style}) {return <View style={[styles.surface,style]}>{children}</View>;}

export default function App() {
  const {width}=useWindowDimensions();
  const big=width>800;
  const [page,setPage]=useState('inbox');
  const [projects,setProjects]=useState(initialProjects);
  const [thoughts,setThoughts]=useState(initialThoughts);
  const [selectedProject,setSelectedProject]=useState('all');
  const [filter,setFilter]=useState('all');
  const [query,setQuery]=useState('');
  const [draft,setDraft]=useState('');
  const [draftProject,setDraftProject]=useState(null);
  const [editing,setEditing]=useState(null);
  const [editText,setEditText]=useState('');
  const [editTitle,setEditTitle]=useState('');
  const [projectModal,setProjectModal]=useState(false);
  const [newProject,setNewProject]=useState('');
  const [store,setStore]=useState('notion');
  const [notice,setNotice]=useState('');

  const reviewCount=thoughts.filter(t=>t.status==='needs_review').length;
  const unassignedCount=thoughts.filter(t=>t.projectId===null).length;
  const selectedName=selectedProject==='all'?'Все мысли':selectedProject==='inbox'?'Inbox':projects.find(p=>p.id===selectedProject)?.name||'Все мысли';
  const shown=useMemo(()=>thoughts.filter(t=>{
    if(selectedProject==='inbox' && t.projectId!==null)return false;
    if(selectedProject!=='all'&&selectedProject!=='inbox'&&t.projectId!==selectedProject)return false;
    if(filter==='needs_review'&&t.status!=='needs_review')return false;
    if(filter==='ready'&&t.status!=='ready')return false;
    const q=query.trim().toLowerCase();
    return !q||[t.title,t.text,t.summary,...t.tags].join(' ').toLowerCase().includes(q);
  }),[thoughts,filter,selectedProject,query]);
  function goInbox(which='all') {setPage('inbox');setSelectedProject(which);setFilter('all');}
  function addThought(){
    if(!draft.trim())return;
    const body=draft.trim();
    setThoughts(items=>[{id:uid(),title:body.split(/[.!?\n]/)[0].slice(0,62)||'Новая мысль',text:body,summary:'Демонстрационная заметка — AI-обработка не запущена.',category:'note',projectId:draftProject,status:'needs_review',date:'Сейчас',tags:['демо']},...items]);
    setDraft('');setNotice('Мысль добавлена в демо (не сохраняется в Notion)');goInbox();
  }
  function addProject(){if(!newProject.trim())return;setProjects(ps=>[...ps,{id:uid(),name:newProject.trim(),desc:'Новый проект',color:projectColors[ps.length%projectColors.length]}]);setNewProject('');setProjectModal(false);setNotice('Демонстрационный проект добавлен');}
  function editThought(t){setEditing(t);setEditTitle(t.title);setEditText(t.text);}
  function saveThought(){setThoughts(a=>a.map(t=>t.id===editing.id?{...t,title:editTitle.trim()||t.title,text:editText,summary:editText.slice(0,90)}:t));setEditing(null);setNotice('Изменения видны только в этом демо');}
  function removeThought(){setThoughts(a=>a.filter(t=>t.id!==editing.id));setEditing(null);setNotice('Демонстрационная запись удалена');}
  function projectName(id){return projects.find(p=>p.id===id)?.name||'Inbox';}

  const nav=(
    <View style={big?styles.sidebar:styles.bottomNav}>
      {big&&<View style={{marginBottom:30}}><Text style={styles.brand}>thoughts<Text style={{color:C.purple}}>.</Text></Text><Text style={styles.brandCaption}>YOUR SECOND BRAIN</Text></View>}
      {[{id:'inbox',icon:'▦',name:'Мысли'},{id:'projects',icon:'◈',name:'Проекты'},{id:'settings',icon:'⚙',name:'Настройки'}].map(t=>
        <Pressable key={t.id} accessibilityRole="tab" accessibilityState={{selected:page===t.id}} onPress={()=>setPage(t.id)} style={[styles.navButton,big&&{flexDirection:'row',justifyContent:'flex-start',gap:12},page===t.id&&styles.navButtonActive]}>
          <Text style={[styles.navEmoji,page===t.id&&{color:C.purple}]}>{t.icon}</Text><Text style={[styles.navText,page===t.id&&{color:C.purple}]}>{t.name}</Text>
        </Pressable>)}
      {big&&<View style={{marginTop:30,paddingTop:20,borderTopWidth:1,borderTopColor:C.line}}>
        <Text style={styles.caption}>ПРОЕКТЫ</Text>
        {projects.map(p=><Pressable key={p.id} onPress={()=>goInbox(p.id)} style={{paddingVertical:10,flexDirection:'row',alignItems:'center',gap:10}}><View style={{width:9,height:9,borderRadius:6,backgroundColor:p.color}}/><Text style={styles.navText}>{p.name}</Text></Pressable>)}
      </View>}
    </View>
  );

  return <View style={styles.root}>
    <StatusBar backgroundColor={C.white} barStyle="dark-content"/>
    {!big&&<Header onSettings={()=>setPage('settings')}/>}
    {big&&nav}
    <KeyboardAvoidingView style={{flex:1,minWidth:0}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.page,big&&{maxWidth:850,width:'100%',alignSelf:'center',paddingHorizontal:34,paddingTop:46}]}>
        <View style={styles.banner}><Text style={styles.bannerText}>◉  ИНТЕРАКТИВНОЕ ДЕМО · EXPO GO</Text></View>
        {notice?<Pressable onPress={()=>setNotice('')} style={[styles.banner,{backgroundColor:C.greenBg,marginTop:0}]}><Text style={{color:C.green,fontSize:12}}>{notice}  ✕</Text></Pressable>:null}
        {page==='inbox'?<>
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>ТВОИ ИДЕИ В ОДНОМ МЕСТЕ</Text>
            <Text style={styles.title}>Каждая мысль{big?' — начало':'\n— начало'} чего-то.</Text>
            <Text style={styles.subtitle}>Записывай всё, что приходит в голову.{big?'':'\n'} Thoughts поможет навести порядок.</Text>
          </View>
          <InfoCard style={{borderColor:'#DDDCFD',borderWidth:1}}>
            <View style={styles.inlineBetween}><Text style={styles.cardHeading}>✦  Новая мысль</Text><Text style={styles.caption}>Быстрый захват</Text></View>
            <TextInput placeholder="Напиши идею, задачу или мысль…" placeholderTextColor={C.light} multiline textAlignVertical="top" style={styles.composerInput} value={draft} onChangeText={setDraft}/>
            <View style={{flexDirection:'row',alignItems:'center',gap:8,paddingBottom:12}}>
              <View style={styles.micCircle}><Text style={{fontSize:18}}>🎙</Text></View>
              <Text style={styles.help}>Для диктовки используй 🎤 на клавиатуре</Text>
            </View>
            <View style={styles.divider}/>
            <View style={{gap:10,marginTop:12}}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:7,paddingRight:10}}>
                <Pill label="✧ Авто-проект" active={!draftProject} onPress={()=>setDraftProject(null)}/>
                {projects.map(p=><Pill key={p.id} label={p.name} active={draftProject===p.id} onPress={()=>setDraftProject(p.id)}/>)}
              </ScrollView>
              <Button label="Сохранить мысль ↗" onPress={addThought} disabled={!draft.trim()}/>
            </View>
          </InfoCard>
          <View style={styles.metrics}>
            {[[String(thoughts.length),'Всего мыслей'],[String(projects.length),'Проекта'],[String(reviewCount),'На проверку']].map(([num,label])=><InfoCard key={label} style={styles.metric}><Text style={styles.metricValue}>{num}</Text><Text style={styles.metricCaption}>{label}</Text></InfoCard>)}
          </View>
          <View style={styles.inlineBetween}>
            <View><Text style={styles.h2}>{selectedName}</Text><Text style={styles.help}>Всё важное — под рукой</Text></View>
            <Text style={styles.count}>{shown.length} записей</Text>
          </View>
          <View style={styles.searchWrap}><Text style={{color:C.light,fontSize:17}}>⌕</Text><TextInput value={query} onChangeText={setQuery} placeholder="Поиск по мыслям..." placeholderTextColor={C.light} style={{flex:1,color:C.ink,fontSize:14}}/></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:7,paddingVertical:2}}>
            <Pill label="Все" active={selectedProject==='all'} onPress={()=>goInbox('all')}/>
            <Pill label={`Inbox (${unassignedCount})`} active={selectedProject==='inbox'} onPress={()=>goInbox('inbox')}/>
            {projects.map(p=><Pill key={p.id} label={p.name} active={selectedProject===p.id} onPress={()=>goInbox(p.id)}/>)}
          </ScrollView>
          <View style={{flexDirection:'row',gap:8}}>
            <Pill label="Все статусы" active={filter==='all'} onPress={()=>setFilter('all')}/>
            <Pill label="✓ Готово" active={filter==='ready'} onPress={()=>setFilter('ready')}/>
            <Pill label="◇ Проверить" active={filter==='needs_review'} onPress={()=>setFilter('needs_review')}/>
          </View>
          {shown.length===0?<InfoCard><Text style={styles.help}>Пока здесь нет мыслей — создай первую выше.</Text></InfoCard>:shown.map(t=><Pressable accessibilityRole="button" key={t.id} onPress={()=>editThought(t)} style={styles.thoughtCard}>
            <View style={{flexDirection:'row',alignItems:'center',gap:11}}>
              <View style={[styles.catIcon,{backgroundColor:t.category==='task'?C.greenBg:C.pale}]}><Text style={{fontSize:21,color:C.purple}}>{categoryIcon[t.category]}</Text></View>
              <View style={{flex:1}}><Text style={styles.thoughtTitle}>{t.title}</Text><Text style={styles.caption}>{t.date} · {categoryName[t.category]}</Text></View>
              <View style={[styles.status,{backgroundColor:t.status==='ready'?C.greenBg:C.amberBg}]}><Text style={{fontSize:10,fontWeight:'700',color:t.status==='ready'?C.green:C.amber}}>{t.status==='ready'?'✓ Готово':'◇ Проверить'}</Text></View>
            </View>
            <Text style={styles.thoughtDescription}>{t.summary}</Text>
            <View style={styles.divider}/>
            <View style={{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'}}><Pill label={'▢ '+projectName(t.projectId)} onPress={()=>goInbox(t.projectId||'inbox')}/>{t.tags.map(tag=><Text key={tag} style={styles.tag}>#{tag}</Text>)}</View>
          </Pressable>)}
        </>:page==='projects'?<>
          <View style={styles.hero}><Text style={styles.eyebrow}>РАБОЧЕЕ ПРОСТРАНСТВО</Text><Text style={styles.title}>Мои проекты</Text><Text style={styles.subtitle}>Место для каждой идеи.</Text></View>
          <Button label="＋  Новый проект" onPress={()=>setProjectModal(true)}/>
          {projects.map(p=><Pressable key={p.id} onPress={()=>goInbox(p.id)} style={[styles.surface,{flexDirection:'row',alignItems:'center',gap:14}]}>
            <View style={[styles.projectSquare,{backgroundColor:p.color+'20'}]}><Text style={{fontSize:25,color:p.color}}>◈</Text></View>
            <View style={{flex:1}}><Text style={styles.projectName}>{p.name}</Text><Text style={styles.help}>{p.desc}</Text><Text style={[styles.caption,{color:C.purple,marginTop:6}]}>{thoughts.filter(t=>t.projectId===p.id).length} мыслей</Text></View><Text style={{color:C.light,fontSize:23}}>›</Text>
          </Pressable>)}
          <InfoCard style={{backgroundColor:C.pale}}><Text style={{color:C.purple,fontWeight:'700',fontSize:13}}>✦  Всё по своим местам</Text><Text style={[styles.help,{marginTop:8}]}>В настоящем приложении AI автоматически распределяет мысли по проектам.</Text></InfoCard>
        </>:<>
          <View style={styles.hero}><Text style={styles.eyebrow}>НАСТРОЙ ПОД СЕБЯ</Text><Text style={styles.title}>Настройки</Text><Text style={styles.subtitle}>Управляй хранилищем и AI-помощником.</Text></View>
          <InfoCard><Text style={styles.cardHeading}>▢  Хранилище мыслей</Text><Text style={styles.help}>Как сохранять твои записи</Text>
            <View style={{flexDirection:'row',gap:8,marginTop:15}}><Pill label="Notion" active={store==='notion'} onPress={()=>setStore('notion')}/><Pill label="SQLite / API" active={store==='sqlite'} onPress={()=>setStore('sqlite')}/></View>
            <View style={styles.settingsNote}><Text style={styles.settingsNoteText}>◉  {store==='notion'?'Notion — без собственного backend':'SQLite — через собственный API'}</Text><Text style={styles.help}>В демо подключение отключено. Настоящие ключи здесь не вводи.</Text></View>
            <View style={styles.fakeField}><Text style={styles.help}>{store==='notion'?'Ссылка на страницу Notion':'Адрес backend API'}</Text><Text style={styles.fakePlaceholder}>{store==='notion'?'https://notion.so/...':'https://api.example.com'}</Text></View>
            <Button label="Подключить (только в полной версии)" secondary disabled onPress={()=>{}}/>
          </InfoCard>
          <InfoCard><Text style={styles.cardHeading}>✦  AI-провайдеры</Text><Text style={styles.help}>Обработка и классификация заметок</Text>
            {[['Классификация','Jev · OpenRouter'],['Заголовки и резюме','DeepSeek · OpenRouter'],['Контекст','Notion MCP · OAuth']].map(([label,val])=><View key={label} style={[styles.inlineBetween,{paddingTop:14,paddingBottom:10,borderBottomWidth:1,borderBottomColor:C.line}]}><View><Text style={styles.fieldLabel}>{label}</Text><Text style={[styles.help,{marginTop:5}]}>{val}</Text></View><Text style={{color:C.purple,fontSize:18}}>◈</Text></View>)}
          </InfoCard>
          <InfoCard style={{backgroundColor:'#F0F3FF'}}><Text style={{fontWeight:'800',color:C.purple}}>Демо-режим Expo Go</Text><Text style={[styles.help,{marginTop:9,lineHeight:20}]}>Можно переключать вкладки, искать, создавать, редактировать и удалять тестовые записи. Данные не покидают телефон и сбрасываются при перезапуске. Ни Notion, ни AI не вызываются.</Text></InfoCard>
        </>}
        <Text style={[styles.help,{textAlign:'center',marginTop:10,marginBottom:5}]}>THOUGHTS  ·  UI PREVIEW  ·  EXPO GO</Text>
      </ScrollView>
    </KeyboardAvoidingView>
    {!big&&nav}

    <Modal visible={!!editing} transparent animationType="fade" onRequestClose={()=>setEditing(null)}>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={styles.modalBackdrop}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalPosition}><View style={styles.modalCard}>
        <View style={styles.inlineBetween}><Text style={styles.h2}>Редактировать мысль</Text><Pressable onPress={()=>setEditing(null)}><Text style={{fontSize:20,color:C.muted}}>✕</Text></Pressable></View>
        <Field label="Название" value={editTitle} onChangeText={setEditTitle}/><Field label="Исходная мысль" value={editText} onChangeText={setEditText} multiline/>
        <View style={{flexDirection:'row',gap:8,marginTop:14}}><View style={{flex:1}}><Button label="Удалить" secondary onPress={removeThought}/></View><View style={{flex:1}}><Button label="Сохранить" onPress={saveThought}/></View></View>
      </View></ScrollView></KeyboardAvoidingView>
    </Modal>
    <Modal visible={projectModal} transparent animationType="fade" onRequestClose={()=>setProjectModal(false)}>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={styles.modalBackdrop}><View style={styles.modalCard}>
        <View style={styles.inlineBetween}><Text style={styles.h2}>Новый проект</Text><Pressable onPress={()=>setProjectModal(false)}><Text style={{fontSize:20,color:C.muted}}>✕</Text></Pressable></View>
        <Field label="Название проекта" value={newProject} onChangeText={setNewProject} placeholder="Например, Мой стартап"/><View style={{marginTop:18}}><Button label="Создать проект" onPress={addProject} disabled={!newProject.trim()}/></View>
      </View></KeyboardAvoidingView>
    </Modal>
  </View>;
}

const styles=StyleSheet.create({
  root:{flex:1,flexDirection:'row',backgroundColor:C.bg},
  header:{backgroundColor:C.white,paddingHorizontal:20,paddingTop:12,paddingBottom:12,alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderColor:C.line,position:'absolute',top:0,left:0,right:0,zIndex:10,height:70,flexDirection:'row'},
  brandRow:{flexDirection:'row',alignItems:'center',gap:11},brandIcon:{width:37,height:37,borderRadius:12,backgroundColor:C.purple,alignItems:'center',justifyContent:'center'},brandStar:{fontSize:22,color:C.white,fontWeight:'800'},
  brand:{fontSize:24,fontWeight:'900',letterSpacing:-1,color:C.ink},brandCaption:{fontSize:7,letterSpacing:1.6,fontWeight:'800',color:C.light},settingsIcon:{padding:8},
  sidebar:{backgroundColor:C.white,width:240,padding:22,paddingTop:48,borderRightWidth:1,borderColor:C.line},
  bottomNav:{height:69,backgroundColor:C.white,flexDirection:'row',borderTopWidth:1,borderColor:C.line,paddingHorizontal:9,paddingTop:5,paddingBottom:5},
  navButton:{flex:1,alignItems:'center',justifyContent:'center',gap:3,borderRadius:11,paddingVertical:5},navButtonActive:{backgroundColor:C.pale},navEmoji:{fontSize:20,color:C.muted},navText:{fontSize:11,fontWeight:'700',color:C.muted},
  page:{paddingHorizontal:17,paddingTop:90,paddingBottom:35,gap:15},
  banner:{alignSelf:'flex-start',paddingVertical:7,paddingHorizontal:12,borderRadius:8,backgroundColor:C.pale,marginBottom:2},bannerText:{fontSize:9,fontWeight:'900',letterSpacing:1.2,color:C.purple},
  hero:{gap:8,marginVertical:8},eyebrow:{fontWeight:'900',fontSize:10,color:C.purple,letterSpacing:1.6},title:{fontSize:29,lineHeight:38,fontWeight:'900',letterSpacing:-1.3,color:C.ink},subtitle:{fontSize:13,lineHeight:21,color:C.muted},
  surface:{backgroundColor:C.white,borderRadius:15,borderWidth:1,borderColor:C.line,padding:16,gap:10},inlineBetween:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},cardHeading:{fontSize:15,fontWeight:'800',color:C.ink},caption:{fontSize:10,color:C.light,marginTop:3},
  composerInput:{minHeight:96,color:C.ink,fontSize:15,lineHeight:23,paddingTop:15,paddingBottom:4},micCircle:{width:34,height:34,backgroundColor:C.pale,alignItems:'center',justifyContent:'center',borderRadius:9},help:{fontSize:12,color:C.muted,lineHeight:19,flexShrink:1},
  divider:{height:1,backgroundColor:C.line},button:{minHeight:43,borderRadius:10,justifyContent:'center',alignItems:'center',paddingHorizontal:12,paddingVertical:11},buttonMain:{backgroundColor:C.purple},buttonSecondary:{backgroundColor:C.pale},buttonText:{color:C.white,fontWeight:'800',fontSize:13},
  pill:{borderWidth:1,borderColor:C.line,backgroundColor:C.white,borderRadius:9,paddingHorizontal:11,paddingVertical:8,alignSelf:'flex-start'},pillActive:{backgroundColor:C.pale,borderColor:'#DEDDFA'},pillText:{fontSize:11,fontWeight:'700',color:'#6F758C'},
  metrics:{flexDirection:'row',gap:8},metric:{flex:1,paddingHorizontal:12,paddingVertical:14,alignItems:'flex-start'},metricValue:{fontSize:25,fontWeight:'900',color:C.ink},metricCaption:{fontSize:10,color:C.muted,marginTop:4},
  h2:{fontWeight:'900',fontSize:21,color:C.ink},count:{fontSize:11,color:C.light},searchWrap:{flexDirection:'row',alignItems:'center',gap:10,height:47,borderRadius:11,borderColor:C.line,borderWidth:1,backgroundColor:C.white,paddingHorizontal:14},
  thoughtCard:{backgroundColor:C.white,borderRadius:15,borderWidth:1,borderColor:C.line,padding:15,gap:12},catIcon:{width:40,height:40,borderRadius:12,alignItems:'center',justifyContent:'center'},thoughtTitle:{fontSize:14,fontWeight:'800',color:C.ink,lineHeight:21},thoughtDescription:{color:'#71788F',fontSize:13,lineHeight:20},status:{borderRadius:7,paddingHorizontal:7,paddingVertical:6},tag:{color:C.purple,fontSize:11,fontWeight:'600'},
  projectSquare:{width:54,height:54,alignItems:'center',justifyContent:'center',borderRadius:14},projectName:{fontSize:16,fontWeight:'800',color:C.ink},
  settingsNote:{padding:12,backgroundColor:'#EEF2FC',borderRadius:10,gap:7,marginTop:6},settingsNoteText:{fontSize:12,color:C.purple,fontWeight:'800'},fakeField:{padding:13,borderRadius:9,borderColor:C.line,borderWidth:1,gap:8},fakePlaceholder:{fontSize:12,color:C.light},
  modalBackdrop:{flex:1,backgroundColor:'rgba(20,28,47,0.55)',padding:18,justifyContent:'center'},modalPosition:{flexGrow:1,justifyContent:'center'},modalCard:{backgroundColor:C.white,borderRadius:18,padding:22,gap:8,width:'100%',maxWidth:550,alignSelf:'center'},fieldLabel:{fontSize:12,color:C.ink,fontWeight:'700'},field:{backgroundColor:C.white,borderWidth:1,borderColor:C.line,borderRadius:9,paddingHorizontal:12,paddingVertical:10,minHeight:44,color:C.ink},
});
