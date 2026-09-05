using System.Runtime.InteropServices;
using ImageCompress.Dnx;

namespace ImageCompress.Dnx.Tests;

public sealed class ImageCompressorTests
{
    private static readonly byte[] TinyPng = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=");

    [Fact]
    public void Compress_RejectsEmptyInput()
    {
        var options = CliOptions.Parse(["input.png", "-o", "output.webp"]);
        Assert.Throws<ArgumentException>(() => ImageCompressor.Compress([], options));
    }

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
    public void Compress_UsesExplicitResizeBounds()
    {
        var options = CliOptions.Parse([
            "input.png", "-o", "output.webp",
            "--quality", "80",
            "--max-width", "1",
            "--max-height", "1"
        ]);

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
    public void ProcessResult_ReturnsManagedCopyAndFreesData()
    {
        var data = Marshal.AllocHGlobal(3);
        Marshal.Copy(new byte[] { 1, 2, 3 }, 0, data, 3);
        var freed = false;
        var output = ImageCompressor.ProcessResult(
            new NativeMethods.NativeResult { Status = 0, Data = data, Len = 3, Error = 0 },
            (ptr, len) => { Assert.Equal(data, ptr); Assert.Equal((nuint)3, len); Marshal.FreeHGlobal(ptr); freed = true; },
            _ => throw new Xunit.Sdk.XunitException("error free should not run"));

        Assert.Equal(new byte[] { 1, 2, 3 }, output);
        Assert.True(freed);
    }

    [Fact]
    public void ProcessResult_UsesFallbackMessageWhenNativeErrorPointerIsNull()
    {
        var error = Assert.Throws<InvalidOperationException>(() => ImageCompressor.ProcessResult(
            new NativeMethods.NativeResult { Status = 1, Data = 0, Len = 0, Error = 0 },
            (_, _) => throw new Xunit.Sdk.XunitException("data free should not run"),
            _ => throw new Xunit.Sdk.XunitException("error free should not run")));

        Assert.Equal("Native compression failed", error.Message);
    }

    [Fact]
    public void ProcessResult_ReadsAndFreesNativeError()
    {
        var nativeError = Marshal.StringToCoTaskMemUTF8("native boom");
        var freed = false;
        var error = Assert.Throws<InvalidOperationException>(() => ImageCompressor.ProcessResult(
            new NativeMethods.NativeResult { Status = 1, Data = 0, Len = 0, Error = nativeError },
            (_, _) => throw new Xunit.Sdk.XunitException("data free should not run"),
            ptr => { Assert.Equal(nativeError, ptr); Marshal.FreeCoTaskMem(ptr); freed = true; }));

        Assert.Equal("native boom", error.Message);
        Assert.True(freed);
    }

    [Fact]
    public void ProcessResult_RejectsNullDataPointer()
    {
        var error = Assert.Throws<InvalidOperationException>(() => ImageCompressor.ProcessResult(
            new NativeMethods.NativeResult { Status = 0, Data = 0, Len = 1, Error = 0 },
            (_, _) => throw new Xunit.Sdk.XunitException("data free should not run"),
            _ => throw new Xunit.Sdk.XunitException("error free should not run")));

        Assert.Contains("empty buffer", error.Message);
    }

    [Fact]
    public void ProcessResult_RejectsZeroLengthAndStillFreesData()
    {
        var data = Marshal.AllocHGlobal(1);
        var freed = false;
        var error = Assert.Throws<InvalidOperationException>(() => ImageCompressor.ProcessResult(
            new NativeMethods.NativeResult { Status = 0, Data = data, Len = 0, Error = 0 },
            (ptr, _) => { Marshal.FreeHGlobal(ptr); freed = true; },
            _ => throw new Xunit.Sdk.XunitException("error free should not run")));

        Assert.Contains("empty buffer", error.Message);
        Assert.True(freed);
    }

    [Fact]
    public void ProcessResult_RejectsOversizeBufferAndStillFreesData()
    {
        var data = Marshal.AllocHGlobal(1);
        var freed = false;
        var error = Assert.Throws<InvalidOperationException>(() => ImageCompressor.ProcessResult(
            new NativeMethods.NativeResult { Status = 0, Data = data, Len = (nuint)int.MaxValue + 1u, Error = 0 },
            (ptr, _) => { Marshal.FreeHGlobal(ptr); freed = true; },
            _ => throw new Xunit.Sdk.XunitException("error free should not run")));

        Assert.Contains("too large", error.Message);
        Assert.True(freed);
    }

    [Fact]
    public void ProcessResult_FreesBothPointersWhenNativeReturnsBoth()
    {
        var data = Marshal.AllocHGlobal(1);
        var nativeError = Marshal.StringToCoTaskMemUTF8("native boom");
        var dataFreed = false;
        var errorFreed = false;

        Assert.Throws<InvalidOperationException>(() => ImageCompressor.ProcessResult(
            new NativeMethods.NativeResult { Status = 1, Data = data, Len = 1, Error = nativeError },
            (ptr, _) => { Marshal.FreeHGlobal(ptr); dataFreed = true; },
            ptr => { Marshal.FreeCoTaskMem(ptr); errorFreed = true; }));

        Assert.True(dataFreed);
        Assert.True(errorFreed);
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
