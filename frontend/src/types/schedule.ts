export type RegimeType = "dayBased" | "hourBased";

export type WorkloadRule = {
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

export type Employee = {
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

export type EscalaLivreDocument = {
  planningPeriod: { start: string; end: string };
  roles?: { id: string; name: string }[];
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
  weeklyHours: number;
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

export type ScheduleResult = {
  assignments: ShiftAssignment[];
  conflicts: ScheduleIssue[];
  coverage: CoverageBlock[];
  gaps: CoverageGap[];
  hiringSuggestions: HiringSuggestion[];
  optimizationSuggestions: OptimizationSuggestion[];
  decisions: SolverDecision[];
  coverageScore: number;
};
