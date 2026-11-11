import type { EscalaLivreDocument } from "../types/schedule";
type Entry={document:EscalaLivreDocument;bytes:number};
export class PlanningHistory {
 readonly maximumEntries=20;readonly maximumBytes=8*1024*1024;
 past:Entry[]=[];future:Entry[]=[];
 clear(){this.past=[];this.future=[];}
 private entry(document:EscalaLivreDocument):Entry{return {document:structuredClone(document),bytes:new TextEncoder().encode(JSON.stringify(document)).length};}
 private trim(){while(this.past.length+this.future.length>this.maximumEntries||[...this.past,...this.future].reduce((n,e)=>n+e.bytes,0)>this.maximumBytes){if(this.past.length)this.past.shift();else this.future.shift();}}
 record(before:EscalaLivreDocument,after:EscalaLivreDocument){if(before.id!==after.id){this.clear();return;}if(JSON.stringify(before)===JSON.stringify(after))return;this.future=[];this.past.push(this.entry(before));this.trim();}
 undo(current:EscalaLivreDocument){const previous=this.past.pop();if(!previous)return;this.future.push(this.entry(current));this.trim();return structuredClone(previous.document);}
 redo(current:EscalaLivreDocument){const next=this.future.pop();if(!next)return;this.past.push(this.entry(current));this.trim();return structuredClone(next.document);}
}
