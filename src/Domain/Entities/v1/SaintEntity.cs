namespace Domain.Entities.v1;

public class SaintEntity
{
    public string Day { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string Biography { get; set; } = string.Empty;

    public string? Image { get; set; }

    public SaintSourceEntity? Source { get; set; }

    public SaintImageCreditEntity? ImageCredit { get; set; }
}

public class SaintSourceEntity
{
    public string Name { get; set; } = string.Empty;

    public string Url { get; set; } = string.Empty;

    public string License { get; set; } = string.Empty;

    public string LicenseUrl { get; set; } = string.Empty;
}

public class SaintImageCreditEntity
{
    public string Author { get; set; } = string.Empty;

    public string License { get; set; } = string.Empty;

    public string Url { get; set; } = string.Empty;
}
