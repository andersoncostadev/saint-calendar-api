using Api.Infrastructure.Export;
using Api.Infrastructure.IoC;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSaintCalendar();

var app = builder.Build();

if (args is ["export", var output])
{
    var written = await StaticSiteExport.RunAsync(app.Services, output);
    Console.WriteLine($"{StaticSiteExport.Folder}: {written} dias em {Path.GetFullPath(output)}");
    return;
}

app.UseCors();
app.MapControllers();

app.Run();

public partial class Program;
