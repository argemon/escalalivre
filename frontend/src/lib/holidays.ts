import { datePart } from "./dateTime";
import type { CompanyRules, ShiftAssignment } from "../types/schedule";
export const nationalHolidays: Record<string,string> = {
 "01-01":"Confraternização Universal", "04-21":"Tiradentes", "05-01":"Dia do Trabalho", "09-07":"Independência do Brasil", "10-12":"Nossa Senhora Aparecida", "11-02":"Finados", "11-15":"Proclamação da República", "11-20":"Consciência Negra", "12-25":"Natal"
};
export function holidayOn(company: CompanyRules, date: string) {
 const custom = company.holidays?.find(h => h.date === date);
 if (custom) return {...custom,national:Boolean(nationalHolidays[date.slice(5)])};
 const name = nationalHolidays[date.slice(5)];
 return name ? {date,name,closed:true,national:true} : undefined;
}
export const closedHoliday = (company:CompanyRules,date:string) => holidayOn(company,date)?.closed === true;

export const authorizedHolidayShift = (company:CompanyRules, assignment:ShiftAssignment) => assignment.source === "manual" && Boolean(holidayOn(company,datePart(assignment.start,company.timeZone))) && assignment.tags.includes("holiday:"+datePart(assignment.start,company.timeZone));
