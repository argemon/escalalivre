import type { PersistStorage, StorageValue } from "zustand/middleware";
import type { EscalaLivreDocument } from "../types/schedule";
import { parseNativeText, serializeNative, validateNativeDocument } from "./nativeDocument";
import { nowInstant } from "./dateTime";

export const STATE_KEY = "escalalivre-state";
export const RECOVERY_KEY = "escalalivre-recovery";
export type SavedSchedule = { document:EscalaLivreDocument; theme:"light"|"dark"; viewMode:string };
export type RecoveryCopy = { id:string; createdAt:string; reason:string; contents:string; native:boolean; durable:boolean; downloaded:boolean; restorable:boolean; original?:boolean };
type Phase = "ready"|"saved"|"read-error"|"invalid"|"write-error"|"backup-error";
export type RecoveryStatus = { phase:Phase; message:string; copies:RecoveryCopy[]; protected:boolean };
type BrowserStorage = Pick<Storage,"getItem"|"setItem"|"removeItem">;
const modes = new Set(["timeline","week","month","heatmap","coverage","solver"]);

// Browser recovery shares the native schema, but is limited by storage quota rather than file size.
export function parseRecoveryDocument(contents:string):EscalaLivreDocument {
  return validateNativeDocument(JSON.parse(contents));
}
function serializeRecoveryDocument(document:EscalaLivreDocument):string {
  // Preserve raw data as a download even when it cannot be restored as a valid document.
  try {return serializeNative(document);}catch {return JSON.stringify(document);}
}

