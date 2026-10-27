using EscalaLivre.Domain.Planning;

namespace EscalaLivre.Domain.Scheduling;

public static class ScheduleRules
{
    public static DateTime EndOn(DateTime day,TimeOnly start,TimeOnly end)=>day.Date+end.ToTimeSpan()+(end<=start?TimeSpan.FromDays(1):TimeSpan.Zero);
    // Explicit IDs, including an empty list, override stale legacy transport names.
    public static bool CanCover(Employee e,CoverageRequirement r)
        => r.Scope=="team" || e.Role==r.Role || (e.CoverageRoleIds is { } ids
            ? r.RoleId is { } id && ids.Contains(id)
            : e.CoverageRoles?.Contains(r.Role) ?? false);
    public static IEnumerable<ScheduleIssue> ShiftDiagnostics(CompanyRules company,Employee e,ShiftAssignment a)
    {
        ScheduleIssue Issue(string code,string message,string severity="error")=>new(severity,code,message,a.Start,a.End,a.Role,e.Id);
        var rule=EffectiveWorkPolicy.RuleFor(company,e);var work=EffectiveWorkPolicy.Measure(a);
        if(a.End<=a.Start||a.Role!=e.Role)yield return Issue("invalidShift","Turno inválido ou função divergente.");
        if(!AvailabilityPolicy.Allows(e,a.Start,a.End))yield return Issue("availability","Turno fora da disponibilidade ou em horário bloqueado.");
        bool exception=ShiftEligibilityPolicy.HasOperatingException(company,e,a);
        if(!ShiftEligibilityPolicy.IsWorkingDay(company,e,a.Start,exception))yield return Issue("workingDay","Turno fora dos dias de trabalho.");
        if(ShiftEligibilityPolicy.OutsideHours(company,a))yield return Issue("outsideHours",exception?"Fora do expediente com autorização específica.":"Fora do expediente sem autorização específica.",exception?"info":"error");
        if(LaborRules.ClosedHoliday(company,a.Start)&&!LaborRules.AuthorizedHolidayShift(company,a))yield return Issue("holiday","Turno em feriado configurado como fechado.");
        if(!e.AllowsNightWork&&ShiftEligibilityPolicy.IsNight(a.Start,a.End))yield return Issue("nightWork","Trabalho noturno não permitido.");
        if(!ShiftEligibilityPolicy.MatchesFixedStart(e,a.Start))yield return Issue("fixedStart","Entrada diferente do horário fixo configurado.");
        if(work>rule.DefaultShiftDuration)yield return Issue("workload","Trabalho efetivo excede a jornada configurada.");
        if(EffectiveWorkPolicy.ExceedsRegimeWork(work,rule))yield return Issue("regime","Trabalho efetivo excede o regime em horas.");
        bool invalidPause=!IntervalPolicy.Valid(a);
        if(invalidPause)yield return Issue("interval","Intervalo obrigatório ausente, insuficiente ou fora da jornada.");
        var fixedPause=IntervalPolicy.FixedBreak(e,a.Start);
        if(fixedPause is not null&&(a.Break is null||a.Break.Start!=fixedPause.Start||a.Break.End!=fixedPause.End))yield return Issue("fixedInterval","Intervalo diferente do horário fixo configurado.");
        var closures=IntervalPolicy.Closures(company,a.Start,a.End).ToList();var pause=a.Break is null?TimeSpan.Zero:a.Break.End-a.Break.Start;
        if(fixedPause is null)
        {
            var (minimum,maximum)=IntervalPolicy.VariableLimits(company,e,work,closures);
            if((pause<minimum||pause>maximum)&&!invalidPause)yield return Issue("interval","Intervalo fora dos limites da empresa, da jornada ou do fechamento.");
        }
        foreach(var c in closures)
        {
            if(IntervalPolicy.ConflictsWithClosure(a.Break,c,e.WorksDuringLunchClosure))
                yield return Issue("middayClosure",e.WorksDuringLunchClosure?"A pausa impede o trabalho durante o fechamento para almoço.":"Falta intervalo cobrindo o fechamento para almoço.");
        }
    }
    public static IEnumerable<ScheduleIssue> Diagnose(EscalaLivreDocument document,IReadOnlyList<ShiftAssignment> assignments)
    {
        foreach(var a in assignments)
        {
            var e=document.Employees.FirstOrDefault(e=>e.Id==a.EmployeeId);
            if(e is null){yield return new("error","unknownEmployee","Turno referencia pessoa inexistente.",a.Start,a.End,a.Role,a.EmployeeId);continue;}
            foreach(var issue in ShiftDiagnostics(document.Company,e,a))yield return issue;
        }
        foreach(var e in document.Employees)
        {
            var rule=EffectiveWorkPolicy.RuleFor(document.Company,e);var shifts=assignments.Where(a=>a.EmployeeId==e.Id).OrderBy(a=>a.Start).ThenBy(a=>a.Id.ToString()).ToList();
            var cycle=RegimeConfiguration.From(rule).RollingCycle;
            ScheduleIssue Issue(string code,string message,DateTime start,DateTime end)=>new("error",code,message,start,end,e.Role,e.Id);
            var latestEnd=DateTime.MinValue;
            foreach(var a in shifts)
            {
                if(RestPolicy.ViolatesPrevious(a.Start,latestEnd,RestPolicy.Required(document.Company,e)))yield return Issue("minimumRest","Descanso mínimo entre turnos violado.",a.Start,a.End);
                if(a.End>latestEnd)latestEnd=a.End;
                if(cycle is not null)
                {
                    if(DayCyclePolicy.ExceedsEndingOn(shifts,a.Start.Date,cycle))
                        yield return Issue("regime","Dias de trabalho excedem o ciclo configurado.",a.Start,a.End);
                }
            }
            foreach(var day in shifts.GroupBy(a=>a.Start.Date))
            {
                if(day.Count()>1)yield return Issue("multipleShifts","Mais de um turno para a mesma pessoa e data de início.",day.Key,day.Key.AddDays(1));
                if(day.Sum(a=>EffectiveWorkPolicy.Measure(a).Ticks)>EffectiveWorkPolicy.DailyLimit(e).Ticks)yield return Issue("dailyLimit","Limite diário de trabalho efetivo excedido.",day.Key,day.Key.AddDays(1));
            }
            foreach(var week in shifts.SelectMany(ScheduleWindow.Weeks).Distinct().Order())
                if(shifts.Sum(a=>EffectiveWorkPolicy.WorkTicksInWeek(a,week))>rule.WeeklyLimitHours*TimeSpan.TicksPerHour)
                    yield return Issue("weeklyLimit","Limite semanal excedido.",week,week.AddDays(7));
        }
    }
}
