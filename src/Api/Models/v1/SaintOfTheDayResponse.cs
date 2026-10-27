using Domain.Entities.v1;

namespace Api.Models.v1;

public record SaintOfTheDayResponse(
    string Title,
    string Biography,
    string? Image,
    SaintSourceResponse? Source,
    SaintImageCreditResponse? ImageCredit)
{
    public static SaintOfTheDayResponse From(SaintEntity saint) => new(
        saint.Title,
        saint.Biography,
        saint.Image,
        saint.Source is null ? null : new SaintSourceResponse(saint.Source.Name, saint.Source.Url, saint.Source.License, saint.Source.LicenseUrl),
        saint.ImageCredit is null ? null : new SaintImageCreditResponse(saint.ImageCredit.Author, saint.ImageCredit.License, saint.ImageCredit.Url));
}

public record SaintSourceResponse(string Name, string Url, string License, string LicenseUrl);

public record SaintImageCreditResponse(string Author, string License, string Url);
