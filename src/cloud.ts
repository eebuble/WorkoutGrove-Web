import {initializeApp,getApps} from 'firebase/app';
import {getAuth,onAuthStateChanged,GoogleAuthProvider,signInWithPopup,signOut,User} from 'firebase/auth';
import {doc,getDoc,getFirestore,runTransaction} from 'firebase/firestore';
import type {Database} from './model';
const config={apiKey:import.meta.env.VITE_FIREBASE_API_KEY,authDomain:import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,projectId:import.meta.env.VITE_FIREBASE_PROJECT_ID,appId:import.meta.env.VITE_FIREBASE_APP_ID};
export const cloudReady=Boolean(config.apiKey&&config.projectId&&config.appId);
const app=cloudReady?(getApps()[0]||initializeApp(config)):null;
const auth=app?getAuth(app):null;
const firestore=app?getFirestore(app):null;
export async function checkAllowed(user:User):Promise<boolean>{
 if(!firestore||!user.email||!user.emailVerified)return false;
 const email=user.email.trim().toLowerCase();
 const snap=await getDoc(doc(firestore,'allowedEmails',email));
 return snap.exists()&&snap.data().enabled===true;
}
export function subscribeAuth(callback:(user:User|null)=>void){return auth?onAuthStateChanged(auth,callback):()=>{};}
export async function login(){
 if(!auth)throw Error('Firebase 환경변수가 비어 있습니다.');
 const provider=new GoogleAuthProvider();
 try{
  await signInWithPopup(auth,provider);
 }catch(e:unknown){
  if(typeof e==='object'&&e!==null&&'code' in e&&e.code==='auth/popup-blocked'){
   throw Error('Google 로그인 팝업이 차단되었습니다. 브라우저에서 팝업을 허용한 뒤 다시 시도해 주세요.');
  }
  throw e;
 }
}
export async function logout(){if(auth)await signOut(auth);}
/** Stored alongside data; not part of the user-owned workout database. */
export type CloudSnapshot={data:Database;revision:number};
export class CloudConflict extends Error {constructor(){super('다른 기기에서 먼저 저장했습니다. 현재 데이터는 유지됩니다. 클라우드 기록을 확인한 후 수동으로 해결해 주세요.');this.name='CloudConflict';}}
export async function fetchCloud(userId:string):Promise<CloudSnapshot|null>{
 if(!firestore)throw Error('Firebase 연결을 확인하십시오.');
 const snap=await getDoc(doc(firestore,'users',userId,'app','main'));
 if(!snap.exists())return null;
 const raw=snap.data();
 const {_syncRevision,_syncUpdatedAt,...data}=raw;
 return {data:data as Database,revision:typeof _syncRevision==='number'?_syncRevision:0};
}
function checkSize(data:Database){
 const size=new TextEncoder().encode(JSON.stringify(data)).length;
 if(size>850_000)throw Error('저장 데이터가 약 850KB를 초과했습니다. 날짜별 문서 분할이 필요합니다.');
}
/** Compare-and-swap: prevents overwriting a different device's more recent version. */
export async function saveCloud(userId:string,data:Database,expectedRevision:number):Promise<number>{
 if(!firestore)throw Error('Firebase를 설정해 주십시오.');
 checkSize(data);
 const ref=doc(firestore,'users',userId,'app','main');
 return runTransaction(firestore,async tx=>{
  const snap=await tx.get(ref);
  const rev=snap.exists()?(typeof snap.data()._syncRevision==='number'?snap.data()._syncRevision:0):-1;
  if(rev!==expectedRevision)throw new CloudConflict();
  const next=rev+1;
  tx.set(ref,{...data,_syncRevision:next,_syncUpdatedAt:new Date().toISOString()});
  return next;
 });
}
/** Explicit user-authorized replacement, never called by automatic synchronization. */
export async function replaceCloud(userId:string,data:Database):Promise<number>{
 if(!firestore)throw Error('Firebase를 설정해 주십시오.');
 checkSize(data);
 const ref=doc(firestore,'users',userId,'app','main');
 return runTransaction(firestore,async tx=>{
  const snap=await tx.get(ref);
  const rev=snap.exists()?(typeof snap.data()._syncRevision==='number'?snap.data()._syncRevision:0):-1;
  tx.set(ref,{...data,_syncRevision:rev+1,_syncUpdatedAt:new Date().toISOString()});
  return rev+1;
 });
}
