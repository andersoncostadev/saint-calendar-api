using Domain.Rules.v1;

namespace Tests.Unit.Domain;

public class CalendarDayTests
{
    [Theory]
    [InlineData("01-01")]
    [InlineData("02-29")]
    [InlineData("10-27")]
    [InlineData("12-31")]
    public void Accepts_month_and_day_with_two_digits(string value)
    {
        Assert.True(CalendarDay.TryRead(value, out var day));
        Assert.Equal(value, day);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("1-1")]
    [InlineData("00-10")]
    [InlineData("13-01")]
    [InlineData("02-30")]
    [InlineData("04-31")]
    [InlineData("12-32")]
    [InlineData("10/27")]
    [InlineData("2026-10-27")]
    [InlineData("١٠-٢٧")]
    public void Rejects_anything_outside_the_calendar(string? value)
    {
        Assert.False(CalendarDay.TryRead(value, out _));
    }
}