export function createRecoveryStorage(provider:()=>BrowserStorage = ()=>window.localStorage) {
  let status:RecoveryStatus={phase:"ready",message:"",copies:[],protected:false};
  let pending:StorageValue<SavedSchedule>|undefined;
  let newlyReadable:string|undefined;
  const listeners=new Set<()=>void>();
  const publish=(patch:Partial<RecoveryStatus>)=>{status={...status,...patch};for(const listener of listeners)listener();};
  const classify=(contents:string,parse=parseNativeText)=>{try {parse(contents);return true;}catch{return false;}};
  function addCopy(contents:string,reason:string,original=false):RecoveryCopy {
    const previous=status.copies.find(c=>c.contents===contents);
    if(previous)return previous;
    const copy={id:crypto.randomUUID(),createdAt:nowInstant(),reason,contents,native:classify(contents),restorable:classify(contents,parseRecoveryDocument),durable:false,downloaded:false,original};
    const originals=[copy,...status.copies].filter(c=>c.original);
    const snapshots=[copy,...status.copies].filter(c=>!c.original).slice(0,3);
    publish({copies:[...originals,...snapshots]});return copy;
  }
  function parseState(raw:string):StorageValue<SavedSchedule> {
    const value:unknown=JSON.parse(raw);
    if (!value || typeof value!=="object" || !("state" in value)) throw new Error("Estado inválido.");
    const saved=value as {state?:Partial<SavedSchedule>;version?:number};
    if (saved.version!==undefined && (!Number.isInteger(saved.version)||saved.version<0||saved.version>2)) throw new Error("Versão de armazenamento não suportada.");
    const document=validateNativeDocument(saved.state?.document);
    return {version:saved.version??0,state:{document,theme:saved.state?.theme==="dark"?"dark":"light",viewMode:modes.has(saved.state?.viewMode??"")?saved.state!.viewMode!:"timeline"}};
  }
  function readCopies():void {
    for(const copy of status.copies)copy.durable=false;
    let raw:string|null=null;
    try {
      raw=provider().getItem(RECOVERY_KEY);if(!raw)return;
      const archive=JSON.parse(raw);
      if (archive?.version!==1||!Array.isArray(archive.copies)) throw new Error("Cópias inválidas.");
      for(const item of [...archive.copies].reverse()) {
        if(typeof item?.contents!=="string"||typeof item?.reason!=="string")throw new Error("Cópia inválida.");
        const copy=addCopy(item.contents,item.reason,item.original===true);
        copy.durable=true;
        if(typeof item.createdAt==="string" && Number.isFinite(Date.parse(item.createdAt)))copy.createdAt=item.createdAt;
      }
      publish({copies:[...status.copies]});
    } catch {
      if(raw)addCopy(raw,"Conteúdo do arquivo de recuperação",true);
      // A failure in the backup key must not stop recovery of the primary document.
    }
  }
  function saveCopies():boolean {
    try {
      const text=JSON.stringify({version:1,copies:status.copies.map(c=>({contents:c.contents,createdAt:c.createdAt,reason:c.reason,original:c.original}))});
      const storage=provider();storage.setItem(RECOVERY_KEY,text);
      if(storage.getItem(RECOVERY_KEY)!==text)throw new Error("A cópia não pôde ser verificada.");
      for(const copy of status.copies)copy.durable=true;
      publish({copies:[...status.copies]});return true;
    } catch {
      for(const copy of status.copies)copy.durable=false;
      return false;
    }
  }
  function checkpoint(document:EscalaLivreDocument,reason:string):boolean {
    const contents=serializeRecoveryDocument(document);
    readCopies();
    const existing=status.copies.find(c=>c.contents===contents&&(c.durable||c.downloaded));
    if(existing){
      if(status.phase==="backup-error")publish({phase:status.protected?"read-error":"ready",message:status.protected?"O conteúdo original do navegador continua protegido.":""});
      return true;
    }
    const copy=addCopy(contents,reason);
    if(saveCopies()) {
      if(status.phase==="backup-error")publish({phase:status.protected?"read-error":"ready",message:status.protected?"Os dados originais do navegador continuam protegidos.":""});
      return true;
    }
    if(copy.downloaded)return true;
    publish({phase:"backup-error",message:"A cópia não pôde ser confirmada no navegador. Baixe a cópia de recuperação e repita a operação; os dados atuais foram mantidos."});
    return false;
  }
  const storage:PersistStorage<SavedSchedule>={
    getItem:()=>{
      let raw:string|null=null;
      try {
        raw=provider().getItem(STATE_KEY);
        if(raw!==null) {
          const value=parseState(raw);
          readCopies();publish({phase:"saved",message:"",protected:false});return value;
        }
        readCopies();
        if(!status.protected)publish({phase:"ready",message:""});
        return null;
      } catch(error) {
        if(raw!==null)addCopy(raw,"Conteúdo original do navegador",true);
        readCopies();
        publish({phase:raw===null?"read-error":"invalid",protected:true,message:raw===null?"Não foi possível ler o armazenamento. Os dados disponíveis podem ser exportados e as cópias podem ser recuperadas.":"O documento do navegador é inválido. O conteúdo original foi preservado para download; use uma cópia válida para recuperar o planejamento."});
        const backup=status.copies.find(c=>c.restorable);
        if(backup) {
          try {publish({message:status.message+" Uma cópia válida foi carregada nesta sessão."});return {version:2,state:{document:parseRecoveryDocument(backup.contents),theme:"light",viewMode:"timeline"}};}catch{/* Keep original contents available. */}
        }
        void error;return null;
      }
    },
    setItem:(_key,value)=>{
      pending=value;
      if(status.protected)return;
      try {
        const text=JSON.stringify(value);
        // Apply the reader's validation before replacing the previous saved bytes.
        parseState(text);
        const target=provider();target.setItem(STATE_KEY,text);
        if(target.getItem(STATE_KEY)!==text)throw new Error("Gravação não confirmada.");
        if(status.phase!=="backup-error")publish({phase:"saved",message:""});
      } catch {if(status.phase!=="backup-error")publish({phase:"write-error",message:"Não foi possível salvar no navegador. O planejamento continua disponível nesta sessão; exporte uma cópia para guardá-lo."});}
    },
    removeItem:()=>{try {provider().removeItem(STATE_KEY);}catch {publish({phase:"write-error",message:"Não foi possível acessar o armazenamento; os dados disponíveis continuam recuperáveis."});}}
  };
  function retrySave(value:StorageValue<SavedSchedule>):boolean {
    // Read and preserve the previous bytes before an explicitly requested overwrite.
    try {
      const raw=provider().getItem(STATE_KEY);
      if(raw && raw!==JSON.stringify(value)) {
        addCopy(raw,"Conteúdo anterior à recuperação",true);
        if(status.protected && newlyReadable!==raw) {
          try {
            const recovered=parseState(raw);
            addCopy(serializeRecoveryDocument(recovered.state.document),"Documento reencontrado no navegador");
            newlyReadable=raw;saveCopies();
            publish({phase:"read-error",message:"A leitura voltou a funcionar e uma cópia do documento anterior está disponível. Restaure essa cópia ou tente salvar novamente para manter o planejamento desta sessão."});
            return false;
          } catch {/* An invalid original is still preserved verbatim. */}
        }
      }
      if(status.copies.length && !saveCopies() && status.copies.some(c=>!c.durable&&!c.downloaded)) {
        publish({phase:"backup-error",message:"Baixe o conteúdo original antes de tentar salvar a recuperação."});return false;
      }
    } catch {publish({phase:"read-error",protected:true,message:"O armazenamento ainda não permite leitura. Exporte os dados disponíveis ou restaure uma cópia nesta sessão."});return false;}
    publish({protected:false,phase:"ready",message:""});storage.setItem(STATE_KEY,value);return status.phase==="saved";
  }
  function prepareRestore():void {
    if(!status.protected)return;
    try {
      const raw=provider().getItem(STATE_KEY);
      if(raw)addCopy(raw,"Conteúdo anterior à recuperação",true);
      if(saveCopies() || status.copies.filter(c=>c.original).every(c=>c.durable||c.downloaded))
        publish({protected:false,phase:"ready",message:""});
    } catch {
      // Restoring in memory remains possible even when the original key cannot be read.
    }
  }
  return {storage,checkpoint,retrySave,prepareRestore,
    getSnapshot:()=>status,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>listeners.delete(listener);},
    markDownloaded:(id:string)=>{const copy=status.copies.find(c=>c.id===id);if(copy){copy.downloaded=true;publish({copies:[...status.copies]});}},
    latest:()=>pending
  };
}
export const recovery = createRecoveryStorage();
