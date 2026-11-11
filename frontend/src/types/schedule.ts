// Product contract: adding an internal test strategy does not expand this list.
export const regimeTypes = ["dayBased", "hourBased"] as const;
export type RegimeType = typeof regimeTypes[number];

export type WeeklyWorkPlan = {
  flexibleWorkDays?: number;
  contractedSeconds: number;
  dailySeconds: number[];
  compensation?: { instrument: string; startsOn: string; endsOn: string };
};

export type WorkloadRule = {
  weeklyPlan?: WeeklyWorkPlan;
  regimeType: RegimeType;
  workUnits: number;
  restUnits: number;
  weeklyLimitHours: number;
  defaultShiftDuration: string;
};

export type AvailabilityWindow = {
  start: string;
  end: string;
};

export type RoleTenure = { startsOn:string; role:string; roleId:string; coverageRoleIds?:string[] };
export type AbsenceEvent={id:string;category:"vacation"|"medical"|"leave"|"unavailable";start:string;end:string;credits:{date:string;excusedSeconds:number}[]};
export type Employee = {
  absences?: AbsenceEvent[];
  accumulationRoleIds?: string[];
  roleHistory?: RoleTenure[];
  inactiveFrom?: string;
  contractLeaves?: { date:string; excusedSeconds:number }[];
  coverageRoleIds?: string[];
  coverageRoles?: string[];
  fixedInterval?: { start:string; end:string };
  shiftStartsAt?: string;
  worksDuringLunchClosure?: boolean;
  id: string;
  name: string;
  roleId?: string;
  role: string;
  inheritsCompanyDefaults: boolean;
  workload: WorkloadRule;
  availability: AvailabilityWindow[];
  restrictions: AvailabilityWindow[];
  preferences: { code: string; weight: number; description: string }[];
  allowsOvertime: boolean;
  allowsNightWork: boolean;
  preferredDaysOff: number[];
  workingDays?: number[];
};

export type CompanyRules = {
  coverageMode?: "exclusive";
  /** IANA zone used only to interpret qualified legacy datetimes; schedules use civil time. */
  timeZone?: string;
  holidays?: { date:string; name:string; closed:boolean }[];
  middayClosure?: { start: string; end: string };
  name: string;
  opensAt: string;
  closesAt: string;
  operatingDays: number[];
  defaultWorkload: WorkloadRule;
  lunch: {
    minimum: string;
    maximum: string;
    preferredAfter: string;
  };
  minimumRest: string;
  coverage: CoverageRequirement[];
};

export type CoverageRequirement = {
  scope?: "role" | "team";
  daysMode?: "operating" | "custom";
  allowsOutsideHours?: boolean;
  roleId?: string;
  role: string;
  day: number;
  start: string;
  end: string;
  minimumEmployees: number;
};

export type ShiftAssignment = {
  pinned?: boolean;
  id: string;
  employeeId: string;
  roleId?: string;
  role: string;
  start: string;
  end: string;
  break?: { start: string; end: string };
  source: "manual" | "solver";
  tags: string[];
};

export type DocumentRole = { id:string; name:string; coverageRoleIds?:string[] };

export type EscalaLivreDocument = {
  publications?: import("../lib/publicationSchema").Publication[];
  publicationSelections?: import("../lib/publicationSchema").PublicationSelection[];
  planningPeriod: { start: string; end: string };
  roles?: DocumentRole[];
  setup?: { companyConfigured: boolean };
  schemaVersion: string;
  id: string;
  company: CompanyRules;
  employees: Employee[];
  assignments: ShiftAssignment[];
  updatedAt: string;
};

export type CoverageGap = {
  start: string;
  end: string;
  roleId?: string;
  role: string;
  missingEmployees: number;
};

export type CoverageBlock = {
  employeeIds?: string[];
  start: string;
  end: string;
  roleId?: string;
  role: string;
  required: number;
  assigned: number;
  state: "healthy" | "warning" | "uncovered";
};

export type ScheduleIssue = {
  employeeId?: string;
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  start?: string;
  end?: string;
  role?: string;
};

export type HiringSuggestion = {
  roleId?: string;
  role: string;
  totalHours: number;
  weeklyHours: number;
  referenceWeeklyHours: number;
  minimumPeople: number;
  peakMissingEmployees: number;
  weeklyDemand: {weekStart:string;hours:number}[];
  idealWindows: AvailabilityWindow[];
  rationale: string;
};

export type OptimizationSuggestion = {
  code: string;
  message: string;
  impact: string;
  employeeId?: string;
  start?: string;
  end?: string;
};

export type SolverDecision = {
  assignmentId: string;
  employeeId: string;
  reason: string;
  factors: string[];
};

export type OptimizationInfo={status:"not-run"|"feasible"|"optimal"|"infeasible"|"timeout"|"invalid"};

export type DailyWorkload = { date:string; nominalSeconds:number; excusedSeconds:number; expectedSeconds:number; plannedSeconds:number; recognizedSeconds:number; unmetSeconds:number; excessSeconds:number };
export type WorkloadSummary = { employeeId:string; weekStart:string; contractedSeconds:number; nominalSeconds:number; excusedSeconds:number; expectedSeconds:number; plannedSeconds:number; recognizedSeconds:number; unmetSeconds:number; excessSeconds:number; historicalWorkSeconds:number; days:DailyWorkload[]; unassignedSeconds?:number };
export type ScheduleResult = {
  workloads?: WorkloadSummary[];
  optimization?: OptimizationInfo;
  assignments: ShiftAssignment[];
  conflicts: ScheduleIssue[];
  coverage: CoverageBlock[];
  gaps: CoverageGap[];
  hiringSuggestions: HiringSuggestion[];
  optimizationSuggestions: OptimizationSuggestion[];
  decisions: SolverDecision[];
  coverageScore: number;
};
