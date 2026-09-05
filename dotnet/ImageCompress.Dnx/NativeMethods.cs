using System.Runtime.InteropServices;

namespace ImageCompress.Dnx;

internal static unsafe partial class NativeMethods
{
    internal const string LibraryName = "image_compress";

    [StructLayout(LayoutKind.Sequential)]
    internal struct NativeResult
    {
        internal int Status;
        internal nint Data;
        internal nuint Len;
        internal nint Error;
    }

    [LibraryImport(LibraryName, EntryPoint = "image_compress", StringMarshalling = StringMarshalling.Utf8)]
    internal static partial NativeResult Compress(
        byte* input,
        nuint inputLen,
        byte quality,
        uint maxWidth,
        uint maxHeight,
        string outputFormat,
        string algorithm,
        [MarshalAs(UnmanagedType.I1)] bool removeMetadata);

    [LibraryImport(LibraryName, EntryPoint = "image_compress_free")]
    internal static partial void Free(nint data, nuint len);

    [LibraryImport(LibraryName, EntryPoint = "image_compress_error_free")]
    internal static partial void FreeError(nint error);
}
