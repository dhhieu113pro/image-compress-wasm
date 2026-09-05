using System.Runtime.InteropServices;

namespace ImageCompress.Dnx;

public static class ImageCompressor
{
    static ImageCompressor() => NativeLibraryResolver.Configure();

    public static unsafe byte[] Compress(byte[] input, CliOptions options)
    {
        if (input.Length == 0)
            throw new ArgumentException("Input image is empty", nameof(input));

        fixed (byte* inputPtr = input.AsSpan())
        {
            var result = NativeMethods.Compress(
                inputPtr,
                (nuint)input.Length,
                (byte)options.Quality,
                (uint)(options.MaxWidth ?? 0),
                (uint)(options.MaxHeight ?? 0),
                options.Format.ToString().ToLowerInvariant(),
                options.Algorithm.ToString(),
                options.RemoveMetadata);

            return ProcessResult(result, NativeMethods.Free, NativeMethods.FreeError);
        }
    }

    internal static byte[] ProcessResult(
        NativeMethods.NativeResult result,
        Action<nint, nuint> freeData,
        Action<nint> freeError)
    {
        try
        {
            if (result.Status != 0)
            {
                var message = result.Error == 0
                    ? "Native compression failed"
                    : Marshal.PtrToStringUTF8(result.Error)!;
                throw new InvalidOperationException(message);
            }

            if (result.Data == 0 || result.Len == 0)
                throw new InvalidOperationException("Native compression returned an empty buffer");
            if (result.Len > int.MaxValue)
                throw new InvalidOperationException("Compressed image is too large for a managed byte array");

            var output = new byte[(int)result.Len];
            Marshal.Copy(result.Data, output, 0, output.Length);
            return output;
        }
        finally
        {
            if (result.Data != 0)
                freeData(result.Data, result.Len);
            if (result.Error != 0)
                freeError(result.Error);
        }
    }
}
