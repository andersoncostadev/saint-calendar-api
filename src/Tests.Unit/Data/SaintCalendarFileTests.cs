using Domain.Rules.v1;
using Infrastructure.Data.Json.v1;

namespace Tests.Unit.Data;

public class SaintCalendarFileTests
{
    private readonly SaintJsonRepository _repository = new(SaintJsonRepository.DefaultPath);

    [Fact]
    public void Every_entry_is_a_valid_day_with_title_biography_and_source()
    {
        var days = _repository.All();

        Assert.NotEmpty(days);
        Assert.All(days, saint =>
        {
            Assert.True(CalendarDay.TryRead(saint.Day, out _), saint.Day);
            Assert.False(string.IsNullOrWhiteSpace(saint.Title), saint.Day);
            Assert.False(string.IsNullOrWhiteSpace(saint.Biography), saint.Day);
            Assert.NotNull(saint.Source);
            Assert.False(string.IsNullOrWhiteSpace(saint.Source.License), saint.Day);
            Assert.StartsWith("https://", saint.Source.Url);
        });
    }

    [Fact]
    public void Every_image_is_a_portrait_with_credit()
    {
        Assert.All(_repository.All().Where(saint => saint.Image is not null), saint =>
        {
            Assert.True(SaintOfTheDayRule.IsPortrait(saint.Image), saint.Day);
            Assert.Matches(@"\.(jpg|jpeg|png|webp)$", saint.Image!.ToLowerInvariant());
            Assert.NotNull(saint.ImageCredit);
            Assert.False(string.IsNullOrWhiteSpace(saint.ImageCredit.License), saint.Day);
        });
    }

    [Fact]
    public async Task February_29_is_in_the_calendar()
    {
        Assert.NotNull(await _repository.FindByDayAsync("02-29", CancellationToken.None));
    }
}
