using Domain.Entities.v1;

namespace Domain.Rules.v1;

public static class SaintOfTheDayRule
{
    private static readonly string[] ImageExtensions = [".jpg", ".jpeg", ".png", ".webp"];

    public static SaintEntity? Present(SaintEntity? saint)
    {
        if (saint is null) return null;

        var title = saint.Title?.Trim() ?? string.Empty;
        var biography = saint.Biography?.Trim() ?? string.Empty;
        if (title.Length == 0 || biography.Length == 0) return null;

        var image = IsPortrait(saint.Image) ? saint.Image : null;

        return new SaintEntity
        {
            Day = saint.Day,
            Title = title,
            Biography = biography,
            Summary = PresentSummary(saint.Summary),
            Image = image,
            Source = saint.Source,
            ImageCredit = image is null ? null : saint.ImageCredit,
            Calendar = saint.Calendar,
            Life = PresentLife(saint.Life),
            Veneration = PresentVeneration(saint.Veneration),
            FactsSource = saint.FactsSource,
        };
    }

    private static List<string>? PresentSummary(List<string>? summary)
    {
        var paragraphs = summary?.Select(Text).OfType<string>().ToList() ?? [];
        return paragraphs.Count == 0 ? null : paragraphs;
    }

    private static SaintLifeEntity? PresentLife(SaintLifeEntity? life)
    {
        var present = new SaintLifeEntity
        {
            Birth = Text(life?.Birth),
            Death = Text(life?.Death),
            Burial = Text(life?.Burial),
            Order = Text(life?.Order),
        };
        return present is { Birth: null, Death: null, Burial: null, Order: null } ? null : present;
    }

    private static SaintVenerationEntity? PresentVeneration(SaintVenerationEntity? veneration)
    {
        var present = new SaintVenerationEntity
        {
            VeneratedBy = Text(veneration?.VeneratedBy),
            Beatification = Text(veneration?.Beatification),
            Canonization = Text(veneration?.Canonization),
            CanonizedBy = Text(veneration?.CanonizedBy),
            Feast = Text(veneration?.Feast),
            PatronOf = Text(veneration?.PatronOf),
            Attributes = Text(veneration?.Attributes),
        };
        return present is
        {
            VeneratedBy: null, Beatification: null, Canonization: null, CanonizedBy: null, Feast: null, PatronOf: null, Attributes: null,
        }
            ? null
            : present;
    }

    private static string? Text(string? value)
    {
        var text = value?.Trim();
        return string.IsNullOrEmpty(text) ? null : text;
    }

    public static bool IsPortrait(string? url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps) return false;
        return ImageExtensions.Any(extension => uri.AbsolutePath.EndsWith(extension, StringComparison.OrdinalIgnoreCase));
    }
}
