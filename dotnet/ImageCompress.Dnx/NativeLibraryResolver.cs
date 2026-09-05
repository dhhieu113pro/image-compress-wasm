using System.Reflection; using System.Runtime.InteropServices;
namespace ImageCompress.Dnx;
internal static class NativeLibraryResolver
{
    internal static void Configure() => NativeLibrary.SetDllImportResolver(typeof(NativeLibraryResolver).Assembly, Resolve);
    static nint Resolve(string libraryName, Assembly assembly, DllImportSearchPath? path) {
        if (libraryName != NativeMethods.LibraryName) return 0;
        var rid = RuntimeInformation.RuntimeIdentifier; var file = OperatingSystem.IsWindows() ? "image_compress.dll" : OperatingSystem.IsMacOS() ? "libimage_compress.dylib" : "libimage_compress.so";
        var candidates = new[] { Path.Combine(AppContext.BaseDirectory, "runtimes", rid, "native", file), Path.Combine(AppContext.BaseDirectory, file) };
        foreach (var candidate in candidates) if (File.Exists(candidate)) return NativeLibrary.Load(candidate);
        return 0;
    }
}
