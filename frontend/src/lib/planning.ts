import type { CoverageRequirement, Employee, EscalaLivreDocument, ShiftAssignment } from "../types/schedule";

export const dayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
export const timelineStartHour = 7;
export const timelineEndHour = 31;
export const timelineHours = Array.from({ length: timelineEndHour - timelineStartHour + 1 }, (_, index) => timelineStartHour + index);

export function formatHour(hour: number) {
  return `${String(hour % 24).padStart(2, "0")}h`;
}

export function timeToHour(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours + (minutes ?? 0) / 60;
}

export function dateToTimelineHour(value: string, baseDay = "2026-05-18") {
  const date = new Date(value);
  const base = new Date(`${baseDay}T00:00:00`);
  const dayOffset = Math.round((startOfDay(date).getTime() - startOfDay(base).getTime()) / 86_400_000);
  return date.getHours() + date.getMinutes() / 60 + dayOffset * 24;
}

export function clampTimeline(value: number) {
  return Math.min(timelineEndHour, Math.max(timelineStartHour, value));
}

export function percentAt(hour: number) {
  return ((clampTimeline(hour) - timelineStartHour) / (timelineEndHour - timelineStartHour)) * 100;
}

export function durationPercent(start: number, end: number) {
  return Math.max(2, percentAt(end) - percentAt(start));
}

export function regimeLabel(employee: Employee) {
  const type = employee.workload.regimeType === "dayBased" ? "DAY_BASED" : "HOUR_BASED";
  return `${type} ${employee.workload.workUnits}x${employee.workload.restUnits}`;
}

export function assignmentForEmployee(document: EscalaLivreDocument, employeeId: string) {
  return document.assignments.filter((assignment) => assignment.employeeId === employeeId);
}

export function coverageForRequirement(document: EscalaLivreDocument, requirement: CoverageRequirement) {
  const requiredStart = timeToHour(requirement.start);
  const requiredEnd = timeToHour(requirement.end);
  const covered = document.assignments.filter((assignment) => {
    const start = dateToTimelineHour(assignment.start);
    const end = dateToTimelineHour(assignment.end);
    return assignment.role === requirement.role && start <= requiredStart && end >= requiredEnd;
  }).length;

  return {
    covered,
    missing: Math.max(0, requirement.minimumEmployees - covered),
    ratio: requirement.minimumEmployees === 0 ? 1 : covered / requirement.minimumEmployees
  };
}

export function assignmentLabel(assignment: ShiftAssignment) {
  const start = new Date(assignment.start);
  const end = new Date(assignment.end);
  return `${String(start.getHours()).padStart(2, "0")}h-${String(end.getHours()).padStart(2, "0")}h`;
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}
