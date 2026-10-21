namespace EscalaLivre.Domain.Scheduling;

public static class ScheduleRules
{
    public static WorkloadRule Workload(CompanyRules company,Employee e)=>e.InheritsCompanyDefaults?company.DefaultWorkload:e.Workload;
    public static TimeSpan Work(ShiftAssignment a)=>a.End-a.Start-(a.Break is null?TimeSpan.Zero:a.Break.End-a.Break.Start);
    public static TimeSpan Rest(CompanyRules company,Employee e)=>TimeSpan.FromTicks(Math.Max(company.MinimumRest.Ticks,Workload(company,e).RegimeType=="hourBased"?TimeSpan.FromHours(Workload(company,e).RestUnits).Ticks:0));
    public static DateTime EndOn(DateTime day,TimeOnly start,TimeOnly end)=>day.Date+end.ToTimeSpan()+(end<=start?TimeSpan.FromDays(1):TimeSpan.Zero);
    public static bool CanCover(Employee e,CoverageRequirement r)=>r.Scope=="team"||e.Role==r.Role||(e.CoverageRoles?.Contains(r.Role)??false);
    public static BreakWindow? ClosureOn(CompanyRules company,DateTime day)
    {
        if(company.MiddayClosure is not {} c)return null;
        var date=day.Date.AddDays(c.Start<company.OpensAt?1:0);
        return new(date+c.Start.ToTimeSpan(),EndOn(date,c.Start,c.End));
    }
    public static IEnumerable<BreakWindow> Closures(CompanyRules company,DateTime start,DateTime end)
    {
        for(var day=start.Date.AddDays(-1);day<=end.Date;day=day.AddDays(1))
            if(ClosureOn(company,day) is {} c && start<c.End && c.Start<end)yield return c;
    }
    public static BreakWindow? FixedBreak(Employee e,DateTime start)
    {
        if(e.FixedInterval is not {} c)return null;
        var day=start.Date;if(day+c.Start.ToTimeSpan()<=start)day=day.AddDays(1);
        return new(day+c.Start.ToTimeSpan(),EndOn(day,c.Start,c.End));
    }
    public static bool Available(Employee e,DateTime start,DateTime end)
        =>!e.Restrictions.Any(w=>w.Start<end&&start<w.End)&&(e.Availability.Count==0||e.Availability.Any(w=>w.Start<=start&&w.End>=end));
    public static bool OutsideHours(CompanyRules company,ShiftAssignment a)
    {
        var cursor=a.Start;
        for(var day=a.Start.Date.AddDays(-1);day<=a.End.Date;day=day.AddDays(1))
        {
            if(!company.OperatingDays.Contains(day.DayOfWeek))continue;
            var from=day+company.OpensAt.ToTimeSpan();var to=EndOn(day,company.OpensAt,company.ClosesAt);
            if(from<=cursor&&to>cursor)cursor=to;
        }
        return cursor<a.End;
    }
    public static IEnumerable<ScheduleIssue> ShiftDiagnostics(CompanyRules company,Employee e,ShiftAssignment a)
    {
        ScheduleIssue Issue(string code,string message,string severity="error")=>new(severity,code,message,a.Start,a.End,a.Role,e.Id);
        var rule=Workload(company,e);var work=Work(a);
        if(a.End<=a.Start||a.Role!=e.Role)yield return Issue("invalidShift","Turno inválido ou função divergente.");
        if(!Available(e,a.Start,a.End))yield return Issue("availability","Turno fora da disponibilidade ou em horário bloqueado.");
        bool exception=LaborRules.AuthorizedHolidayShift(company,a)||company.Coverage.Any(r=>r.AllowsOutsideHours&&CanCover(e,r)&&r.Day==a.Start.DayOfWeek&&a.Start.Date+r.Start.ToTimeSpan()<=a.Start&&a.End<=EndOn(a.Start.Date,r.Start,r.End));
        if((!e.InheritsCompanyDefaults&&e.WorkingDays is {} working&&!working.Contains(a.Start.DayOfWeek))||(!company.OperatingDays.Contains(a.Start.DayOfWeek)&&!exception))yield return Issue("workingDay","Turno fora dos dias de trabalho.");
        if(OutsideHours(company,a))yield return Issue("outsideHours",exception?"Fora do expediente com autorização específica.":"Fora do expediente sem autorização específica.",exception?"info":"error");
        if(LaborRules.ClosedHoliday(company,a.Start)&&!LaborRules.AuthorizedHolidayShift(company,a))yield return Issue("holiday","Turno em feriado configurado como fechado.");
        if(!e.AllowsNightWork&&(a.Start.Hour<6||a.End>a.Start.Date.AddHours(22)))yield return Issue("nightWork","Trabalho noturno não permitido.");
        if(e.ShiftStartsAt is {} entry&&a.Start!=a.Start.Date+entry.ToTimeSpan())yield return Issue("fixedStart","Entrada diferente do horário fixo configurado.");
        if(work>rule.DefaultShiftDuration)yield return Issue("workload","Trabalho efetivo excede a jornada configurada.");
        if(rule.RegimeType=="hourBased"&&work>TimeSpan.FromHours(rule.WorkUnits))yield return Issue("regime","Trabalho efetivo excede o regime em horas.");
        bool invalidPause=!LaborRules.ValidInterval(a);
        if(invalidPause)yield return Issue("interval","Intervalo obrigatório ausente, insuficiente ou fora da jornada.");
        var fixedPause=FixedBreak(e,a.Start);
        if(fixedPause is not null&&(a.Break is null||a.Break.Start!=fixedPause.Start||a.Break.End!=fixedPause.End))yield return Issue("fixedInterval","Intervalo diferente do horário fixo configurado.");
        var closures=Closures(company,a.Start,a.End).ToList();var pause=a.Break is null?TimeSpan.Zero:a.Break.End-a.Break.Start;
        if(fixedPause is null)
        {
            long minimum=Math.Max(LaborRules.RequiredInterval(work).Ticks,company.Lunch.Minimum.Ticks);
            if(!e.WorksDuringLunchClosure&&closures.Count>0)minimum=Math.Max(minimum,closures.Max(c=>(c.End-c.Start).Ticks));
            long maximum=Math.Min(TimeSpan.FromHours(2).Ticks,Math.Max(minimum,company.Lunch.Maximum.Ticks));
            if((pause.Ticks<minimum||pause.Ticks>maximum)&&!invalidPause)yield return Issue("interval","Intervalo fora dos limites da empresa, da jornada ou do fechamento.");
        }
        foreach(var c in closures)
        {
            bool overlaps=a.Break is not null&&a.Break.Start<c.End&&c.Start<a.Break.End;
            if(e.WorksDuringLunchClosure?overlaps:(a.Break is null||a.Break.Start>c.Start||a.Break.End<c.End))
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
            var rule=Workload(document.Company,e);var shifts=assignments.Where(a=>a.EmployeeId==e.Id).OrderBy(a=>a.Start).ThenBy(a=>a.Id.ToString()).ToList();
            ScheduleIssue Issue(string code,string message,DateTime start,DateTime end)=>new("error",code,message,start,end,e.Role,e.Id);
            var latestEnd=DateTime.MinValue;
            foreach(var a in shifts)
            {
                if(latestEnd!=DateTime.MinValue&&a.Start-latestEnd<Rest(document.Company,e))yield return Issue("minimumRest","Descanso mínimo entre turnos violado.",a.Start,a.End);
                if(a.End>latestEnd)latestEnd=a.End;
                if(rule.RegimeType=="dayBased")
                {
                    var from=a.Start.Date.AddDays(1-Math.Max(1,rule.WorkUnits+rule.RestUnits));
                    if(shifts.Where(s=>s.Start.Date>=from&&s.Start.Date<=a.Start.Date).Select(s=>s.Start.Date).Distinct().Count()>rule.WorkUnits)
                        yield return Issue("regime","Dias de trabalho excedem o ciclo configurado.",a.Start,a.End);
                }
            }
            foreach(var day in shifts.GroupBy(a=>a.Start.Date))
            {
                if(day.Count()>1)yield return Issue("multipleShifts","Mais de um turno para a mesma pessoa e data de início.",day.Key,day.Key.AddDays(1));
                if(day.Sum(a=>Work(a).Ticks)>TimeSpan.FromHours(e.AllowsOvertime?10:8).Ticks)yield return Issue("dailyLimit","Limite diário de trabalho efetivo excedido.",day.Key,day.Key.AddDays(1));
            }
            foreach(var week in shifts.SelectMany(ScheduleWindow.Weeks).Distinct().Order())
                if(shifts.Sum(a=>ScheduleWindow.WorkTicksInWeek(a,week))>rule.WeeklyLimitHours*TimeSpan.TicksPerHour)
                    yield return Issue("weeklyLimit","Limite semanal excedido.",week,week.AddDays(7));
        }
    }
}
