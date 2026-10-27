using System.Text.Json;
using Api.Infrastructure.Export;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Tests.Unit.Api;

public class StaticSiteExportTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly string _output = Path.Combine(Path.GetTempPath(), $"saint-export-{Guid.NewGuid():N}");

    public StaticSiteExportTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Every_exported_day_matches_the_endpoint_body()
    {
        var written = await StaticSiteExport.RunAsync(_factory.Services, _output);

        var folder = Path.Combine(_output, StaticSiteExport.Folder);
        var files = Directory.GetFiles(folder);
        Assert.Equal(written, files.Length);
        Assert.True(File.Exists(Path.Combine(_output, ".nojekyll")));

        using var client = _factory.CreateClient();
        foreach (var path in files)
        {
            var day = Path.GetFileName(path);
            var served = await client.GetStringAsync($"/{StaticSiteExport.Folder}/{day}");
            Assert.Equal(Normalize(served), Normalize(await File.ReadAllTextAsync(path)));
        }
    }

    private static string Normalize(string json)
    {
        using var document = JsonDocument.Parse(json);
        return JsonSerializer.Serialize(document.RootElement);
    }

    public void Dispose()
    {
        if (Directory.Exists(_output)) Directory.Delete(_output, recursive: true);
    }
}
