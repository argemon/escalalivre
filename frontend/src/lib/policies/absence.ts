import type { Employee } from "../../types/schedule";
import { civilMillis } from "../civilTime";
export const absenceBlocks=(e:Employee,start:number,end:number)=>Boolean(e.absences?.some(a=>civilMillis(a.start)<end&&start<civilMillis(a.end)));
export function explicitLeaveCredit(e:Employee,date:string):number{
 const start=civilMillis(date+"T00:00:00"),end=start+86400000;
 const windows=(e.absences??[]).map(a=>({start:Math.max(start,civilMillis(a.start)),end:Math.min(end,civilMillis(a.end)),credit:a.credits.find(c=>c.date===date)?.excusedSeconds??0})).filter(w=>w.start<w.end&&w.credit>0).sort((a,b)=>a.start-b.start||a.end-b.end);
 let sum=0,to=-Infinity,maximum=0;for(const w of windows){if(w.start<to){to=Math.max(to,w.end);maximum=Math.max(maximum,w.credit);}else{sum+=maximum;to=w.end;maximum=w.credit;}}sum+=maximum;
 return sum+(e.contractLeaves??[]).filter(l=>l.date===date).reduce((n,l)=>n+l.excusedSeconds,0);
}
