import { civilDateTime } from "./dateTime";
// Arithmetic axis for company wall-clock values, independent of the device's DST or offset.
export const civilMillis=(value:string)=>Date.parse(civilDateTime(value)+"Z");
export const civilString=(value:number)=>new Date(value).toISOString().replace(/\.\d{3}Z$/,"");
export const civilDay=(value:number)=>Math.floor(value/86400000)*86400000;
export const civilWeek=(value:number)=>civilDay(value)-new Date(value).getUTCDay()*86400000;
export const clockMillis=(value:string)=>value.split(":").reduce((n,v,i)=>n+Number(v)*[3600000,60000,1000][i],0);
export const endOn=(day:number,start:string,end:string)=>day+clockMillis(end)+(clockMillis(end)<=clockMillis(start)?86400000:0);
