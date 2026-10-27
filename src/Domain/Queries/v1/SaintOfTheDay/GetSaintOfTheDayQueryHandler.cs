using Domain.Entities.v1;
using Domain.Interfaces.v1.Repositories;
using Domain.Rules.v1;

namespace Domain.Queries.v1.SaintOfTheDay;

public class GetSaintOfTheDayQueryHandler
{
    private readonly ISaintRepository _repository;

    public GetSaintOfTheDayQueryHandler(ISaintRepository repository)
    {
        _repository = repository;
    }

    public async Task<SaintEntity?> HandleAsync(string day, CancellationToken cancellationToken)
    {
        if (!CalendarDay.TryRead(day, out var key)) return null;

        var saint = await _repository.FindByDayAsync(key, cancellationToken);
        return SaintOfTheDayRule.Present(saint);
    }
}
