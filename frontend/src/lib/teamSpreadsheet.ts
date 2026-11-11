import { importLimits, parseTeamCsv } from "./teamOperations";
// Bounded ZIP/XML reader for the three text columns. No formulas or external links execute.
async function unzipXlsx(buffer:ArrayBuffer):Promise<Map<string,string>> {
 const view=new DataView(buffer),bytes=new Uint8Array(buffer);let end=-1;
 for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(view.getUint32(p,true)===0x06054b50){end=p;break;}
 if(end<0)throw Error("XLSX inválido.");
 const count=view.getUint16(end+10,true),offset=view.getUint32(end+16,true);if(count>500 || view.getUint16(end+4,true)!==0)throw Error("XLSX fora dos limites.");
 const files=new Map<string,string>();let p=offset,total=0;
 for(let i=0;i<count;i++){
  if(view.getUint32(p,true)!==0x02014b50)throw Error("Diretório ZIP inválido.");
  const flags=view.getUint16(p+8,true),method=view.getUint16(p+10,true),size=view.getUint32(p+20,true),expanded=view.getUint32(p+24,true),n=view.getUint16(p+28,true),extra=view.getUint16(p+30,true),comment=view.getUint16(p+32,true),local=view.getUint32(p+42,true);
  const name=new TextDecoder().decode(bytes.slice(p+46,p+46+n));p+=46+n+extra+comment;total+=expanded;
  if(total>8*1024*1024 || flags&1 || expanded>4*1024*1024 || files.has(name))throw Error("XLSX criptografado ou acima dos limites.");
  if(!name.endsWith('.xml')&&!name.endsWith('.rels'))continue;
  if(view.getUint32(local,true)!==0x04034b50)throw Error("Entrada ZIP inválida.");
  const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);if(start+size>bytes.length)throw Error("ZIP truncado.");
  const packed=bytes.slice(start,start+size);let content:Uint8Array;
  if(method===0)content=packed;else if(method===8){
   const reader=new Blob([packed]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();const parts:Uint8Array[]=[];let length=0;
   for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>expanded || length>4*1024*1024){await reader.cancel();throw Error("Expansão XLSX acima do limite.");}parts.push(value);}
   content=new Uint8Array(length);let at=0;for(const part of parts){content.set(part,at);at+=part.length;}
  }else throw Error("Compactação XLSX não suportada.");
  if(content.length!==expanded)throw Error("Tamanho XLSX inválido.");files.set(name,new TextDecoder().decode(content));
 }
 return files;
}
function xml(text:string|undefined):Document{
 if(!text || /<!DOCTYPE|<!ENTITY/i.test(text))throw Error("XML ausente ou não permitido.");
 const doc=new DOMParser().parseFromString(text,"application/xml");if(doc.querySelector("parsererror"))throw Error("XML inválido.");return doc;
}
export async function readTeamFile(file:File):Promise<string[][]>{
 if(file.size>importLimits.bytes)throw Error("Arquivo acima de 2 MiB.");
 if(file.name.toLowerCase().endsWith('.csv'))return parseTeamCsv(await file.text());
 if(!file.name.toLowerCase().endsWith('.xlsx'))throw Error("Escolha .csv ou .xlsx.");
 const files=await unzipXlsx(await file.arrayBuffer());
 const workbook=xml(files.get('xl/workbook.xml')),sheets=workbook.getElementsByTagNameNS('*','sheet');if(sheets.length!==1)throw Error("Use uma única planilha.");
 const relation=sheets[0].getAttribute('r:id');const rels=Array.from(xml(files.get('xl/_rels/workbook.xml.rels')).getElementsByTagNameNS('*','Relationship'));
 const rel=rels.find(r=>r.getAttribute('Id')===relation);if(!rel || rel.getAttribute('TargetMode')==='External')throw Error("Planilha externa não permitida.");
 const target=rel.getAttribute('Target')??'';const sheetPath=target.startsWith('/')?target.slice(1):'xl/'+target;
 if(sheetPath.includes('..'))throw Error("Caminho de planilha inválido.");
 const strings=files.has('xl/sharedStrings.xml')?Array.from(xml(files.get('xl/sharedStrings.xml')).getElementsByTagNameNS('*','si')).map(si=>Array.from(si.getElementsByTagNameNS('*','t')).map(t=>t.textContent??'').join('')):[];
 const sheet=xml(files.get(sheetPath));const rows=Array.from(sheet.getElementsByTagNameNS('*','row'));if(rows.length>201)throw Error("Limite de 200 linhas de pessoas.");
 return rows.map(row=>{const values=["","",""];for(const c of Array.from(row.getElementsByTagNameNS('*','c'))){
  const ref=c.getAttribute('r')??'',column=/^([A-Z]+)[0-9]+$/.exec(ref)?.[1];if(!column || !['A','B','C'].includes(column))throw Error("Use somente colunas A a C.");
  if(c.getElementsByTagNameNS('*','f').length)throw Error("Remova fórmulas antes de importar.");
  const raw=c.getElementsByTagNameNS('*','v')[0]?.textContent??'';const type=c.getAttribute('t');
  if(type==='e')throw Error("Planilha contém erro de célula.");
  values[column.charCodeAt(0)-65]=type==='s'?strings[Number(raw)]??'':type==='inlineStr'?Array.from(c.getElementsByTagNameNS('*','t')).map(t=>t.textContent??'').join(''):raw;
 }return values;}).filter(row=>row.some(v=>v.trim()));
}
