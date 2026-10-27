using Domain.Entities.v1;

namespace Domain.Interfaces.v1.Repositories;

public interface ISaintRepository
{
    Task<SaintEntity?> FindByDayAsync(string day, CancellationToken cancellationToken);
}
