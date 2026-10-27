namespace Domain.Rules.v1;

public static class CalendarDay
{
    private static readonly int[] DaysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    public static bool TryRead(string? value, out string day)
    {
        day = string.Empty;
        if (value is null || value.Length != 5 || value[2] != '-') return false;
        if (!IsDigit(value[0]) || !IsDigit(value[1]) || !IsDigit(value[3]) || !IsDigit(value[4])) return false;

        var month = (value[0] - '0') * 10 + (value[1] - '0');
        var date = (value[3] - '0') * 10 + (value[4] - '0');
        if (month < 1 || month > 12 || date < 1 || date > DaysInMonth[month - 1]) return false;

        day = value;
        return true;
    }

    private static bool IsDigit(char value) => value is >= '0' and <= '9';
}
