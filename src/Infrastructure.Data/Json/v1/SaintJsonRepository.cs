using System.Text.Json;
using Domain.Entities.v1;
using Domain.Interfaces.v1.Repositories;

namespace Infrastructure.Data.Json.v1;

public sealed class SaintJsonRepository : ISaintRepository
{
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);

    private readonly Lazy<IReadOnlyDictionary<string, SaintEntity>> _days;

    public SaintJsonRepository(string path)
    {
        _days = new Lazy<IReadOnlyDictionary<string, SaintEntity>>(() => Load(path));
    }

    public static string DefaultPath => Path.Combine(AppContext.BaseDirectory, "Calendar", "saints.json");

    public Task<SaintEntity?> FindByDayAsync(string day, CancellationToken cancellationToken)
    {
        return Task.FromResult(_days.Value.GetValueOrDefault(day));
    }

    public IReadOnlyCollection<SaintEntity> All() => _days.Value.Values.ToList();

    private static IReadOnlyDictionary<string, SaintEntity> Load(string path)
    {
        using var stream = File.OpenRead(path);
        var file = JsonSerializer.Deserialize<SaintCalendarFile>(stream, Options)
            ?? throw new InvalidDataException($"Calendário vazio em {path}");

        return file.Days
            .Where(saint => !string.IsNullOrWhiteSpace(saint.Day))
            .GroupBy(saint => saint.Day)
            .ToDictionary(group => group.Key, group => group.First());
    }

    private sealed class SaintCalendarFile
    {
        public List<SaintEntity> Days { get; set; } = [];
    }
}
