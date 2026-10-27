import {useEffect,useMemo,useRef,useState} from 'react';
import type {ChangeEvent,ReactNode} from 'react';
import {ArrowLeft,BarChart3,CalendarDays,Check,ChevronDown,ChevronLeft,ChevronRight,Download,Dumbbell,Heart,Menu,MoreHorizontal,Plus,Search,Settings,SlidersHorizontal,Star,Trash2,Upload,UserRound,X} from 'lucide-react';
import {cloudReady,checkAllowed,fetchCloud,login,logout,subscribeAuth} from './cloud';
import {readCache,writeCache} from './cache';
import type {CacheState} from './cache';
import {getConfig,getChangedDays,writeDay,writeConfig,migrate,VersionConflict} from './cloudV2';
import {Database,Workout,Routine,defaults,newId,dateKey,today,makeSet,volume,setsCount} from './model';
import type {User} from 'firebase/auth';

type Page='calendar'|'detail'|'day'|'choose'|'custom'|'routines'|'routineEdit'|'dashboard'|'weekly'|'body'|'bodyEdit'|'settings'|'exerciseList';
const copy=<T,>(x:T):T=>JSON.parse(JSON.stringify(x));
const parts=['전체','유산소','목','승모근','어깨','가슴','등','삼두','이두','전완','복부','허리','엉덩이','하체','종아리'];
const equipment=['바벨','덤벨','케이블','머신','맨몸','기타'];
const methods=['횟수 / 시간','무게 × 횟수','(체중 - 무게) × 횟수','단계 × 횟수','횟수','시간','무게 × 시간'];
const colors=['#fc565e','#e5a8b3','#b51820','#f0a22f','#dfd246','#39884a','#87c68d','#338cff','#99c5d1','#5557bf','#a644ac','#bd8aba','#813cab','#90745a','#8c909b','#5e768b','#151515'];
function readLocal(key:string):Database{try{const v=localStorage.getItem(key);if(v){const data=JSON.parse(v) as Database;return {...copy(defaults),...data,exercises:[...data.exercises,...defaults.exercises.filter(e=>!data.exercises.some(old=>old.id===e.id||old.name===e.name&&old.tool===e.tool))],preferences:{...defaults.preferences,...data.preferences}}}}catch{}return copy(defaults)}
const labelDate=(key:string)=>{const [y,m,d]=key.split('-').map(Number);return `${y}년 ${m}월 ${d}일`};
function setVolume(w:Workout){return w.sets.filter(x=>x.type==='N').reduce((sum,s)=>sum+s.weight*s.reps,0)}
const fmtVol=(n:number)=>n>=1000?`${(n/1000).toFixed(1)}t`:`${Math.round(n)}kg`;
function App(){
 const [db,setDb]=useState<Database>(()=>copy(defaults));const [page,setPage]=useState<Page>('calendar');const [drawer,setDrawer]=useState(false);
 const [detailIndex,setDetailIndex]=useState(0);const [expandedSet,setExpandedSet]=useState<string|null>(null);const [dragOrigin,setDragOrigin]=useState<string|null>(null);const [dragTarget,setDragTarget]=useState<string|null>(null);const dragTimer=useRef<number|undefined>(undefined);const dragActive=useRef(false);const suppressClick=useRef(false);const [restEnd,setRestEnd]=useState<number|null>(null);const [remaining,setRemaining]=useState(0);const touchStart=useRef<number|null>(null);
 const [date,setDate]=useState(today());const [month,setMonth]=useState(()=>new Date());const [slot,setSlot]=useState(0);
 const [filter,setFilter]=useState('전체');const [toolFilter,setToolFilter]=useState('전체');const [collapsedGroups,setCollapsedGroups]=useState<string[]>([]);const [query,setQuery]=useState('');const [chosen,setChosen]=useState<string[]>([]);const [choiceTarget,setChoiceTarget]=useState<'day'|'routine'>('day');
 const [routineId,setRoutineId]=useState<string|null>(null);const [expanded,setExpanded]=useState<string[]>([]);
 const [user,setUser]=useState<User|null>(null);
 const [access,setAccess]=useState<'checking'|'signed-out'|'pending'|'allowed'|'denied'|'error'>('checking');
 const [sync,setSync]=useState('사용자별 저장');const [loginError,setLoginError]=useState('');
 const [dataOwner,setDataOwner]=useState<string|null>(null);
 const [loginBusy,setLoginBusy]=useState(false);
 const [legacyAvailable,setLegacyAvailable]=useState(false);
 const [autoSyncReady,setAutoSyncReady]=useState(false);
 const [syncBlocked,setSyncBlocked]=useState(false);
 const cacheRef=useRef<CacheState|null>(null);
 const dataRef=useRef<Database>(copy(defaults));
 const flushBusy=useRef(false);
 const timerRef=useRef<number|undefined>(undefined);
 const lastFlushRef=useRef(Date.now());
 const userRef=useRef<string|null>(null);
 const sessionRef=useRef(0);
 const [pendingCount,setPendingCount]=useState(0);
 const [saving,setSaving]=useState(false);
 const saveQueue=useRef<Set<string>>(new Set());
 const firstSnapshot=useRef(true);

 const [newExercise,setNewExercise]=useState({name:'',part:'하체',tool:'기타',method:'무게 × 횟수'});
 const [bodyForm,setBodyForm]=useState({weight:'',muscle:'',fat:'',memo:''});
 const fileRef=useRef<HTMLInputElement>(null);
 const theme=db.preferences.theme==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):db.preferences.theme;
 useEffect(()=>{document.documentElement.dataset.theme=theme;document.documentElement.style.setProperty('--accent',db.preferences.accent);document.documentElement.style.fontSize=`${db.preferences.scale}%`},[theme,db.preferences.accent,db.preferences.scale]);
 // Local-first persistence; saves every edit to IndexedDB before any remote operation.
 useEffect(()=>{dataRef.current=db;if(access!=='allowed'||!user||dataOwner!==user.uid||!cacheRef.current)return;
  const uid=user.uid,cache=cacheRef.current;
  const before=cache.data;
  const changed=Object.keys({...before.days,...db.days}).filter(key=>JSON.stringify(before.days[key]||null)!==JSON.stringify(db.days[key]||null));
  const configPart=(data:Database)=>{const {days:_days,...other}=data;void _days;return other;};
  const configChanged=JSON.stringify(configPart(before))!==JSON.stringify(configPart(db));
  cache.data=copy(db);
  if(!firstSnapshot.current){changed.forEach(key=>saveQueue.current.add(key));if(configChanged)saveQueue.current.add('@config');}
  firstSnapshot.current=false;
  cache.pending=Array.from(saveQueue.current);setPendingCount(cache.pending.length);
  writeCache(uid,cache).catch(()=>{setSync('로컬 저장 실패 · JSON 백업을 권장합니다.');});
  localStorage.setItem(`workout-grove-user-${uid}`,JSON.stringify(db));
  if(!autoSyncReady||syncBlocked||saveQueue.current.size===0)return;
  window.clearTimeout(timerRef.current);
  const elapsed=Date.now()-lastFlushRef.current;
  timerRef.current=window.setTimeout(()=>{void flush();},elapsed>120000?50:30000);
  return()=>window.clearTimeout(timerRef.current);
 },[db,access,user,dataOwner,autoSyncReady,syncBlocked]);
 useEffect(()=>{
  if(!cloudReady){setAccess('error');setLoginError('Firebase 설정 파일을 확인하십시오.');return;}
  let active=true;
  return subscribeAuth(u=>{
   const epoch=++sessionRef.current;userRef.current=null;window.clearTimeout(timerRef.current);
   cacheRef.current=null;firstSnapshot.current=true;saveQueue.current.clear();setPendingCount(0);
   setAutoSyncReady(false);setSyncBlocked(false);setUser(u);setDataOwner(null);setDb(copy(defaults));setPage('calendar');
   if(!u){setAccess('signed-out');return;}
   setAccess('pending');setSync('계정별 운동 기록 동기화 중…');
   (async()=>{
    if(!(await checkAllowed(u))){if(active&&epoch===sessionRef.current)setAccess('denied');return;}
    const uid=u.uid;
    // Remote migration is non-destructive. Migration runs once per user, preserving app/main.
    let config=await getConfig(uid);
    if(!config){const legacy=await fetchCloud(uid);if(legacy){await migrate(uid,legacy.data);config=await getConfig(uid);}}
    const cache=await readCache(uid);
    const initial=cache?.data?copy(cache.data):readLocal(`workout-grove-user-${uid}`);
    const dirty=new Set(cache?.pending||[]);
    const previousSync=cache?.syncReady?cache.lastSync:0;
    const [remoteDays,remoteConfig]=await Promise.all([getChangedDays(uid,previousSync),config?getConfig(uid):Promise.resolve(null)]);
    if(!active||epoch!==sessionRef.current)return;
    if(remoteConfig){
     if(dirty.has('@config')&&cache&&remoteConfig.version!==cache.configVersion){setSyncBlocked(true);setSync('설정 충돌 · 다른 기기 변경 감지');}
     else if(!dirty.has('@config'))Object.assign(initial,copy(remoteConfig.config));
    }
    const versions={...(cache?.versions||{})};
    let conflict=false;
    for(const item of remoteDays){if(dirty.has(item.key)&&cache&&versions[item.key]!==item.version){conflict=true;continue;}
     versions[item.key]=item.version;
     if(!dirty.has(item.key)){if(item.deleted)delete initial.days[item.key];else initial.days[item.key]=item.sessions;}
    }
    if(!remoteConfig&&!cache){setSync('클라우드 기록 없음 · 첫 저장 준비');}
    else if(!conflict)setSync('클라우드 변경분 동기화 완료');
    if(conflict){setSyncBlocked(true);setSync('날짜별 데이터 충돌 · JSON 백업 후 확인 필요');}
    const next:CacheState={data:copy(initial),lastSync:Date.now()-10000,versions,configVersion:remoteConfig?.version||cache?.configVersion||0,pending:Array.from(dirty),syncReady:true};
    cacheRef.current=next;saveQueue.current=dirty;setPendingCount(dirty.size);
    await writeCache(uid,next);
    if(!active||epoch!==sessionRef.current)return;
    userRef.current=uid;firstSnapshot.current=true;setDb(initial);setDataOwner(uid);
    setLegacyAvailable(Boolean(localStorage.getItem('bodycalendar-v1')));
    setAutoSyncReady(true);setAccess('allowed');
    if(dirty.size&&!conflict)window.setTimeout(()=>{if(userRef.current===uid)void flush();},30000);
   })().catch(e=>{if(active&&epoch===sessionRef.current){setAccess('error');setLoginError(e instanceof Error?e.message:String(e));}});
  });
 },[]);
 async function flush(){
  if(flushBusy.current||syncBlocked||!userRef.current||!cacheRef.current||saveQueue.current.size===0)return;
  const uid=userRef.current,epoch=sessionRef.current,cache=cacheRef.current;
  flushBusy.current=true;setSaving(true);setSync('변경 기록 일괄 저장 중…');
  const keys=Array.from(saveQueue.current);
  try{
   for(const key of keys){if(epoch!==sessionRef.current)return;
    const snapshot=cache.data;
    const sent=key==='@config'?JSON.stringify((()=>{const {days:_days,...rest}=snapshot;void _days;return rest;})()):JSON.stringify(snapshot.days[key]||null);
    let nextVersion:number;
    if(key==='@config'){const {days:_days,...config}=snapshot;void _days;nextVersion=await writeConfig(uid,config,cache.configVersion);cache.configVersion=nextVersion;}
    else {nextVersion=await writeDay(uid,key,snapshot.days[key]||null,cache.versions[key]||0);cache.versions[key]=nextVersion;}
    const current=cache.data;
    const currentValue=key==='@config'?JSON.stringify((()=>{const {days:_days,...rest}=current;void _days;return rest;})()):JSON.stringify(current.days[key]||null);
    if(sent===currentValue)saveQueue.current.delete(key);
    cache.pending=Array.from(saveQueue.current);setPendingCount(cache.pending.length);
    await writeCache(uid,cache);
   }
   lastFlushRef.current=Date.now();setSync('자동 저장 완료');
  }catch(e){setSync(`자동 저장 보류: ${e instanceof Error?e.message:'오류'}`);if(e instanceof VersionConflict)setSyncBlocked(true);
  }finally{flushBusy.current=false;setSaving(false);
   if(epoch===sessionRef.current&&saveQueue.current.size&&!syncBlocked)timerRef.current=window.setTimeout(()=>void flush(),30000);
  }
 }
 // Synchronize on tab return; network errors preserve IndexedDB pending writes.
 useEffect(()=>{if(access!=='allowed')return;
  const onVisible=()=>{if(document.visibilityState==='visible'&&userRef.current){
    if(saveQueue.current.size)void flush();
    else void refreshRemote();
  }};
  document.addEventListener('visibilitychange',onVisible);window.addEventListener('online',onVisible);
  return()=>{document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('online',onVisible)};
 },[access,syncBlocked]);
 async function refreshRemote(){
  const uid=userRef.current,c=cacheRef.current;if(!uid||!c||saveQueue.current.size||flushBusy.current)return;
  try{const days=await getChangedDays(uid,c.lastSync);const remoteConfig=await getConfig(uid);
   if(uid!==userRef.current||saveQueue.current.size)return;
   const merged=copy(c.data);let changed=false;
   for(const d of days){if((c.versions[d.key]||0)!==d.version){c.versions[d.key]=d.version;if(d.deleted)delete merged.days[d.key];else merged.days[d.key]=d.sessions;changed=true;}}
   if(remoteConfig&&remoteConfig.version!==c.configVersion){Object.assign(merged,remoteConfig.config);c.configVersion=remoteConfig.version;changed=true;}
   c.lastSync=Date.now()-10000;
   if(changed){c.data=copy(merged);firstSnapshot.current=true;setDb(merged);setSync('다른 기기 변경 사항 반영');}
   await writeCache(uid,c);
  }catch{setSync('클라우드 확인 실패 · 로컬 기록 유지');}
 }
 function importLegacy(){
 if(!user||access!=='allowed'||!legacyAvailable)return;
 if(!window.confirm('구버전 브라우저의 공용 로컬 운동 기록을 이 계정에 복사합니다. 현재 계정의 로컬 기록을 대체합니다. 먼저 JSON 백업을 권장합니다.'))return;
 setDb(readLocal('bodycalendar-v1'));setSync('구버전 기록을 이 계정의 로컬 저장소로 가져왔습니다. 클라우드 업로드는 별도로 실행하십시오.');
}
 async function handleLogin(){setLoginBusy(true);setLoginError('');try{await login()}catch(e){setLoginError(e instanceof Error?e.message:'Google 로그인 실패')}finally{setLoginBusy(false)}}
 async function handleLogout(){if(saveQueue.current.size&&!window.confirm('아직 클라우드로 전송되지 않은 기록이 있습니다. 로그아웃하시겠습니까? 로컬 기록은 보관됩니다.'))return;setAccess('pending');setDataOwner(null);setDb(copy(defaults));await logout();}
 async function uploadCurrent(){if(!user||access!=='allowed')return; if(!window.confirm('현재 기록의 모든 날짜를 클라우드에 재저장합니다. 충돌 시 중단합니다. 계속하시겠습니까?'))return;
  const c=cacheRef.current;if(!c)return;Object.keys(c.data.days).forEach(k=>saveQueue.current.add(k));saveQueue.current.add('@config');c.pending=Array.from(saveQueue.current);await writeCache(user.uid,c);setSyncBlocked(false);setPendingCount(c.pending.length);await flush();}
 async function downloadCurrent(){if(!user||access!=='allowed')return;if(saveQueue.current.size){alert('미전송 변경이 있습니다. 먼저 JSON 백업 후 동기화하십시오.');return;}const uid=user.uid;
  const [days,config]=await Promise.all([getChangedDays(uid),getConfig(uid)]);if(!config)return;
  if(!window.confirm('클라우드 전체 기록으로 현재 데이터를 교체하시겠습니까? JSON 백업을 먼저 권장합니다.'))return;
  const initial={...copy(defaults),...config.config,days:Object.fromEntries(days.filter(d=>!d.deleted).map(d=>[d.key,d.sessions]))};
  const c:CacheState={data:copy(initial),lastSync:Date.now()-10000,versions:Object.fromEntries(days.map(d=>[d.key,d.version])),configVersion:config.version,pending:[],syncReady:true};
  cacheRef.current=c;await writeCache(uid,c);firstSnapshot.current=true;setDb(initial);setSyncBlocked(false);setSync('전체 클라우드 복원 완료');}
 useEffect(()=>{if(restEnd===null){setRemaining(0);return}const tick=()=>{const left=Math.max(0,Math.ceil((restEnd-Date.now())/1000));setRemaining(left);if(left===0)setRestEnd(null)};tick();const timer=window.setInterval(tick,250);return()=>window.clearInterval(timer)},[restEnd]);
 const update=(fn:(data:Database)=>void)=>setDb(prev=>{const next=copy(prev);fn(next);return next});
 const sessions=db.days[date]||[];const current=sessions[slot];const activeRoutine=db.routines.find(x=>x.id===routineId);
 function goto(p:Page){setPage(p);setDrawer(false)}
 function startRest(seconds:number){if(seconds>0)setRestEnd(Date.now()+seconds*1000);else setRestEnd(null)}
 function openDetail(index:number){setDetailIndex(index);setExpandedSet(null);goto('detail')}
 function moveDetail(direction:number){setExpandedSet(null);setDetailIndex(i=>Math.max(0,Math.min((current?.workouts.length||1)-1,i+direction)))}
 function completeSet(wid:string,si:number){const w=current?.workouts.find(w=>w.id===wid),set=w?.sets[si];if(!set)return;const next=!set.done;editWorkout(wid,item=>{item.sets[si].done=next});if(next)startRest(set.rest);else setRestEnd(null)}
 function copyDay(from:string,to:string){
   if(from===to)return;
   const originals=db.days[from]||[];
   if(!originals.some(x=>x.workouts.length)){return}
   const exists=(db.days[to]||[]).some(x=>x.workouts.length);
   let mode:'replace'|'append'='replace';
   if(exists){const selection=window.prompt('선택 날짜에 운동이 있습니다. 추가 / 대체 / 취소 중 선택하십시오.','추가');if(!selection||selection==='취소')return;if(selection!=='추가'&&selection!=='대체')return;mode=selection==='추가'?'append':'replace'}
   update(d=>{const copied=originals.map(sess=>({...copy(sess),id:newId(),duration:0,startedAt:undefined,workouts:sess.workouts.map(w=>({...copy(w),id:newId(),sets:w.sets.map(set=>({...copy(set),id:newId(),done:false}))}))}));
      if(mode==='replace')d.days[to]=copied;
      else {const target=d.days[to]||[];copied.forEach((session,index)=>{if(target[index])target[index].workouts.push(...session.workouts);else target[index]=session});d.days[to]=target}
   });setDate(to)
 }
 function stopDrag(){window.clearTimeout(dragTimer.current);dragActive.current=false;setDragOrigin(null);setDragTarget(null)}
 function beginDrag(k:string){window.clearTimeout(dragTimer.current);dragTimer.current=window.setTimeout(()=>{if((db.days[k]||[]).some(sess=>sess.workouts.length)){dragActive.current=true;setDragOrigin(k);setDragTarget(k)}},480)}
 function endDrag(k:string){window.clearTimeout(dragTimer.current);if(dragActive.current&&dragOrigin){suppressClick.current=true;copyDay(dragOrigin,k);window.setTimeout(()=>{suppressClick.current=false},100)}stopDrag()}
 function weightIncrement(id:string){return db.preferences.exerciseWeightSteps?.[id]||db.preferences.weightStep||2.5}
 function setWeightIncrement(id:string,value:string){update(d=>{d.preferences.exerciseWeightSteps??={};if(!value)delete d.preferences.exerciseWeightSteps[id];else d.preferences.exerciseWeightSteps[id]=Number(value)})}
 function openDay(k:string){setDate(k);setSlot(0);goto('day')}
 function ensureSession(d:Database,day=date,index=slot){if(!d.days[day])d.days[day]=[];while(d.days[day].length<=index)d.days[day].push({id:newId(),title:'자유 운동',duration:0,workouts:[]});return d.days[day][index]}
 function beginChoose(target:'day'|'routine'){setChoiceTarget(target);setChosen([]);setQuery('');setFilter('전체');setToolFilter('전체');goto('choose')}
 function addChosen(){
   if(chosen.length===0)return;
   // Resolve the active date, slot and selected exercise IDs before committing the update.
   // Keep the updater pure: React may replay state updaters in StrictMode.
   const selectedIds=[...new Set(chosen)].filter(id=>db.exercises.some(e=>e.id===id));
   if(!selectedIds.length){window.alert('추가할 운동을 찾지 못했습니다. 목록을 다시 선택해 주십시오.');return}
   const targetDate=date;
   const targetSlot=slot;
   const routineTargetId=routineId;
   const toRoutine=choiceTarget==='routine';
   const additions=selectedIds.map(id=>({id:newId(),exerciseId:id,sets:[makeSet(db.preferences.rest)]}));
   if(toRoutine&&!db.routines.some(r=>r.id===routineTargetId)){
     window.alert('편집 중인 템플릿을 찾지 못했습니다.');return;
   }
   setDb(previous=>{
     const next=copy(previous);
     if(toRoutine){
       const target=next.routines.find(r=>r.id===routineTargetId);
       if(target)target.workouts.push(...additions);
     }else{
       if(!Array.isArray(next.days[targetDate]))next.days[targetDate]=[];
       while(next.days[targetDate].length<=targetSlot){
         next.days[targetDate].push({id:newId(),title:'자유 운동',duration:0,workouts:[]});
       }
       next.days[targetDate][targetSlot].workouts.push(...additions);
     }
     return next;
   });
   setChosen([]);
   setQuery('');
   goto(toRoutine?'routineEdit':'day');
 }
 function editWorkout(wid:string,fn:(w:Workout)=>void,target:'day'|'routine'='day'){update(d=>{const list=target==='routine'?d.routines.find(x=>x.id===routineId)?.workouts:ensureSession(d).workouts;const item=list?.find(w=>w.id===wid);if(item)fn(item)})}
 function moveWorkout(wid:string,direction:number,target:'day'|'routine'){update(d=>{const list=target==='routine'?d.routines.find(x=>x.id===routineId)?.workouts:ensureSession(d).workouts;if(!list)return;const old=list.findIndex(w=>w.id===wid),next=old+direction;if(old>=0&&next>=0&&next<list.length){const [w]=list.splice(old,1);list.splice(next,0,w)}})}
 function removeWorkout(wid:string,target:'day'|'routine'){if(!confirm('운동을 삭제하시겠습니까?'))return;update(d=>{const list=target==='routine'?d.routines.find(x=>x.id===routineId)?.workouts:ensureSession(d).workouts;if(!list)return;const i=list.findIndex(x=>x.id===wid);if(i>=0)list.splice(i,1)})}
 const visibleExercises=(items:Database['exercises'])=>items.filter(e=>(filter==='전체'||e.part===filter)&&(toolFilter==='전체'||e.tool===toolFilter)&&e.name.toLowerCase().includes(query.toLowerCase()));
 const groupTitle=(name:string)=>name.replace(/\s*[·:,]\s*(바벨|덤벨|케이블|머신|맨몸|기타)(?:,.*)?$/,'').replace(/:\s*(바벨|덤벨|케이블|머신|맨몸|기타).*/,'').trim();
 const grouped=(items:Database['exercises'])=>Object.entries(items.reduce<Record<string,Database['exercises']>>((result,e)=>{const key=groupTitle(e.name);(result[key]??=[]).push(e);return result},{})).sort((a,b)=>a[0].localeCompare(b[0],'ko'));
 function groupedChoices(items:Database['exercises'],mode:'choose'|'list'){
 return grouped(items).map(([group,rows])=><div className="catalog-group" key={group}><button className="catalog-group-title" onClick={()=>setCollapsedGroups(v=>v.includes(group)?v.filter(x=>x!==group):[...v,group])}><strong>{group}</strong><small>{rows.length}종</small><ChevronDown size={17} className={collapsedGroups.includes(group)?'rotated':''}/></button>{!collapsedGroups.includes(group)&&rows.map(e=>mode==='choose'?<button key={e.id} className={`exercise-choice ${chosen.includes(e.id)?'picked':''}`} onClick={()=>setChosen(c=>c.includes(e.id)?c.filter(x=>x!==e.id):[...c,e.id])}><span className="exercise-icon"><span className="symbol-label">{e.part.slice(0,2)}</span></span><span><b>{e.name}</b><small>{e.part} · {e.tool} · {e.method}</small></span><span className="flex-grow"/>{chosen.includes(e.id)?<Check color="var(--accent)"/>:<Plus size={19}/>}</button>:<div key={e.id} className="exercise-choice"><span className="symbol-label">{e.part.slice(0,2)}</span><span><b>{e.name}</b><small>{e.part} · {e.tool}</small></span><span className="flex-grow"/><button className="icon-btn" onClick={()=>update(d=>{const x=d.exercises.find(v=>v.id===e.id);if(x)x.favorite=!x.favorite})}><Star size={19} fill={e.favorite?'#f6d04f':'none'}/></button></div>)}</div>)
 }
 const exercise=(id:string)=>db.exercises.find(x=>x.id===id)||{id,name:'삭제된 운동',part:'기타',tool:'',method:''};
 function renderWorkouts(items:Workout[],target:'day'|'routine'){
  return <div className="stack">{items.map((w,i)=>{const ex=exercise(w.exerciseId);const open=expanded.includes(w.id);return <section key={w.id} className="workout-card"><div className="workout-top"><div className="workout-symbol"><Dumbbell size={25}/></div><div className="workout-name"><b>{ex.name}</b><small>{w.sets.length}세트 · {fmtVol(setVolume(w))}</small></div><button className="icon-btn" title="위로" onClick={()=>moveWorkout(w.id,-1,target)}>↑</button><button className="icon-btn" title="아래로" onClick={()=>moveWorkout(w.id,1,target)}>↓</button><button className="icon-btn" onClick={()=>removeWorkout(w.id,target)}><Trash2 size={17}/></button></div><button className="full reveal" onClick={()=>setExpanded(s=>open?s.filter(v=>v!==w.id):[...s,w.id])}>{i+1}. {open?'접기':'세트 펼치기'} <ChevronDown size={17}/></button>{open&&<div className="sets"><div className="set-head"><span>세트</span><span>{ex.method==='시간'||ex.part==='유산소'?'시간 (분)':'kg'}</span><span>{ex.method==='시간'||ex.part==='유산소'?'—':'횟수'}</span><span>휴식(초)</span><span>완료</span></div>{w.sets.map((s,si)=><div className="set-row" key={s.id}><button className="set-number" onClick={()=>editWorkout(w.id,x=>{x.sets[si].type=s.type==='W'?'N':'W'},target)}>{s.type==='W'?'W':w.sets.slice(0,si+1).filter(row=>row.type!=='W').length}</button><input inputMode="decimal" aria-label={ex.method==='시간'||ex.part==='유산소'?'시간 (분)':'무게'} type="number" value={ex.method==='시간'||ex.part==='유산소'?Number(((s.durationSeconds||0)/60).toFixed(2)):s.weight} onChange={e=>editWorkout(w.id,x=>{if(ex.method==='시간'||ex.part==='유산소')x.sets[si].durationSeconds=Math.round(Number(e.target.value)*60);else x.sets[si].weight=Number(e.target.value)},target)}/><input inputMode="numeric" aria-label="횟수" type="number" disabled={ex.method==='시간'||ex.part==='유산소'} value={ex.method==='시간'||ex.part==='유산소'?0:s.reps} onChange={e=>editWorkout(w.id,x=>{x.sets[si].reps=Number(e.target.value)},target)}/><input inputMode="numeric" aria-label="휴식" type="number" value={s.rest} onChange={e=>editWorkout(w.id,x=>{x.sets[si].rest=Number(e.target.value)},target)}/><button className={s.done?'completed':'uncompleted'} onClick={()=>editWorkout(w.id,x=>{x.sets[si].done=!x.sets[si].done},target)}><Check size={19}/></button><button className="set-remove" title="세트 삭제" onClick={()=>editWorkout(w.id,x=>{x.sets.splice(si,1)},target)}><X size={13}/></button></div>)}<div className="set-actions"><button onClick={()=>editWorkout(w.id,x=>{const last=x.sets.at(-1);x.sets.push(last?{...last,id:newId(),done:false}:makeSet(db.preferences.rest))},target)}><Plus size={15}/> 세트 추가</button><button onClick={()=>editWorkout(w.id,x=>x.sets.forEach(s=>s.done=true),target)}>전체 완료</button></div><textarea placeholder="운동 메모" value={w.note||''} onChange={e=>editWorkout(w.id,x=>{x.note=e.target.value},target)}/></div>}</section>})}</div>
 }
 const monthDays=useMemo(()=>{const first=new Date(month.getFullYear(),month.getMonth(),1);const start=new Date(first);start.setDate(first.getDate()-first.getDay());return Array.from({length:42},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d})},[month]);
 const totals=(key:string)=>{const a=db.days[key]||[];return {vol:a.reduce((n,s)=>n+volume(s),0),sets:a.reduce((n,s)=>n+setsCount(s),0),mins:a.reduce((n,s)=>n+s.duration,0),ex:a.reduce((n,s)=>n+s.workouts.length,0)}};
 const weekStart=useMemo(()=>{const d=new Date(`${date}T12:00:00`);d.setDate(d.getDate()-d.getDay());return d},[date]);
 const weekDates=Array.from({length:7},(_,i)=>{const d=new Date(weekStart);d.setDate(d.getDate()+i);return dateKey(d)});
 const weekSessions=weekDates.flatMap(d=>db.days[d]||[]);
 const topTitle:Record<Page,string>={calendar:'',day:labelDate(date),detail:labelDate(date),choose:'운동 추가',custom:'커스텀 운동 만들기',routines:'템플릿 선택',routineEdit:'템플릿 생성',dashboard:'대시보드',weekly:'주간 분석',body:'신체 변화',bodyEdit:'신체 기록',settings:'설정',exerciseList:'운동 목록'};
 const backTarget:Partial<Record<Page,Page>>={detail:'day',day:'calendar',choose:choiceTarget==='routine'?'routineEdit':'day',custom:'choose',routines:'calendar',routineEdit:'routines',dashboard:'calendar',weekly:'calendar',bodyEdit:'body',settings:'calendar',exerciseList:'calendar'};
 function stepDate(amount:number){const d=new Date(`${date}T12:00:00`);d.setDate(d.getDate()+amount);setDate(dateKey(d))}
 function shiftMonth(amount:number){setMonth(m=>new Date(m.getFullYear(),m.getMonth()+amount,1))}
 function exportJson(){const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=`bodycalendar-backup-${today()}.json`;a.click();URL.revokeObjectURL(u)}
 async function importJson(e:ChangeEvent<HTMLInputElement>){const file=e.target.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());if(!data||!data.days||!data.exercises||!data.preferences)throw Error('잘못된 백업 파일');if(confirm('현재 기록을 백업 파일로 덮어쓰시겠습니까?'))setDb({...copy(defaults),...data})}catch(err){alert(err instanceof Error?err.message:'읽기 실패')}e.target.value=''}
 function startRoutine(){update(d=>{const id=newId();d.routines.push({id,name:'새 템플릿',color:db.preferences.accent,workouts:[]});setRoutineId(id)});goto('routineEdit')}
 function applyRoutine(r:Routine){update(d=>{const s=ensureSession(d);s.workouts.push(...copy(r.workouts).map(w=>({...w,id:newId(),sets:w.sets.map(s=>({...s,id:newId(),done:false}))}))) });goto('day')}
 if(access!=='allowed'||!user||dataOwner!==user.uid){
  return <div className="auth-gate"><div className="auth-card"><div className="auth-brand"><Dumbbell size={32}/> <h1>Workout Grove</h1></div>
   {access==='checking'||access==='pending'?<p>로그인 및 사용 권한을 확인하고 있습니다.</p>:access==='denied'?<><h2>접근이 허용되지 않은 계정입니다.</h2><p>관리자가 허용 목록에 등록한 이메일 계정만 이용할 수 있습니다.</p><p className="muted">{user?.email}</p></>:access==='error'?<><h2>연결 또는 권한 확인 오류</h2><p>Firebase 설정 및 Firestore 규칙을 확인하십시오.</p></>:<p>허용된 Google 계정으로 로그인해야 운동 기록을 사용할 수 있습니다.</p>}
   {(access==='signed-out'||access==='error')&&<button className="primary full" disabled={loginBusy} onClick={handleLogin}>{loginBusy?'로그인 중…':'Google로 로그인'}</button>}
   {user&&<button className="outline-btn full" onClick={()=>{handleLogout().catch(e=>setLoginError(String(e)))}}>다른 계정으로 로그인 / 로그아웃</button>}
   {loginError&&<p className="error">{loginError}</p>}
  </div></div>;
 }
 return <div className="app"><div className="phone-frame"><header className="header"><button className="icon-btn" onClick={()=>page==='calendar'?setDrawer(true):goto(backTarget[page]||'calendar')}>{page==='calendar'?<Menu/>:<ArrowLeft/>}</button>{page==='calendar'?<><button className="month-title" onClick={()=>{setDate(today());setMonth(new Date())}}>{month.getFullYear()}년 {month.getMonth()+1}월 <ChevronDown size={15}/></button><div className="flex-grow"/><button className="icon-btn" onClick={()=>goto('weekly')}><BarChart3/></button><button className="icon-btn" onClick={()=>goto('exerciseList')}><Search/></button></>:<><strong className="header-title">{topTitle[page]}</strong><div className="flex-grow"/>{page==='day'&&<button className="icon-btn" onClick={()=>beginChoose('day')}><Plus/></button>}</>}</header>
 {page==='calendar'&&<div className="screen calendar-screen"><div className="month-nav"><button onClick={()=>shiftMonth(-1)}><ChevronLeft/></button><div className="weekday-grid">{["일","월","화","수","목","금","토"].map(w=><span key={w}>{w}</span>)}</div><button onClick={()=>shiftMonth(1)}><ChevronRight/></button></div><div className="calendar-grid">{monthDays.map((d,i)=>{const k=dateKey(d),t=totals(k),other=d.getMonth()!==month.getMonth();return <button key={i} className={`day-cell ${other?'other':''} ${k===date?'selected':''} ${k===today()?'today':''} ${dragOrigin===k?'drag-source':''} ${dragTarget===k&&dragOrigin?'drag-target':''}`} onPointerDown={e=>{if(e.pointerType==='mouse'&&e.button!==0)return;beginDrag(k);e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(!dragActive.current)return;const el=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-day]');setDragTarget(el?.getAttribute('data-day')||null)}} onPointerUp={e=>{const el=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-day]');endDrag(el?.getAttribute('data-day')||k)}} onPointerCancel={stopDrag} data-day={k} onContextMenu={e=>e.preventDefault()} onClick={()=>{if(!suppressClick.current)openDay(k)}}><span className="day-number">{d.getDate()}</span>{t.sets>0&&<><span className="day-min">{t.mins}분</span><span className="day-set">{t.sets}세트</span><span className="day-volume">{fmtVol(t.vol)}</span></>}</button>})}</div><div className="date-summary"><div className="summary-heading"><b>{labelDate(date)}</b><button onClick={()=>goto('routines')} className="outline-btn">루틴</button></div><div className="summary-stats"><div><small>운동 시간</small><b>{totals(date).mins}분</b></div><div><small>운동 종목</small><b>{totals(date).ex}종</b></div><div><small>세트</small><b>{totals(date).sets}세트</b></div><div><small>볼륨</small><b>{fmtVol(totals(date).vol)}</b></div></div><button className="primary full" onClick={()=>openDay(date)}><Plus size={18}/> 운동 기록</button></div></div>}
 {page==='day'&&<div className="screen"><div className="date-controls"><button onClick={()=>stepDate(-1)}><ChevronLeft/></button><button onClick={()=>setDate(today())}>오늘</button><button onClick={()=>goto('routines')}>루틴</button><button onClick={()=>stepDate(1)}><ChevronRight/></button></div><div className="toolbar"><button onClick={exportJson}><Download size={15}/> 내보내기</button><button onClick={()=>{if(confirm('선택한 날짜의 모든 운동 기록을 삭제하시겠습니까?'))update(d=>{delete d.days[date]})}}><Trash2 size={15}/> 삭제</button></div><section className="session-summary"><div className="flex-between"><input className="session-name" aria-label="운동 제목" value={current?.title??'자유 운동'} onChange={e=>update(d=>{ensureSession(d).title=e.target.value})}/><MoreHorizontal size={20}/></div><div className="summary-stats"><div><small>운동 시간(분)</small><input type="number" inputMode="numeric" value={current?.duration??0} onChange={e=>update(d=>{ensureSession(d).duration=Number(e.target.value)})}/></div><div><small>종목</small><b>{current?.workouts.length||0}</b></div><div><small>세트</small><b>{current?setsCount(current):0}</b></div><div><small>볼륨</small><b>{fmtVol(current?volume(current):0)}</b></div></div></section>{current?.workouts.length?<div className="stack">{current.workouts.map((w,i)=>{const ex=exercise(w.exerciseId);const isTime=ex.method==='시간'||(ex.method==='횟수 / 시간'&&w.cardioMode!=='횟수');const isReps=ex.method==='횟수 / 시간'&&w.cardioMode==='횟수';return <div key={w.id} className="workout-card day-workout-row"><button type="button" className="day-workout-item day-workout-open" onClick={()=>openDetail(i)}><span className="workout-symbol"><span className="symbol-label">운동</span></span><span className="workout-name"><b>{i+1}. {ex.name}</b><small>{w.sets.length}세트 · {isTime?`${Math.round(w.sets.reduce((n,x)=>n+(x.durationSeconds||0),0)/60)}분`:isReps?`${w.sets.reduce((n,s)=>n+s.reps,0)}회`:fmtVol(setVolume(w))}</small></span><ChevronRight size={22}/></button><div className="day-workout-actions"><button type="button" title="운동 위로 이동" aria-label={`${ex.name} 위로 이동`} disabled={i===0} onClick={()=>moveWorkout(w.id,-1,'day')}>↑ 위로</button><button type="button" title="운동 아래로 이동" aria-label={`${ex.name} 아래로 이동`} disabled={i===current.workouts.length-1} onClick={()=>moveWorkout(w.id,1,'day')}>↓ 아래로</button><button type="button" className="delete-workout" aria-label={`${ex.name} 삭제`} onClick={()=>removeWorkout(w.id,'day')}><Trash2 size={15}/> 삭제</button></div></div>})}</div>:<div className="empty"><Dumbbell/><p>기록된 운동이 없습니다.</p><small>운동을 추가하여 기록을 시작하십시오.</small></div>}<div className="slot-tabs">{[0,1,2].map(i=><button key={i} onClick={()=>setSlot(i)} className={slot===i?'active':''}>{i+1}회차</button>)}</div><button className="floating" onClick={()=>beginChoose('day')}><Plus/></button></div>}
 {page==='detail'&&current&&current.workouts[detailIndex]&&(()=>{const w=current.workouts[detailIndex];const ex=exercise(w.exerciseId);const isDual=ex.method==='횟수 / 시간';const isTime=isDual?w.cardioMode!=='횟수':ex.method==='시간'||ex.part==='유산소';return <div className="screen detail-screen" onTouchStart={e=>{touchStart.current=e.touches[0].clientX}} onTouchEnd={e=>{if(touchStart.current===null)return;const dx=e.changedTouches[0].clientX-touchStart.current;touchStart.current=null;if(Math.abs(dx)>65)moveDetail(dx<0?1:-1)}}><section className="panel"><h2 className="detail-name">{ex.name}</h2>{ex.method==='횟수 / 시간'&&<div className="mode-picker"><button className={isTime?'chosen':''} onClick={()=>editWorkout(w.id,item=>{item.cardioMode='시간'})}>시간</button><button className={!isTime?'chosen':''} onClick={()=>editWorkout(w.id,item=>{item.cardioMode='횟수'})}>횟수</button></div>}<p>{ex.part} · {isTime?'시간 기록':ex.method}</p><div className="detail-summary">{w.sets.length}세트 · {isTime?`${Math.round(w.sets.reduce((n,x)=>n+(x.durationSeconds||0),0)/60)}분`:isDual?`${w.sets.reduce((n,s)=>n+s.reps,0)}회`:fmtVol(setVolume(w))}</div></section><section className="panel detail-set-list">{w.sets.map((s,si)=>{const open=expandedSet===s.id;return <div key={s.id} className={`original-set ${open?'is-expanded':''} ${s.done?'is-done':''}`}><div className="original-set-line"><button className={s.done?'original-done done':'original-done'} aria-label={`${s.type==='W'?'워밍업':`${w.sets.slice(0,si+1).filter(row=>row.type!=='W').length}세트`} 완료 전환`} onClick={()=>completeSet(w.id,si)}><Check size={17}/></button><button className="original-number" onClick={()=>setExpandedSet(open?null:s.id)}>{s.type==='W'?'W':w.sets.slice(0,si+1).filter(row=>row.type!=='W').length} <ChevronDown size={12}/></button><span className="original-value">{isTime?`${Math.round((s.durationSeconds||0)/60)}분`:isDual?`${s.reps}회`:`${s.weight}kg`}</span>{!isTime&&!isDual&&<span className="original-value">{s.reps}회</span>}<span className="original-rest">휴식 {String(Math.floor(s.rest/60)).padStart(2,'0')}:{String(s.rest%60).padStart(2,'0')}</span><button className="original-delete" aria-label="세트 삭제" onClick={()=>editWorkout(w.id,x=>{x.sets.splice(si,1)})}><Trash2 size={17}/></button><button className="original-expand" aria-label={open?'접기':'펼치기'} aria-expanded={open} onClick={()=>setExpandedSet(open?null:s.id)}><ChevronDown size={23}/></button></div>{open&&<div className="original-edit"><div className="set-type-toggle"><span>세트 구분</span><button type="button" className={s.type==='W'?'chosen':''} onClick={()=>editWorkout(w.id,item=>{item.sets[si].type='W'})}>W · 워밍업</button><button type="button" className={s.type==='N'?'chosen':''} onClick={()=>editWorkout(w.id,item=>{item.sets[si].type='N'})}>일반 세트</button></div>{isTime?<div className="original-field"><label>운동 시간 (분)</label><input type="number" min="0" inputMode="decimal" value={Number(((s.durationSeconds||0)/60).toFixed(2))} onChange={e=>editWorkout(w.id,x=>{x.sets[si].durationSeconds=Math.max(0,Math.round(Number(e.target.value)*60))})}/><div className="original-buttons"><button onClick={()=>editWorkout(w.id,x=>{x.sets[si].durationSeconds=Math.max(0,(x.sets[si].durationSeconds||0)-30)})}>−0.5</button><button onClick={()=>editWorkout(w.id,x=>{x.sets[si].durationSeconds=(x.sets[si].durationSeconds||0)+30})}>+0.5</button></div></div>:<>{!isDual&&<div className="original-field"><label>무게</label><input type="number" inputMode="decimal" value={s.weight} onChange={e=>editWorkout(w.id,x=>{x.sets[si].weight=Math.max(0,Number(e.target.value))})}/><div className="original-buttons"><button onClick={()=>editWorkout(w.id,x=>{x.sets[si].weight=Math.max(0,Math.round((s.weight-weightIncrement(ex.id))*100)/100)})}>−{weightIncrement(ex.id)}</button><button onClick={()=>editWorkout(w.id,x=>{x.sets[si].weight=Math.round((s.weight+weightIncrement(ex.id))*100)/100})}>+{weightIncrement(ex.id)}</button></div></div>}<div className="original-field"><label>횟수</label><input type="number" min="0" inputMode="numeric" value={s.reps} onChange={e=>editWorkout(w.id,x=>{x.sets[si].reps=Math.max(0,Number(e.target.value))})}/><div className="original-buttons"><button onClick={()=>editWorkout(w.id,x=>{x.sets[si].reps=Math.max(0,x.sets[si].reps-1)})}>−1</button><button onClick={()=>editWorkout(w.id,x=>{x.sets[si].reps+=1})}>+1</button></div></div></>}<div className="original-field"><label>휴식</label><input type="text" inputMode="numeric" aria-label="휴식 분 초" value={`${String(Math.floor(s.rest/60)).padStart(2,'0')}:${String(s.rest%60).padStart(2,'0')}`} onChange={e=>{const v=e.target.value;const m=v.match(/^(\d{1,3}):(\d{1,2})$/);if(m)editWorkout(w.id,x=>{x.sets[si].rest=Math.max(0,Number(m[1])*60+Math.min(59,Number(m[2])))})}}/><div className="original-buttons"><button onClick={()=>editWorkout(w.id,x=>{x.sets[si].rest=Math.max(0,x.sets[si].rest-30)})}>−30</button><button onClick={()=>editWorkout(w.id,x=>{x.sets[si].rest+=30})}>+30</button></div></div></div>}</div>})}<div className="set-actions"><button onClick={()=>editWorkout(w.id,x=>{const prev=x.sets.at(-1);x.sets.push(prev?{...prev,id:newId(),done:false}:makeSet(db.preferences.rest))})}><Plus size={15}/> 세트 추가</button><button onClick={()=>editWorkout(w.id,x=>{x.sets.forEach(v=>v.done=true)})}>전체 완료</button></div><label className="detail-memo">메모<textarea placeholder="운동 메모" value={w.note||''} onChange={e=>editWorkout(w.id,x=>{x.note=e.target.value})}/></label></section></div>})()}
 {page==='choose'&&<div className="screen"><div className="search-bar"><Search size={18}/><input placeholder="운동 검색" value={query} onChange={e=>setQuery(e.target.value)}/><button onClick={()=>goto('custom')}><Plus/></button></div><div className="chips">{parts.map(p=><button key={p} className={filter===p?'on':''} onClick={()=>setFilter(p)}>{p}</button>)}</div><div className="section-title">운동 목록 <small>{db.exercises.filter(e=>(filter==='전체'||e.part===filter)&&e.name.toLowerCase().includes(query.toLowerCase())).length}종</small></div><div className="catalog-tool-filters">{["전체",...equipment].map(t=><button key={t} className={toolFilter===t?"on":""} onClick={()=>setToolFilter(t)}>{t}</button>)}</div><div className="exercise-results">{groupedChoices(visibleExercises(db.exercises),"choose")}</div><div className="choose-footer"><div className="selected-chips">{chosen.map((id,i)=><button key={id} onClick={()=>setChosen(c=>c.filter(x=>x!==id))}>{i+1}. {exercise(id).name} ×</button>)}</div><button disabled={!chosen.length} className="primary full" onClick={addChosen}>선택한 운동 추가 ({chosen.length})</button></div></div>}
 {page==='custom'&&<div className="screen form-screen"><p className="muted">운동 이미지는 사용하지 않습니다. 이름과 분류를 입력해주세요.</p><label>운동 이름 (최대 60자)<input maxLength={60} value={newExercise.name} placeholder="운동 이름을 입력하십시오" onChange={e=>setNewExercise(v=>({...v,name:e.target.value}))}/></label><div className="two-col"><label>운동 부위<select value={newExercise.part} onChange={e=>setNewExercise(v=>({...v,part:e.target.value}))}>{parts.slice(1).map(p=><option key={p}>{p}</option>)}</select></label><label>운동 도구<select value={newExercise.tool} onChange={e=>setNewExercise(v=>({...v,tool:e.target.value}))}>{equipment.map(p=><option key={p}>{p}</option>)}</select></label></div><label>운동 방식<select value={newExercise.method} onChange={e=>setNewExercise(v=>({...v,method:e.target.value}))}>{methods.map(p=><option key={p}>{p}</option>)}</select></label><button className="primary full" disabled={!newExercise.name.trim()} onClick={()=>{const id=newId();update(d=>d.exercises.push({id,...newExercise,custom:true}));setChosen(s=>[...s,id]);setNewExercise({name:'',part:'하체',tool:'기타',method:methods[0]});goto('choose')}}>운동 추가하기</button></div>}
 {page==='routines'&&<div className="screen"><button className="list-action" onClick={startRoutine}><Plus/> 새 템플릿</button>{db.routines.length===0?<div className="empty"><CalendarDays/><p>템플릿이 없습니다.</p></div>:db.routines.map(r=><div className="routine-list" key={r.id}><span className="color-dot" style={{background:r.color}}/><span><b>{r.name}</b><small>{r.workouts.length}종목</small></span><span className="flex-grow"/><button onClick={()=>applyRoutine(r)}>불러오기</button><button onClick={()=>{setRoutineId(r.id);goto('routineEdit')}}><Settings size={18}/></button></div>)}</div>}
 {page==='routineEdit'&&activeRoutine&&<div className="screen"><div className="form-screen"><div className="two-col template-top"><label>템플릿 이름<input value={activeRoutine.name} onChange={e=>update(d=>{const r=d.routines.find(x=>x.id===routineId);if(r)r.name=e.target.value})}/></label><label>템플릿 색상<input aria-label="템플릿 색상" type="color" value={activeRoutine.color} onChange={e=>update(d=>{const r=d.routines.find(x=>x.id===routineId);if(r)r.color=e.target.value})}/></label></div><div className="color-palette">{colors.map(c=><button title={c} key={c} style={{background:c}} onClick={()=>update(d=>{const r=d.routines.find(x=>x.id===routineId);if(r)r.color=c})}>{activeRoutine.color===c&&<Check size={16}/>}</button>)}</div></div>{activeRoutine.workouts.length?renderWorkouts(activeRoutine.workouts,'routine'):<div className="empty"><p>추가된 운동이 없습니다.</p></div>}<div className="action-row"><button onClick={()=>beginChoose('routine')}><Plus size={15}/> 운동추가</button><button onClick={()=>{if(confirm('템플릿을 삭제하시겠습니까?')){update(d=>{d.routines=d.routines.filter(x=>x.id!==routineId)});goto('routines')}}}><Trash2 size={15}/> 삭제</button><button className="primary" onClick={()=>goto('routines')}>완료</button></div></div>}
 {page==='exerciseList'&&<div className="screen"><div className="search-bar"><Search size={18}/><input placeholder="운동 검색" value={query} onChange={e=>setQuery(e.target.value)}/><button onClick={()=>goto('custom')}><Plus/></button></div><div className="catalog-tool-filters">{["전체",...equipment].map(t=><button key={t} className={toolFilter===t?"on":""} onClick={()=>setToolFilter(t)}>{t}</button>)}</div><div className="exercise-results">{groupedChoices(visibleExercises(db.exercises),"list")}</div></div>}
 {page==='dashboard'&&<div className="screen"><h3 className="subheading">즐겨찾기한 기록</h3>{!db.dashboard.length?<div className="empty"><BarChart3/><p>즐겨찾기한 기록이 없습니다.</p><small>아래에서 운동을 선택하여 통계를 추가하세요.</small></div>:db.dashboard.map(id=>{const ex=exercise(id);const entries=Object.entries(db.days).flatMap(([day,ss])=>ss.flatMap(s=>s.workouts.filter(w=>w.exerciseId===id).map(w=>({day,v:setVolume(w)})))).sort((a,b)=>a.day.localeCompare(b.day));return <section className="panel" key={id}><div className="flex-between"><b>{ex.name}</b><button onClick={()=>update(d=>{d.dashboard=d.dashboard.filter(x=>x!==id)})}><Star fill="#e6c34b" size={18}/></button></div><p>운동 볼륨 추이</p><MiniChart values={entries.map(x=>x.v)}/><small>{entries.length?`${entries.at(-1)?.day} · ${fmtVol(entries.at(-1)?.v||0)}`:'아직 기록이 없습니다.'}</small></section>})}<div className="section-title">대시보드에 운동 추가</div>{db.exercises.map(e=><button className="exercise-choice full" key={e.id} onClick={()=>update(d=>{d.dashboard=d.dashboard.includes(e.id)?d.dashboard.filter(x=>x!==e.id):[...d.dashboard,e.id]})}><Dumbbell size={17}/><span>{e.name}</span><span className="flex-grow"/><Star size={18} fill={db.dashboard.includes(e.id)?'#e6c34b':'none'}/></button>)}</div>}
 {page==='weekly'&&<div className="screen"><div className="date-controls"><button onClick={()=>stepDate(-7)}><ChevronLeft/></button><b>{weekDates[0].slice(5).replace('-','/')} ~ {weekDates[6].slice(5).replace('-','/')}</b><button onClick={()=>stepDate(7)}><ChevronRight/></button></div><div className="week-dots">{weekDates.map((d,i)=><button key={d} onClick={()=>openDay(d)}><span>{'일월화수목금토'[i]}</span><span className={totals(d).sets>0?'worked':''}>{new Date(`${d}T12:00:00`).getDate()}</span></button>)}</div><div className="stat-grid">{[{label:'운동 일수',value:`${weekDates.filter(d=>totals(d).sets>0).length}일`},{label:'운동 시간',value:`${weekSessions.reduce((n,s)=>n+s.duration,0)}분`},{label:'평균 시간',value:`${Math.round(weekSessions.reduce((n,s)=>n+s.duration,0)/Math.max(1,weekDates.filter(d=>totals(d).sets>0).length))}분`},{label:'종목',value:`${weekSessions.reduce((n,s)=>n+s.workouts.length,0)}종`},{label:'세트',value:`${weekSessions.reduce((n,s)=>n+setsCount(s),0)}세트`},{label:'볼륨',value:fmtVol(weekSessions.reduce((n,s)=>n+volume(s),0))}].map(x=><div key={x.label}><small>{x.label}</small><b>{x.value}</b></div>)}</div><section className="panel"><h3>부위별 밸런스</h3><div className="part-bars">{parts.slice(1).map(part=>{const n=weekSessions.flatMap(s=>s.workouts).filter(w=>exercise(w.exerciseId).part===part).reduce((a,w)=>a+w.sets.length,0);return n>0?<div key={part}><span>{part}</span><div className="bar-track"><div style={{width:`${Math.min(100,n*10)}%`}}/></div><b>{n}세트</b></div>:null})}{weekSessions.length===0&&<p className="muted">이번 주 운동 기록이 없습니다.</p>}</div></section></div>}
 {page==='body'&&<div className="screen"><div className="section-title">체중 및 체성분</div>{db.body.length?db.body.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(b=><button className="body-card" key={b.date} onClick={()=>{setDate(b.date);setBodyForm({weight:String(b.weight??''),muscle:String(b.muscle??''),fat:String(b.fat??''),memo:b.memo||''});goto('bodyEdit')}}><small>{b.date}</small><b>{b.weight??'—'} kg</b><span>골격근량 {b.muscle??'—'} kg · 체지방 {b.fat??'—'} %</span><ChevronRight size={18}/></button>):<div className="empty"><UserRound/><p>신체 변화 기록이 없습니다.</p></div>}{db.body.length>1&&<section className="panel"><h3>체중 추이</h3><MiniChart values={db.body.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(x=>x.weight||0)}/></section>}<button className="floating" onClick={()=>{const found=db.body.find(x=>x.date===date);setBodyForm({weight:String(found?.weight??''),muscle:String(found?.muscle??''),fat:String(found?.fat??''),memo:found?.memo||''});goto('bodyEdit')}}><Plus/></button></div>}
 {page==='bodyEdit'&&<div className="screen form-screen"><label>측정 날짜<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>체중 (kg)<input type="number" step="0.1" inputMode="decimal" placeholder="예: 80.5" value={bodyForm.weight} onChange={e=>setBodyForm(v=>({...v,weight:e.target.value}))}/></label><div className="stepper"><button onClick={()=>setBodyForm(v=>({...v,weight:String((Number(v.weight||0)-1).toFixed(1))}))}>−1.0</button><button onClick={()=>setBodyForm(v=>({...v,weight:String((Number(v.weight||0)-0.1).toFixed(1))}))}>−0.1</button><button onClick={()=>setBodyForm(v=>({...v,weight:String((Number(v.weight||0)+0.1).toFixed(1))}))}>+0.1</button><button onClick={()=>setBodyForm(v=>({...v,weight:String((Number(v.weight||0)+1).toFixed(1))}))}>+1.0</button></div><label>골격근량 (kg)<input type="number" inputMode="decimal" value={bodyForm.muscle} onChange={e=>setBodyForm(v=>({...v,muscle:e.target.value}))}/></label><label>체지방률 (%)<input type="number" inputMode="decimal" value={bodyForm.fat} onChange={e=>setBodyForm(v=>({...v,fat:e.target.value}))}/></label><label>측정 메모<input maxLength={30} value={bodyForm.memo} onChange={e=>setBodyForm(v=>({...v,memo:e.target.value}))}/></label><button className="primary full" onClick={()=>{update(d=>{d.body=d.body.filter(x=>x.date!==date);d.body.push({date,weight:bodyForm.weight?Number(bodyForm.weight):undefined,muscle:bodyForm.muscle?Number(bodyForm.muscle):undefined,fat:bodyForm.fat?Number(bodyForm.fat):undefined,memo:bodyForm.memo})});goto('body')}}>저장</button></div>}
 {page==='settings'&&<div className="screen form-screen settings-screen"><h3>화면 설정</h3><label>테마<select value={db.preferences.theme} onChange={e=>update(d=>{d.preferences.theme=e.target.value as Database['preferences']['theme']})}><option value="dark">다크</option><option value="light">라이트</option><option value="system">시스템</option></select></label><label>강조 색상</label><div className="color-palette">{colors.slice(0,9).map(c=><button key={c} style={{background:c}} onClick={()=>update(d=>{d.preferences.accent=c})}>{db.preferences.accent===c&&<Check size={16}/>}</button>)}</div><label>화면 크기 {db.preferences.scale}%<input type="range" min="85" max="115" value={db.preferences.scale} onChange={e=>update(d=>{d.preferences.scale=Number(e.target.value)})}/></label><h3>단위 설정</h3><label>무게<select value={db.preferences.weightUnit} onChange={e=>update(d=>{d.preferences.weightUnit=e.target.value as 'kg'|'lb'})}><option value="kg">kg</option><option value="lb">lb (표시 설정 준비 중)</option></select></label><h3>운동 설정</h3><label>기본 휴식 시간 (초)<input type="number" value={db.preferences.rest} onChange={e=>update(d=>{d.preferences.rest=Number(e.target.value)})}/></label><h3>중량 증감 설정</h3><label>기본 중량 증감 단위 (kg)<select value={db.preferences.weightStep||2.5} onChange={e=>update(d=>{d.preferences.weightStep=Number(e.target.value)})}>{[0.5,1,1.25,2,2.5,5,10].map(v=><option key={v} value={v}>{v}kg</option>)}</select></label><label>종목별 증감 단위</label><div className="weight-override-list">{db.exercises.filter(e=>e.part!=='유산소'&&e.method.includes('무게')).map(e=><div key={e.id} className="weight-override-row"><span>{e.name}</span><select aria-label={`${e.name} 증감 단위`} value={db.preferences.exerciseWeightSteps?.[e.id]||''} onChange={ev=>setWeightIncrement(e.id,ev.target.value)}><option value="">기본값</option>{[0.5,1,1.25,2,2.5,5,10].map(v=><option key={v} value={v}>{v}kg</option>)}</select></div>)}</div><h3>백업 및 동기화</h3><div className="settings-actions"><button onClick={exportJson}><Download size={16}/> JSON 백업</button><button onClick={()=>fileRef.current?.click()}><Upload size={16}/> JSON 복원</button><input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importJson}/></div><div className="panel"><b>계정별 Firebase 저장</b><p className="muted">로그인: {user.email}</p><p className="muted">각 계정은 자신의 UID 경로에만 저장됩니다.</p><p className="muted">상태: {sync} · 전송 대기 {pendingCount}건 {saving?'· 저장 중':''}</p><button className="outline-btn" onClick={()=>handleLogout().catch(e=>setLoginError(String(e)))}>로그아웃</button><div className="settings-actions"><button onClick={uploadCurrent}>Firestore 수동 덮어쓰기</button><button onClick={downloadCurrent}>Firestore에서 다시 불러오기</button></div>{legacyAvailable&&<><p className="muted">구버전(공용 로컬 저장소)의 기록이 발견되었습니다. 자동으로 다른 계정에 이전하지 않습니다.</p><button className="outline-btn" onClick={importLegacy}>구버전 로컬 기록을 현재 계정으로 가져오기</button></>}{loginError&&<p className="error">{loginError}</p>}</div><small className="muted">Workout Grove Web ver 0.4.2 · 개인용 재구현</small></div>}
 {page==='detail'&&<div className="detail-bottom"><div className="inline-rest"><span>휴식 타이머</span><strong>{restEnd===null?'00:00':`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`}</strong><button onClick={()=>setRestEnd(null)} disabled={restEnd===null}>종료</button></div><div className="detail-nav"><button disabled={detailIndex===0} onClick={()=>moveDetail(-1)}>← 이전 운동</button><span>{detailIndex+1} / {current?.workouts.length||0}</span><button disabled={detailIndex===(current?.workouts.length||1)-1} onClick={()=>moveDetail(1)}>다음 운동 →</button></div></div>}
 {page==='day'&&restEnd!==null&&<div className="rest-timer"><span>휴식 타이머 <b>{String(Math.floor(remaining/60)).padStart(2,'0')}:{String(remaining%60).padStart(2,'0')}</b></span><button onClick={()=>setRestEnd(null)}>종료 <X size={15}/></button></div>}

 <nav className="bottom-nav"><button className={['calendar','day','detail','choose','custom','exerciseList','routines','routineEdit'].includes(page)?'active':''} onClick={()=>goto('calendar')}><Dumbbell/><span>운동</span></button><button className={['body','bodyEdit'].includes(page)?'active':''} onClick={()=>goto('body')}><UserRound/><span>신체</span></button><button className={page==='weekly'?'active':''} onClick={()=>goto('weekly')}><BarChart3/><span>분석</span></button><button className={page==='settings'?'active':''} onClick={()=>goto('settings')}><SlidersHorizontal/><span>설정</span></button></nav>
 {drawer&&<><button className="scrim" onClick={()=>setDrawer(false)} aria-label="메뉴 닫기"/><aside className="drawer"><div className="drawer-header"><div className="brand-mark"><Dumbbell/></div><div><b>Workout Grove</b><small>개인 운동 기록</small></div><button onClick={()=>setDrawer(false)}><X/></button></div>{([{p:'exerciseList',icon:<Dumbbell/>,name:'운동 목록'},{p:'dashboard',icon:<BarChart3/>,name:'대시보드'},{p:'weekly',icon:<CalendarDays/>,name:'주간 분석'},{p:'routines',icon:<Star/>,name:'루틴 템플릿'},{p:'body',icon:<Heart/>,name:'신체 변화'},{p:'settings',icon:<Settings/>,name:'설정'}] as {p:Page;icon:ReactNode;name:string}[]).map(x=><button key={x.p} onClick={()=>goto(x.p)}>{x.icon}{x.name}<ChevronRight size={17}/></button>)}<div className="drawer-footer">Workout Grove Web<br/>ver 0.3.0</div></aside></>}
 </div></div>
}
function MiniChart({values}:{values:number[]}){if(values.length===0)return <p className="muted">기록 없음</p>;const max=Math.max(...values),min=Math.min(...values),range=Math.max(1,max-min);const points=values.map((v,i)=>`${20+(i*(280/Math.max(1,values.length-1)))},${105-((v-min)/range)*80}`).join(' ');return <svg role="img" aria-label="기록 추이 그래프" viewBox="0 0 320 130" className="mini-chart"><line x1="10" y1="110" x2="310" y2="110" stroke="currentColor" opacity=".2"/><polyline points={points} stroke="var(--accent)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"/>{values.map((v,i)=><circle key={i} cx={20+(i*(280/Math.max(1,values.length-1)))} cy={105-((v-min)/range)*80} r="3.5" fill="var(--accent)"/>)}</svg>}
export default App;

