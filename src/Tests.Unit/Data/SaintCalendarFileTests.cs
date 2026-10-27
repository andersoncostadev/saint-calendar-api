using Domain.Entities.v1;
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
            var texts = new[]
            {
                saint.Life?.Birth, saint.Life?.Death, saint.Life?.Burial, saint.Life?.Order,
                saint.Veneration?.VeneratedBy, saint.Veneration?.Beatification, saint.Veneration?.Canonization,
                saint.Veneration?.CanonizedBy, saint.Veneration?.PatronOf, saint.Veneration?.Attributes,
            };
            Assert.All(texts.Where(text => text is not null), text =>
            {
                Assert.Equal(text!.Trim(), text);
                Assert.DoesNotMatch(@"[\[\]{}|=<>*]", text);
                Assert.DoesNotMatch(@"^Q\d+$", text);
                Assert.True(text.Length <= 160, $"{saint.Day}: {text}");
            });
        });
    }

    [Fact]
    public void Every_summary_starts_with_the_biography_and_stays_within_3_paragraphs_and_1200_characters()
    {
        var withSummary = _repository.All().Where(saint => saint.Summary is not null).ToList();

        Assert.NotEmpty(withSummary);
        Assert.All(withSummary, saint =>
        {
            var summary = saint.Summary!;
            Assert.InRange(summary.Count, 1, 3);
            Assert.True(summary.Sum(paragraph => paragraph.Length) <= 1200, saint.Day);
            Assert.StartsWith(saint.Biography, summary[0]);
            Assert.All(summary, paragraph =>
            {
                Assert.False(string.IsNullOrWhiteSpace(paragraph), saint.Day);
                Assert.Equal(paragraph.Trim(), paragraph);
                Assert.DoesNotMatch(@"[\[\]{}|=<>]", paragraph);
                Assert.Matches(@"[.!?][""”»)]?$", paragraph);
            });
        });
    }

    [Fact]
    public async Task Day_with_a_biography_written_for_the_api_has_no_summary()
    {
        var saint = Assert.IsType<SaintEntity>(await _repository.FindByDayAsync("02-29", CancellationToken.None));

        Assert.StartsWith("https://www.wikidata.org/", saint.Source?.Url);
        Assert.Null(saint.Summary);
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
