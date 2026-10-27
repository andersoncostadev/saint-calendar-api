using Api.Models.v1;
using Domain.Queries.v1.SaintOfTheDay;
using Microsoft.AspNetCore.Mvc;

namespace Api.Controllers.v1;

[ApiController]
[Route("santo-do-dia")]
public class SaintOfTheDayController : ControllerBase
{
    private readonly GetSaintOfTheDayQueryHandler _handler;

    public SaintOfTheDayController(GetSaintOfTheDayQueryHandler handler)
    {
        _handler = handler;
    }

    [HttpGet("{day}")]
    [ProducesResponseType(typeof(SaintOfTheDayResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(string day, CancellationToken cancellationToken)
    {
        var saint = await _handler.HandleAsync(day, cancellationToken);
        return saint is null ? NotFound() : Ok(SaintOfTheDayResponse.From(saint));
    }
}
