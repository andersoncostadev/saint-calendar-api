using Api.Infrastructure.IoC;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSaintCalendar();

var app = builder.Build();

app.UseCors();
app.MapControllers();

app.Run();

public partial class Program;
