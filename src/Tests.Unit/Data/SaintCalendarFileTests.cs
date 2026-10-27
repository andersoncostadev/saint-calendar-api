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
    public void Every_entry_has_its_feast_and_life_or_veneration_text_is_clean()
    {
        Assert.All(_repository.All(), saint =>
        {
            Assert.False(string.IsNullOrWhiteSpace(saint.Veneration?.Feast), saint.Day);
            var texts = new[] { saint.Life?.Birth, saint.Life?.Death, saint.Veneration?.VeneratedBy, saint.Veneration?.Canonization, saint.Veneration?.PatronOf };
            Assert.All(texts.Where(text => text is not null), text =>
            {
                Assert.Equal(text!.Trim(), text);
                Assert.DoesNotMatch(@"[\[\]{}|=<>*]", text);
            });
        });
    }

    [Fact]
    public void Most_days_follow_the_cancao_nova_calendar_and_point_to_its_page()
    {
        var days = _repository.All();
        var chosen = days.Where(saint => saint.Calendar is not null).ToList();

        Assert.True(chosen.Count * 4 >= days.Count * 3, $"só {chosen.Count} de {days.Count} dias da Canção Nova");
        Assert.All(chosen, saint =>
        {
            Assert.Equal("Canção Nova, Santo do Dia", saint.Calendar!.Name);
            Assert.StartsWith("https://santo.cancaonova.com/santo/", saint.Calendar.Url);
        });
    }

    [Fact]
    public async Task February_29_is_in_the_calendar()
    {
        Assert.NotNull(await _repository.FindByDayAsync("02-29", CancellationToken.None));
    }
}
