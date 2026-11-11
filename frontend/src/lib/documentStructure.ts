import limits from "../../../shared/document-validation-limits.json";

type Path = (string|number)[];
type Issue = {path:Path;message:string};
const record=(value:unknown):value is Record<string,unknown> => value!==null && typeof value==="object" && !Array.isArray(value);

// Check collection counts before migrations allocate/map their elements. No file-size
// limit here: browser documents above 1 MiB must remain recoverable.
export function documentStructureIssue(input:unknown):Issue|undefined {
  const invalid=(path:Path):Issue=>({path,message:"Estrutura ou coleção inválida ou acima do limite."});
  const array=(value:unknown,max:number,path:Path,optional=false):Issue|undefined =>
    optional && (value===undefined || ((["contractLeaves","roleHistory","accumulationRoleIds","absences"].includes(String(path[path.length-1])) || (path[0]==="roles" && path[path.length-1]==="coverageRoleIds")) && value===null)) ? undefined : !Array.isArray(value) || value.length>max ? invalid(path) : undefined;
  if(!record(input))return invalid([]);
  for(const key of ["publications","publicationSelections"]){if(input[key]!==undefined&&input[key]!==null&&(!Array.isArray(input[key])||(input[key] as unknown[]).length>10))return invalid([key]);}
  if(!record(input.company))return invalid(["company"]);
  const top:[unknown,number,Path,boolean?][]=[
    [input.employees,limits.employees,["employees"]],
    [input.assignments,limits.assignments,["assignments"]],
    [input.roles,limits.roles,["roles"],true],
    [input.company.coverage,limits.coverage,["company","coverage"]],
    [input.company.holidays,limits.holidays,["company","holidays"],true],
    [input.company.operatingDays,limits.days,["company","operatingDays"]]
  ];
  for(const args of top){const issue=array(...args);if(issue)return issue;}
  for(const [i,role] of ((input.roles ?? []) as unknown[]).entries()) {
    if(!record(role))return invalid(["roles",i]);
    const issue=array(role.coverageRoleIds,limits.coverageRoles,["roles",i,"coverageRoleIds"],true);if(issue)return issue;
  }
  for(const [i,employee] of (input.employees as unknown[]).entries()) {
    const path:Path=["employees",i];
    if(!record(employee))return invalid(path);
    const collections:[string,number,boolean?][]=[
      ["absences",limits.absences,true],["accumulationRoleIds",limits.coverageRoles,true],["roleHistory",limits.windows,true],["contractLeaves",limits.windows,true],["availability",limits.windows],["restrictions",limits.windows],
      ["preferences",limits.preferences],["preferredDaysOff",limits.days],
      ["workingDays",limits.days,true],["coverageRoleIds",limits.coverageRoles,true],
      ["coverageRoles",limits.coverageRoles,true]
    ];
    const absenceIssue=array(employee.absences,limits.absences,[...path,"absences"],true);if(absenceIssue)return absenceIssue;
    let credits=0;for(const [j,absence]of ((employee.absences??[])as unknown[]).entries()){if(!record(absence))return invalid([...path,"absences",j]);const issue=array(absence.credits,limits.absenceCredits,[...path,"absences",j,"credits"]);if(issue)return issue;credits+=(absence.credits as unknown[]).length;if(credits>limits.absenceCredits)return invalid([...path,"absences"]);}
    for(const [key,max,optional] of collections){const issue=array(employee[key],max,[...path,key],optional);if(issue)return issue;}
  }
  for(const [i,assignment] of (input.assignments as unknown[]).entries()) {
    if(!record(assignment))return invalid(["assignments",i]);
    const issue=array(assignment.tags,limits.tags,["assignments",i,"tags"]);if(issue)return issue;
  }
}
