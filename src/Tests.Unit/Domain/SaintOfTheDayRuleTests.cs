using Domain.Entities.v1;
using Domain.Rules.v1;

namespace Tests.Unit.Domain;

public class SaintOfTheDayRuleTests
{
    [Fact]
    public void Trims_title_and_biography()
    {
        var saint = SaintOfTheDayRule.Present(Saint(title: "  Francisco de Assis ", biography: " Frade. "));

        Assert.NotNull(saint);
        Assert.Equal("Francisco de Assis", saint.Title);
        Assert.Equal("Frade.", saint.Biography);
    }

    [Theory]
    [InlineData("", "Frade.")]
    [InlineData("Francisco", "   ")]
    public void Empty_title_or_biography_is_absence(string title, string biography)
    {
        Assert.Null(SaintOfTheDayRule.Present(Saint(title: title, biography: biography)));
    }

    [Theory]
    [InlineData("http://upload.wikimedia.org/a.jpg")]
    [InlineData("https://static.cancaonova.com/images/icon-x-extwitter.svg")]
    [InlineData("https://upload.wikimedia.org/a.gif")]
    [InlineData("not a url")]
    public void Drops_image_and_credit_when_url_is_not_a_portrait(string image)
    {
        var saint = SaintOfTheDayRule.Present(Saint(image: image));

        Assert.NotNull(saint);
        Assert.Null(saint.Image);
        Assert.Null(saint.ImageCredit);
    }

    [Theory]
    [InlineData("https://upload.wikimedia.org/a.jpg")]
    [InlineData("https://upload.wikimedia.org/a.JPEG")]
    [InlineData("https://upload.wikimedia.org/a.png")]
    [InlineData("https://upload.wikimedia.org/a.webp")]
    public void Keeps_https_portrait_with_its_credit(string image)
    {
        var saint = SaintOfTheDayRule.Present(Saint(image: image));

        Assert.NotNull(saint);
        Assert.Equal(image, saint.Image);
        Assert.NotNull(saint.ImageCredit);
    }

    [Fact]
    public void Trims_life_and_veneration_and_drops_empty_fields()
    {
        var input = Saint();
        input.Life = new SaintLifeEntity { Birth = " 1182, Assis ", Death = "  " };
        input.Veneration = new SaintVenerationEntity { VeneratedBy = "Igreja Católica ", Feast = "4 de outubro", PatronOf = "" };

        var saint = SaintOfTheDayRule.Present(input);

        Assert.NotNull(saint);
        Assert.Equal("1182, Assis", saint.Life?.Birth);
        Assert.Null(saint.Life?.Death);
        Assert.Equal("Igreja Católica", saint.Veneration?.VeneratedBy);
        Assert.Null(saint.Veneration?.Canonization);
        Assert.Null(saint.Veneration?.PatronOf);
    }

    [Fact]
    public void Life_and_veneration_without_text_are_absent()
    {
        var input = Saint();
        input.Life = new SaintLifeEntity { Birth = " ", Death = null };
        input.Veneration = new SaintVenerationEntity { Feast = "" };

        var saint = SaintOfTheDayRule.Present(input);

        Assert.NotNull(saint);
        Assert.Null(saint.Life);
        Assert.Null(saint.Veneration);
    }

    [Fact]
    public void Trims_summary_paragraphs_and_drops_empty_ones()
    {
        var input = Saint();
        input.Summary = [" Frade. Fundou os Menores. ", "   ", "Morreu em Assis."];

        var saint = SaintOfTheDayRule.Present(input);

        Assert.NotNull(saint);
        Assert.Equal(["Frade. Fundou os Menores.", "Morreu em Assis."], saint.Summary);
    }

    [Fact]
    public void Summary_without_text_is_absent()
    {
        var input = Saint();
        input.Summary = ["", "  "];

        Assert.Null(SaintOfTheDayRule.Present(input)?.Summary);
        Assert.Null(SaintOfTheDayRule.Present(Saint())?.Summary);
    }

    [Fact]
    public void Trims_new_life_and_veneration_fields_and_drops_empty_ones()
    {
        var input = Saint();
        input.Life = new SaintLifeEntity { Burial = " Basílica de São Francisco ", Order = " " };
        input.Veneration = new SaintVenerationEntity
        {
            Beatification = " 1228 ",
            CanonizedBy = "",
            Attributes = " Hábito franciscano, estigmas ",
        };

        var saint = SaintOfTheDayRule.Present(input);

        Assert.NotNull(saint);
        Assert.Equal("Basílica de São Francisco", saint.Life?.Burial);
        Assert.Null(saint.Life?.Order);
        Assert.Null(saint.Life?.Birth);
        Assert.Equal("1228", saint.Veneration?.Beatification);
        Assert.Null(saint.Veneration?.CanonizedBy);
        Assert.Equal("Hábito franciscano, estigmas", saint.Veneration?.Attributes);
    }

    [Fact]
    public void Blocks_with_only_empty_new_fields_are_absent()
    {
        var input = Saint();
        input.Life = new SaintLifeEntity { Burial = " ", Order = "" };
        input.Veneration = new SaintVenerationEntity { Beatification = " ", CanonizedBy = null, Attributes = "" };

        var saint = SaintOfTheDayRule.Present(input);

        Assert.NotNull(saint);
        Assert.Null(saint.Life);
        Assert.Null(saint.Veneration);
    }

    private static SaintEntity Saint(string title = "Francisco de Assis", string biography = "Frade.", string? image = null) => new()
    {
        Day = "10-04",
        Title = title,
        Biography = biography,
        Image = image,
        Source = new SaintSourceEntity { Name = "Wikipédia", Url = "https://pt.wikipedia.org/wiki/Francisco_de_Assis", License = "CC BY-SA 4.0", LicenseUrl = "https://creativecommons.org/licenses/by-sa/4.0/" },
        ImageCredit = new SaintImageCreditEntity { Author = "Cimabue", License = "Public domain", Url = "https://commons.wikimedia.org/wiki/File:a.jpg" },
    };
}
