import {initializeApp,getApps} from 'firebase/app';
import {getFirestore,doc,getDoc,getDocs,collection,query,where,runTransaction,Timestamp,writeBatch} from 'firebase/firestore';
import type {Database,Session} from './model';
const conf={apiKey:import.meta.env.VITE_FIREBASE_API_KEY,authDomain:import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,projectId:import.meta.env.VITE_FIREBASE_PROJECT_ID,appId:import.meta.env.VITE_FIREBASE_APP_ID};
const app=getApps()[0]||initializeApp(conf);const fs=getFirestore(app);
export class VersionConflict extends Error{constructor(public path:string){super(`다른 기기에서 ${path} 기록을 먼저 변경했습니다. 자동 저장을 중단합니다.`);this.name='VersionConflict'}}
export type RemoteItem={key:string;deleted:boolean;sessions:Session[];version:number;updatedAt:number};
export type CloudConfig={config:Omit<Database,'days'>;version:number;updatedAt:number};
export const configRef=(uid:string)=>doc(fs,'users',uid,'v2','config');
export const dayRef=(uid:string,key:string)=>doc(fs,'users',uid,'days',key);
const toMillis=(value:unknown)=>value instanceof Timestamp?value.toMillis():0;
export async function getConfig(uid:string):Promise<CloudConfig|null>{const s=await getDoc(configRef(uid));if(!s.exists())return null;const d=s.data();return {config:d.config as Omit<Database,'days'>,version:d.version||0,updatedAt:toMillis(d.updatedAt)};}
export async function getChangedDays(uid:string,since=0):Promise<RemoteItem[]>{const c=collection(fs,'users',uid,'days');const q=since?query(c,where('updatedAt','>=',Timestamp.fromMillis(Math.max(0,since-10000)))):c;const snap=await getDocs(q);return snap.docs.map(s=>{const d=s.data();return {key:s.id,deleted:d.deleted===true,sessions:d.sessions||[],version:d.version||0,updatedAt:toMillis(d.updatedAt)};});}
export async function writeDay(uid:string,key:string,sessions:Session[]|null,expectedVersion:number):Promise<number>{return runTransaction(fs,async tx=>{const ref=dayRef(uid,key);const snap=await tx.get(ref);const version=snap.exists()?snap.data().version||0:0;if(version!==expectedVersion)throw new VersionConflict(key);tx.set(ref,{sessions:sessions||[],deleted:sessions===null,version:version+1,updatedAt:Timestamp.now()});return version+1;});}
export async function writeConfig(uid:string,config:Omit<Database,'days'>,expectedVersion:number):Promise<number>{return runTransaction(fs,async tx=>{const ref=configRef(uid);const snap=await tx.get(ref);const version=snap.exists()?snap.data().version||0:0;if(version!==expectedVersion)throw new VersionConflict('설정/템플릿');tx.set(ref,{config,version:version+1,updatedAt:Timestamp.now()});return version+1;});}
/** First migration: create-only. Old app/main remains unchanged for recovery. */
export async function migrate(uid:string,data:Database){if((await getConfig(uid))!==null)return false;const keys=Object.keys(data.days);for(let i=0;i<keys.length;i+=350){const batch=writeBatch(fs);for(const key of keys.slice(i,i+350))batch.set(dayRef(uid,key),{sessions:data.days[key],deleted:false,version:1,updatedAt:Timestamp.now()});await batch.commit();}const {days:_days,...config}=data;void _days;await writeConfig(uid,config,0);return true;}

