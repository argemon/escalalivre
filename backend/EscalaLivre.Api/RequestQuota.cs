namespace EscalaLivre.Api;

// Metadata belongs to the resolved endpoint, independent of URL spelling or ticket.
public sealed record RequestQuota(RequestQuotaKind Kind);

public enum RequestQuotaKind { General, Generation, JobPoll, JobCancellation }
