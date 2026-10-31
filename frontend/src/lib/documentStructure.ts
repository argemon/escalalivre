import limits from "../../../shared/document-validation-limits.json";

type Path = (string|number)[];
type Issue = {path:Path;message:string};
const record=(value:unknown):value is Record<string,unknown> => value!==null && typeof value==="object" && !Array.isArray(value);

// Check collection counts before migrations allocate/map their elements. No file-size
// limit here: browser documents above 1 MiB must remain recoverable.
export function documentStructureIssue(input:unknown):Issue|undefined {
  const invalid=(path:Path):Issue=>({path,message:"Estrutura ou coleção inválida ou acima do limite."});
  const array=(value:unknown,max:number,path:Path,optional=false):Issue|undefined =>
    optional && value===undefined ? undefined : !Array.isArray(value) || value.length>max ? invalid(path) : undefined;
  if(!record(input))return invalid([]);
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
  for(const [i,employee] of (input.employees as unknown[]).entries()) {
    const path:Path=["employees",i];
    if(!record(employee))return invalid(path);
    const collections:[string,number,boolean?][]=[
      ["availability",limits.windows],["restrictions",limits.windows],
      ["preferences",limits.preferences],["preferredDaysOff",limits.days],
      ["workingDays",limits.days,true],["coverageRoleIds",limits.coverageRoles,true],
      ["coverageRoles",limits.coverageRoles,true]
    ];
    for(const [key,max,optional] of collections){const issue=array(employee[key],max,[...path,key],optional);if(issue)return issue;}
  }
  for(const [i,assignment] of (input.assignments as unknown[]).entries()) {
    if(!record(assignment))return invalid(["assignments",i]);
    const issue=array(assignment.tags,limits.tags,["assignments",i,"tags"]);if(issue)return issue;
  }
}
