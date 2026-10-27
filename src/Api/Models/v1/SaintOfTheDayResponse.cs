using Domain.Entities.v1;

namespace Api.Models.v1;

public record SaintOfTheDayResponse(
    string Title,
    string Biography,
    string? Image,
    SaintSourceResponse? Source,
    SaintImageCreditResponse? ImageCredit,
    SaintCalendarResponse? Calendar,
    SaintLifeResponse? Life,
    SaintVenerationResponse? Veneration,
    SaintSourceResponse? FactsSource)
{
    public static SaintOfTheDayResponse From(SaintEntity saint) => new(
        saint.Title,
        saint.Biography,
        saint.Image,
        SaintSourceResponse.From(saint.Source),
        saint.ImageCredit is null ? null : new SaintImageCreditResponse(saint.ImageCredit.Author, saint.ImageCredit.License, saint.ImageCredit.Url),
        saint.Calendar is null ? null : new SaintCalendarResponse(saint.Calendar.Name, saint.Calendar.Url),
        saint.Life is null ? null : new SaintLifeResponse(saint.Life.Birth, saint.Life.Death),
        saint.Veneration is null ? null : new SaintVenerationResponse(saint.Veneration.VeneratedBy, saint.Veneration.Canonization, saint.Veneration.Feast, saint.Veneration.PatronOf),
        SaintSourceResponse.From(saint.FactsSource));
}

public record SaintSourceResponse(string Name, string Url, string License, string LicenseUrl)
{
    public static SaintSourceResponse? From(SaintSourceEntity? source) =>
        source is null ? null : new SaintSourceResponse(source.Name, source.Url, source.License, source.LicenseUrl);
}

public record SaintImageCreditResponse(string Author, string License, string Url);

public record SaintCalendarResponse(string Name, string Url);

public record SaintLifeResponse(string? Birth, string? Death);

public record SaintVenerationResponse(string? VeneratedBy, string? Canonization, string? Feast, string? PatronOf);
