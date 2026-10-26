import { civilMillis } from "../civilTime";
import type { Employee } from "../../types/schedule";

// Whole-shift containment in one window; a restriction during a pause also blocks it.
export const isAvailable=(e:Employee,start:number,end:number)=>!e.restrictions.some(w=>civilMillis(w.start)<end&&start<civilMillis(w.end))&&(e.availability.length===0||e.availability.some(w=>civilMillis(w.start)<=start&&civilMillis(w.end)>=end));
