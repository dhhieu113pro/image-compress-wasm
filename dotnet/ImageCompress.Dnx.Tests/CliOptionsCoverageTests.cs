using ImageCompress.Dnx;

namespace ImageCompress.Dnx.Tests;

public sealed class CliOptionsCoverageTests
{
    [Theory]
    [InlineData("out.jpg", OutputFormat.Jpeg)]
    [InlineData("out.jpeg", OutputFormat.Jpeg)]
    [InlineData("out.png", OutputFormat.Png)]
    [InlineData("out.webp", OutputFormat.WebP)]
    public void Parse_InfersEverySupportedExtension(string output, OutputFormat expected)
    {
        var options = CliOptions.Parse(["input.png", "-o", output]);
        Assert.Equal(expected, options.Format);
    }

    [Theory]
    [InlineData("jpg", OutputFormat.Jpeg)]
    [InlineData("JPEG", OutputFormat.Jpeg)]
    [InlineData("png", OutputFormat.Png)]
    [InlineData("webp", OutputFormat.WebP)]
    public void Parse_AcceptsExplicitFormats(string format, OutputFormat expected)
    {
        var options = CliOptions.Parse(["input.png", "--output", "out.bin", "--format", format]);
        Assert.Equal(expected, options.Format);
    }

    [Theory]
    [InlineData("Triangle", ResizeAlgorithm.Triangle)]
    [InlineData("catmullrom", ResizeAlgorithm.CatmullRom)]
    [InlineData("Lanczos3", ResizeAlgorithm.Lanczos3)]
    public void Parse_AcceptsEveryResizeAlgorithm(string algorithm, ResizeAlgorithm expected)
    {
        var options = CliOptions.Parse(["input.png", "-o", "out.png", "--algorithm", algorithm]);
        Assert.Equal(expected, options.Algorithm);
    }

    [Fact]
    public void Parse_RejectsTooFewArguments()
    {
        var cases = new[]
        {
            Array.Empty<string>(),
            new[] { "input.png" },
            new[] { "input.png", "-o" }
        };

        foreach (var args in cases)
            Assert.Throws<ArgumentException>(() => CliOptions.Parse(args));
    }

    [Fact]
    public void Parse_RejectsMissingOutput()
    {
        var error = Assert.Throws<ArgumentException>(() => CliOptions.Parse(["input.png", "--quality", "80"]));
        Assert.Contains("Output path", error.Message);
    }

    [Theory]
    [InlineData("--quality")]
    [InlineData("--max-width")]
    [InlineData("--max-height")]
    [InlineData("--format")]
    [InlineData("--algorithm")]
    public void Parse_RejectsMissingOptionValue(string option)
    {
        var error = Assert.Throws<ArgumentException>(() => CliOptions.Parse(["input.png", "-o", "out.png", option]));
        Assert.Contains("Missing value", error.Message);
    }

    [Theory]
    [InlineData("0")]
    [InlineData("-1")]
    [InlineData("not-a-number")]
    public void Parse_RejectsNonPositiveOrInvalidQuality(string value)
    {
        Assert.Throws<ArgumentException>(() => CliOptions.Parse(["input.png", "-o", "out.jpg", "--quality", value]));
    }

    [Fact]
    public void Parse_RejectsQualityAboveOneHundred()
    {
        var error = Assert.Throws<ArgumentException>(() => CliOptions.Parse(["input.png", "-o", "out.jpg", "--quality", "101"]));
        Assert.Contains("between 1 and 100", error.Message);
    }

    [Theory]
    [InlineData("--max-width", "0")]
    [InlineData("--max-height", "-10")]
    [InlineData("--max-width", "abc")]
    public void Parse_RejectsInvalidDimensions(string option, string value)
    {
        Assert.Throws<ArgumentException>(() => CliOptions.Parse(["input.png", "-o", "out.png", option, value]));
    }

    [Fact]
    public void Parse_RejectsUnknownOption()
    {
        var error = Assert.Throws<ArgumentException>(() => CliOptions.Parse(["input.png", "-o", "out.png", "--wat"]));
        Assert.Contains("Unknown option", error.Message);
    }

    [Fact]
    public void Parse_RejectsUnsupportedOutputExtensionWhenFormatIsNotExplicit()
    {
        var error = Assert.Throws<ArgumentException>(() => CliOptions.Parse(["input.png", "-o", "out.gif"]));
        Assert.Contains("Cannot infer", error.Message);
    }

    [Fact]
    public void Parse_RejectsUnknownExplicitFormat()
    {
        Assert.Throws<ArgumentException>(() => CliOptions.Parse(["input.png", "-o", "out.bin", "--format", "gif"]));
    }

    [Fact]
    public void Parse_RejectsUnknownAlgorithm()
    {
        Assert.Throws<ArgumentException>(() => CliOptions.Parse(["input.png", "-o", "out.png", "--algorithm", "Nearest"]));
    }

    [Fact]
    public void Parse_CoversAllOptionalValuesAndLongOutputAlias()
    {
        var options = CliOptions.Parse([
            "input.png", "--output", "out.webp",
            "--quality", "100",
            "--max-width", "1920",
            "--max-height", "1080",
            "--format", "webp",
            "--algorithm", "Triangle",
            "--remove-metadata"
        ]);

        Assert.Equal(100, options.Quality);
        Assert.Equal(1920, options.MaxWidth);
        Assert.Equal(1080, options.MaxHeight);
        Assert.Equal(OutputFormat.WebP, options.Format);
        Assert.Equal(ResizeAlgorithm.Triangle, options.Algorithm);
        Assert.True(options.RemoveMetadata);
    }
}
