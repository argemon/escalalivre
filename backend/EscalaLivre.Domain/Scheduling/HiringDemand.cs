namespace EscalaLivre.Domain.Scheduling;

public static class HiringDemand
{
    private static double Hours(long ticks)=>Math.Round((double)ticks/TimeSpan.TicksPerHour,2,MidpointRounding.AwayFromZero);
    public static IReadOnlyList<HiringSuggestion> Suggest(IReadOnlyList<CoverageGap> gaps,double referenceWeeklyHours)
        => gaps.GroupBy(g=>g.Role).Select(group=>
        {
            long total=0;
            var weeks=new SortedDictionary<DateTime,long>();
            var events=new SortedDictionary<DateTime,int>();
            foreach(var gap in group)
            {
                total+=(gap.End-gap.Start).Ticks*gap.MissingEmployees;
                events[gap.Start]=events.GetValueOrDefault(gap.Start)+gap.MissingEmployees;
                events[gap.End]=events.GetValueOrDefault(gap.End)-gap.MissingEmployees;
                for(var week=ScheduleWindow.WeekStart(gap.Start);week<gap.End;week=week.AddDays(7))
                {
                    var start=gap.Start>week?gap.Start:week;
                    var end=gap.End<week.AddDays(7)?gap.End:week.AddDays(7);
                    weeks[week]=weeks.GetValueOrDefault(week)+(end-start).Ticks*gap.MissingEmployees;
                }
            }
            int active=0,peakMissing=0;
            foreach(var delta in events.Values){active+=delta;peakMissing=Math.Max(peakMissing,active);}
            long peakWeek=weeks.Values.DefaultIfEmpty(0).Max();
            int people=Math.Max(peakMissing,(int)Math.Ceiling(peakWeek/(referenceWeeklyHours*TimeSpan.TicksPerHour)));
            return new HiringSuggestion(group.Key,Hours(total),Hours(peakWeek),referenceWeeklyHours,people,peakMissing,
                weeks.Select(w=>new WeeklyHiringDemand(DateOnly.FromDateTime(w.Key),Hours(w.Value))).ToList(),
                group.Select(g=>new AvailabilityWindow(g.Start,g.End)).ToList(),
                "Estimativa mínima por carga semanal e faltas simultâneas. Disponibilidade, descansos e distribuição dos horários podem exigir mais pessoas.");
        }).ToList();
}
