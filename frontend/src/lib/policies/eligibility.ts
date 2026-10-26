import { civilDay, civilMillis, clockMillis, endOn } from "../civilTime";
import { authorizedHolidayShift } from "../holidays";
import { canCover } from "../coverageAllocation";
import type { CompanyRules, Employee, ShiftAssignment } from "../../types/schedule";
export function outsideHours(company:CompanyRules,a:ShiftAssignment):boolean {
  let cursor=civilMillis(a.start);const finish=civilMillis(a.end);
  for(let day=civilDay(cursor)-86400000;day<=civilDay(finish);day+=86400000) {
    if(!company.operatingDays.includes(new Date(day).getUTCDay()))continue;
    const from=day+clockMillis(company.opensAt),to=endOn(day,company.opensAt,company.closesAt);
    if(from<=cursor&&to>cursor)cursor=to;
  }
  return cursor<finish;
}

export const hasOperatingException=(company:CompanyRules,e:Employee,a:ShiftAssignment)=>authorizedHolidayShift(company,a)||company.coverage.some(r=>r.allowsOutsideHours&&canCover(e,r)&&r.day===new Date(civilMillis(a.start)).getUTCDay()&&civilDay(civilMillis(a.start))+clockMillis(r.start)<=civilMillis(a.start)&&civilMillis(a.end)<=endOn(civilDay(civilMillis(a.start)),r.start,r.end));
export const isWorkingDay=(company:CompanyRules,e:Employee,weekday:number,exception:boolean)=>!((!e.inheritsCompanyDefaults&&e.workingDays&&!e.workingDays.includes(weekday))||(!company.operatingDays.includes(weekday)&&!exception));
export const isNight=(start:number,end:number)=>new Date(start).getUTCHours()<6||end>civilDay(start)+22*3600000;
export const matchesFixedStart=(e:Employee,start:number)=>!e.shiftStartsAt||start===civilDay(start)+clockMillis(e.shiftStartsAt);
