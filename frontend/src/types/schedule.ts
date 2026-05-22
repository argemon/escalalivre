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
  id: string;
  name: string;
  role: string;
  inheritsCompanyDefaults: boolean;
  workload: WorkloadRule;
  availability: AvailabilityWindow[];
  restrictions: AvailabilityWindow[];
  preferences: { code: string; weight: number; description: string }[];
  allowsOvertime: boolean;
  allowsNightWork: boolean;
  preferredDaysOff: number[];
};

export type CompanyRules = {
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
  role: string;
  day: number;
  start: string;
  end: string;
  minimumEmployees: number;
};

export type ShiftAssignment = {
  id: string;
  employeeId: string;
  role: string;
  start: string;
  end: string;
  break?: { start: string; end: string };
  source: "manual" | "solver";
  tags: string[];
};

export type EscalaLivreDocument = {
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
  role: string;
  missingEmployees: number;
};

export type CoverageBlock = {
  start: string;
  end: string;
  role: string;
  required: number;
  assigned: number;
  state: "healthy" | "warning" | "uncovered";
};

export type ScheduleIssue = {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  start?: string;
  end?: string;
  role?: string;
};

export type HiringSuggestion = {
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
