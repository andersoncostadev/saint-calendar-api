using System.Text.Encodings.Web;
using System.Text.Json;
using Api.Models.v1;
using Domain.Queries.v1.SaintOfTheDay;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Api.Infrastructure.Export;

public static class StaticSiteExport
{
    public const string Folder = "santo-do-dia";

    public static async Task<int> RunAsync(IServiceProvider services, string output, CancellationToken cancellationToken = default)
    {
        var handler = services.GetRequiredService<GetSaintOfTheDayQueryHandler>();
        var configured = services.GetRequiredService<IOptions<JsonOptions>>().Value.JsonSerializerOptions;
        var json = configured.Encoder is null
            ? new JsonSerializerOptions(configured) { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping }
            : configured;

        var folder = Path.Combine(output, Folder);
        Directory.CreateDirectory(folder);
        await File.WriteAllTextAsync(Path.Combine(output, ".nojekyll"), string.Empty, cancellationToken);

        var written = 0;
        foreach (var day in AllDays())
        {
            var saint = await handler.HandleAsync(day, cancellationToken);
            if (saint is null) continue;

            var body = JsonSerializer.Serialize(SaintOfTheDayResponse.From(saint), json);
            await File.WriteAllTextAsync(Path.Combine(folder, day), body, cancellationToken);
            written++;
        }

        return written;
    }

    private static IEnumerable<string> AllDays() =>
        Enumerable.Range(0, 366).Select(offset => new DateOnly(2024, 1, 1).AddDays(offset).ToString("MM-dd"));
}
