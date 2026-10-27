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
