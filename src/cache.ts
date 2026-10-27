import type {Database} from './model';
export type CacheState={data:Database;lastSync:number;versions:Record<string,number>;configVersion:number;pending:string[];syncReady:boolean};
const STORE='users';const DB='workout-grove-idb-v1';
function openDB():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function readCache(uid:string):Promise<CacheState|null>{try{const db=await openDB();return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly');const r=tx.objectStore(STORE).get(uid);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();});}catch{return null;}}
export async function writeCache(uid:string,value:CacheState):Promise<void>{const db=await openDB();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(value,uid);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();}

