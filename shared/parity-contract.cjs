// Compare multisets, retaining duplicate diagnostics. Translated prose is deliberately excluded.
const ordered=rows=>Array.from(rows,row=>JSON.stringify(row)).sort();
function digest(result) {
  if(!Number.isFinite(result.coverageScore))throw new Error('Non-finite coverage score');
  return {
    conflicts:ordered(result.conflicts.map(c=>({code:c.code,severity:c.severity,employeeId:c.employeeId??null,start:c.start??null,end:c.end??null,role:c.role??null}))),
    coverage:ordered(result.coverage.map(c=>({start:c.start,end:c.end,role:c.role,required:c.required,assigned:c.assigned,state:c.state}))),
    gaps:ordered(result.gaps.map(g=>({start:g.start,end:g.end,role:g.role,missingEmployees:g.missingEmployees}))),
    workloads:ordered((result.workloads??[]).map(w=>({employeeId:w.employeeId,weekStart:w.weekStart,contractedSeconds:w.contractedSeconds,
      nominalSeconds:w.nominalSeconds,excusedSeconds:w.excusedSeconds,expectedSeconds:w.expectedSeconds,plannedSeconds:w.plannedSeconds,
      recognizedSeconds:w.recognizedSeconds,unmetSeconds:w.unmetSeconds,excessSeconds:w.excessSeconds,historicalWorkSeconds:w.historicalWorkSeconds,unassignedSeconds:w.unassignedSeconds??null,
      days:ordered(w.days.map(d=>({date:d.date,nominalSeconds:d.nominalSeconds,excusedSeconds:d.excusedSeconds,expectedSeconds:d.expectedSeconds,plannedSeconds:d.plannedSeconds,recognizedSeconds:d.recognizedSeconds,unmetSeconds:d.unmetSeconds,excessSeconds:d.excessSeconds})))}))),
    score:result.coverageScore
  };
}
module.exports={digest};
