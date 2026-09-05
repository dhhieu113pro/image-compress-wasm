using ImageCompress.Dnx;

namespace ImageCompress.Dnx.Tests;

public sealed class CliOptionsTests
{
    [Fact]
    public void Parse_InfersFormatAndDefaults()
    {
        var options = CliOptions.Parse(["input.png", "-o", "output.webp"]);
        Assert.Equal("input.png", options.InputPath);
        Assert.Equal("output.webp", options.OutputPath);
        Assert.Equal(OutputFormat.WebP, options.Format);
        Assert.Equal(80, options.Quality);
        Assert.Equal(ResizeAlgorithm.Lanczos3, options.Algorithm);
    }

    [Fact]
    public void Parse_RejectsQualityOutsideOneToOneHundred()
    {
        Assert.Throws<ArgumentException>(() => CliOptions.Parse(["input.png", "-o", "output.jpg", "--quality", "0"]));
    }

    [Fact]
    public void Parse_AcceptsResizeAndMetadataOptions()
    {
        var options = CliOptions.Parse(["input.png", "-o", "output.jpg", "--quality", "65", "--max-width", "640", "--max-height", "480", "--algorithm", "CatmullRom", "--remove-metadata"]);
        Assert.Equal(65, options.Quality);
        Assert.Equal(640, options.MaxWidth);
        Assert.Equal(480, options.MaxHeight);
        Assert.Equal(ResizeAlgorithm.CatmullRom, options.Algorithm);
        Assert.True(options.RemoveMetadata);
    }
}
