using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Tests.Unit.Api;

public class SaintOfTheDayEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public SaintOfTheDayEndpointTests(WebApplicationFactory<Program> factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Answers_200_with_cors_header_and_contract_fields()
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/santo-do-dia/10-04");
        request.Headers.Add("Origin", "http://localhost:5174");

        using var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("*", Assert.Single(response.Headers.GetValues("Access-Control-Allow-Origin")));

        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = body.RootElement;
        Assert.False(string.IsNullOrWhiteSpace(root.GetProperty("title").GetString()));
        Assert.False(string.IsNullOrWhiteSpace(root.GetProperty("biography").GetString()));
        Assert.True(root.TryGetProperty("source", out var source));
        Assert.True(source.TryGetProperty("licenseUrl", out _));
        Assert.False(root.TryGetProperty("day", out _));
        Assert.Equal("4 de outubro", root.GetProperty("veneration").GetProperty("feast").GetString());
        Assert.True(root.GetProperty("life").TryGetProperty("death", out _));
        Assert.Equal("CC0 1.0", root.GetProperty("factsSource").GetProperty("license").GetString());
    }

    [Fact]
    public async Task Answers_summary_and_the_new_life_and_veneration_fields()
    {
        using var body = JsonDocument.Parse(await _client.GetStringAsync("/santo-do-dia/07-31"));
        var root = body.RootElement;

        var biography = root.GetProperty("biography").GetString()!;
        var summary = root.GetProperty("summary").EnumerateArray().Select(paragraph => paragraph.GetString()!).ToList();
        Assert.InRange(summary.Count, 1, 3);
        Assert.StartsWith(biography, summary[0]);

        var life = root.GetProperty("life");
        Assert.False(string.IsNullOrWhiteSpace(life.GetProperty("burial").GetString()));
        Assert.Equal("Companhia de Jesus", life.GetProperty("order").GetString());

        var veneration = root.GetProperty("veneration");
        Assert.False(string.IsNullOrWhiteSpace(veneration.GetProperty("beatification").GetString()));
        Assert.StartsWith("Papa ", veneration.GetProperty("canonizedBy").GetString());
        Assert.False(string.IsNullOrWhiteSpace(veneration.GetProperty("attributes").GetString()));
    }

    [Fact]
    public async Task Omits_summary_and_new_fields_without_text()
    {
        using var body = JsonDocument.Parse(await _client.GetStringAsync("/santo-do-dia/02-29"));
        var root = body.RootElement;

        Assert.False(root.TryGetProperty("summary", out _));
        Assert.False(root.GetProperty("life").TryGetProperty("burial", out _));
        Assert.False(root.GetProperty("veneration").TryGetProperty("canonizedBy", out _));
        Assert.False(root.GetProperty("veneration").TryGetProperty("attributes", out _));
    }

    [Theory]
    [InlineData("02-30")]
    [InlineData("13-01")]
    [InlineData("hoje")]
    public async Task Day_outside_the_calendar_is_404(string day)
    {
        using var response = await _client.GetAsync($"/santo-do-dia/{day}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
