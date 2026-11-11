namespace EscalaLivre.Application.Contracts.Documents;
public sealed record PublicationDto(string Id, int Number, PublicationDtoPeriod Period, string ClosedAt, string CompanyName, string CompanyTimeZone, IReadOnlyList<PublicationDtoPerson> People, IReadOnlyList<PublicationDtoShift> Shifts, IReadOnlyList<PublicationDtoAcknowledgement> Acknowledgements);
public sealed record PublicationDtoPeriod(string Start,string End);
public sealed record PublicationDtoPerson(string Id,string Name,string Role);
public sealed record PublicationDtoShift(string Id,string EmployeeId,string Role,string Start,string End,[property: System.Text.Json.Serialization.JsonIgnore(Condition=System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)] PublicationDtoBreak? Break=null);
public sealed record PublicationDtoBreak(string Start,string End);
public sealed record PublicationDtoAcknowledgement(string Category,int Groups,int Occurrences);
public sealed record PublicationDtoSelection(string Start,string End,string VersionId);
