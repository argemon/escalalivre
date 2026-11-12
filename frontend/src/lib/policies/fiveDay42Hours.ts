import type { WeeklyWorkPlan } from "../../types/schedule";

export const canSelectFiveDay42HourMode=(plan:WeeklyWorkPlan)=>plan.contractedSeconds===151200 && (plan.flexibleWorkDays===5 || (!plan.flexibleWorkDays && plan.dailySeconds.filter(s=>s>0).length===5));
export const isFiveDay42HourPlan=(plan:WeeklyWorkPlan)=>plan.contractedSeconds===151200 &&
  (plan.flexibleWorkDays===5 || (!plan.flexibleWorkDays && plan.dailySeconds.filter(s=>s>0).length===5 && plan.dailySeconds.filter(s=>s>0).every(s=>s===30240)));
export const selectedNormalDailySeconds=(plan:WeeklyWorkPlan):number|undefined=>
  isFiveDay42HourPlan(plan)&&plan.fiveDay42HourMode ? (plan.fiveDay42HourMode==="eightHours"?28800:30240):undefined;
export function selectFiveDay42HourMode(plan:WeeklyWorkPlan,mode:NonNullable<WeeklyWorkPlan["fiveDay42HourMode"]>):WeeklyWorkPlan {
  if(!canSelectFiveDay42HourMode(plan))return plan;
  return {...plan,fiveDay42HourMode:mode,dailySeconds:plan.flexibleWorkDays?plan.dailySeconds:plan.dailySeconds.map(s=>s>0?30240:0)};
}
