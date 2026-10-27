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
