using System.Runtime.InteropServices;
using ImageCompress.Dnx;

namespace ImageCompress.Dnx.Tests;

public sealed class ImageCompressorTests
{
    private static readonly byte[] TinyPng = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=");

    [Fact]
    public void Compress_UsesBundledNativeLibraryAndProducesWebP()
    {
        var options = CliOptions.Parse(["input.png", "-o", "output.webp", "--quality", "80"]);
        var output = ImageCompressor.Compress(TinyPng, options);

        Assert.True(output.Length >= 12);
        Assert.Equal("RIFF", System.Text.Encoding.ASCII.GetString(output, 0, 4));
        Assert.Equal("WEBP", System.Text.Encoding.ASCII.GetString(output, 8, 4));
    }

    [Fact]
    public void Compress_PropagatesNativeError()
    {
        var options = CliOptions.Parse(["input.png", "-o", "output.webp"]);
        var error = Assert.Throws<InvalidOperationException>(() => ImageCompressor.Compress([1, 2, 3, 4], options));
        Assert.Contains("decode", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void NativeAsset_IsPresentForCurrentRuntime()
    {
        var fileName = OperatingSystem.IsWindows()
            ? "image_compress.dll"
            : OperatingSystem.IsMacOS() ? "libimage_compress.dylib" : "libimage_compress.so";
        var path = Path.Combine(AppContext.BaseDirectory, "runtimes", RuntimeInformation.RuntimeIdentifier, "native", fileName);
        Assert.True(File.Exists(path), $"Missing native asset: {path}");
    }
}
