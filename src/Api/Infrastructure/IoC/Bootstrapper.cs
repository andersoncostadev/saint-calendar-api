using System.Text.Json.Serialization;
using Domain.Interfaces.v1.Repositories;
using Domain.Queries.v1.SaintOfTheDay;
using Infrastructure.Data.Json.v1;

namespace Api.Infrastructure.IoC;

public static class Bootstrapper
{
    public static IServiceCollection AddSaintCalendar(this IServiceCollection services)
    {
        services
            .AddControllers()
            .AddJsonOptions(options => options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull);

        services.AddCors(options => options.AddDefaultPolicy(policy => policy.AllowAnyOrigin().WithMethods("GET")));

        services.AddSingleton<ISaintRepository>(_ => new SaintJsonRepository(SaintJsonRepository.DefaultPath));
        services.AddSingleton<GetSaintOfTheDayQueryHandler>();

        return services;
    }
}
