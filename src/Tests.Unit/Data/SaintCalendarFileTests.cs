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
            if (saint.Source is null)
            {
                Assert.NotNull(saint.Calendar);
                return;
            }
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

    [Theory]
    [InlineData("02-19", "Conrado_de_Placência", "São Conrado")]
    [InlineData("06-20", "Beata_Teresa_de_Portugal", "Beatas Teresa, Mafalda e Sancha")]
    [InlineData("12-25", "Natal", "Natal do Senhor")]
    [InlineData("05-01", "Festa_de_São_José_Operário", "São José Operário")]
    [InlineData("03-25", "Anunciação", "Anunciação do Senhor")]
    [InlineData("03-19", "São_José", "São José")]
    [InlineData("08-26", "Papa_Zeferino", "São Zeferino")]
    [InlineData("10-09", "Dinis_de_Paris", "São Dionísio de Paris")]
    [InlineData("01-23", "Ildefonso_de_Toledo", "Santo Ildefonso")]
    [InlineData("02-17", "Sete_Santos_Fundadores_da_Ordem_Servita", "Sete Santos Fundadores dos Servitas")]
    [InlineData("02-24", "Sérgio_da_Capadócia", "São Sérgio")]
    [InlineData("03-22", "Papa_Zacarias", "São Zacarias")]
    [InlineData("06-02", "Marcelino_e_Pedro", "São Marcelino e São Pedro")]
    [InlineData("06-16", "Ciro_e_Julita", "São Ciro e Santa Julita")]
    [InlineData("09-12", "Nilo,_o_Moço", "São Nilo")]
    [InlineData("10-19", "Pedro_de_Alcântara", "São Pedro de Alcântara")]
    [InlineData("12-28", "Massacre_dos_Inocentes", "Santos Inocentes")]
    public async Task Corrected_day_uses_the_expected_article_and_title(string day, string article, string title)
    {
        var saint = Assert.IsType<SaintEntity>(await _repository.FindByDayAsync(day, CancellationToken.None));

        Assert.Equal(title, saint.Title);
        Assert.Contains(article, Uri.UnescapeDataString(saint.Source?.Url ?? string.Empty));
        Assert.NotNull(saint.Calendar);
    }

    [Theory]
    [InlineData("02-01", "Q3949268", "Santa Veridiana")]
    [InlineData("12-10", "Q9094350", "Nossa Senhora de Loreto")]
    [InlineData("02-25", "Q1408965", "São Toríbio Romo")]
    public async Task Written_biography_keeps_the_calendar_and_omits_summary(string day, string item, string title)
    {
        var saint = Assert.IsType<SaintEntity>(await _repository.FindByDayAsync(day, CancellationToken.None));

        Assert.Equal(title, saint.Title);
        Assert.Contains(item, saint.Source?.Url);
        Assert.Null(saint.Summary);
        Assert.NotNull(saint.Calendar);
        Assert.DoesNotContain("Palacete", saint.Biography);
    }

    [Fact]
    public void Titles_and_credits_stay_readable_in_portuguese()
    {
        Assert.All(_repository.All(), saint =>
        {
            Assert.DoesNotMatch(@"^(São|Santo|Santa|Beato|Beata|Santos|Santas|Beatos|Beatas)\s+Papa\b", saint.Title);
            Assert.DoesNotMatch(@"^San\b", saint.Title);
            Assert.DoesNotMatch(@"([,;:])(?:\s*\1)+", saint.Biography);
            if (saint.ImageCredit is null) return;
            Assert.True(saint.ImageCredit.Author.Length <= 80, saint.Day);
            Assert.DoesNotMatch(@"unknown|anonymous|unidentified|anonim", saint.ImageCredit.Author.ToLowerInvariant());
            Assert.DoesNotContain("Public domain", saint.ImageCredit.License);
        });
    }

    [Theory]
    [InlineData("03-16")]
    [InlineData("05-04")]
    [InlineData("05-07")]
    [InlineData("07-28")]
    [InlineData("11-18")]
    [InlineData("12-15")]
    public async Task Written_day_without_an_item_keeps_only_the_calendar_line(string day)
    {
        var saint = Assert.IsType<SaintEntity>(await _repository.FindByDayAsync(day, CancellationToken.None));

        Assert.Null(saint.Source);
        Assert.Null(saint.Summary);
        Assert.Null(saint.FactsSource);
        Assert.NotNull(saint.Calendar);
        Assert.StartsWith("https://santo.cancaonova.com/santo/", saint.Calendar.Url);
    }

    [Theory]
    [InlineData("03-17", "Trevo e cruz")]
    [InlineData("08-24", "Faca e pedaço de pele")]
    [InlineData("11-07", "Hábito de bispo e báculo")]
    public async Task Art_symbol_replaces_the_rejected_infobox(string day, string attributes)
    {
        var saint = Assert.IsType<SaintEntity>(await _repository.FindByDayAsync(day, CancellationToken.None));

        Assert.Equal(attributes, saint.Veneration?.Attributes);
    }

    [Theory]
    [InlineData("02-11", "Aparição mariana")]
    [InlineData("02-20", "Devoção a Jesus-Eucaristia")]
    [InlineData("06-12", "Coroou Carlos Magno")]
    [InlineData("12-08", "Concepção sem pecado")]
    public async Task Rejected_art_text_does_not_stay_in_the_catalog(string day, string rejected)
    {
        var saint = Assert.IsType<SaintEntity>(await _repository.FindByDayAsync(day, CancellationToken.None));

        Assert.DoesNotContain(rejected, saint.Veneration?.Attributes ?? string.Empty);
    }
}
