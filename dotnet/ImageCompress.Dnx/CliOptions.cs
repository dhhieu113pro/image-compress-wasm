namespace ImageCompress.Dnx;

public enum OutputFormat { Jpeg, Png, WebP }
public enum ResizeAlgorithm { Lanczos3, CatmullRom, Triangle }
public sealed record CliOptions(string InputPath, string OutputPath, int Quality, int? MaxWidth, int? MaxHeight, OutputFormat Format, ResizeAlgorithm Algorithm, bool RemoveMetadata)
{
    public static CliOptions Parse(string[] args)
    {
        if (args.Length < 3) throw new ArgumentException("Usage: image-compress <input> -o <output> [options]");
        var input = args[0]; string? output = null; var quality = 80; int? maxWidth = null, maxHeight = null; OutputFormat? format = null; var algorithm = ResizeAlgorithm.Lanczos3; var removeMetadata = false;
        for (var i = 1; i < args.Length; i++) {
            switch (args[i]) {
                case "-o" or "--output": output = Next(args, ref i, "output"); break;
                case "--quality": quality = ParsePositive(Next(args, ref i, "quality"), "quality"); break;
                case "--max-width": maxWidth = ParsePositive(Next(args, ref i, "max-width"), "max-width"); break;
                case "--max-height": maxHeight = ParsePositive(Next(args, ref i, "max-height"), "max-height"); break;
                case "--format": format = Enum.Parse<OutputFormat>(NormalizeFormat(Next(args, ref i, "format")), true); break;
                case "--algorithm": algorithm = Enum.Parse<ResizeAlgorithm>(Next(args, ref i, "algorithm"), true); break;
                case "--remove-metadata": removeMetadata = true; break;
                default: throw new ArgumentException($"Unknown option: {args[i]}");
            }
        }
        if (output is null) throw new ArgumentException("Output path is required (-o/--output)");
        if (quality is < 1 or > 100) throw new ArgumentException("Quality must be between 1 and 100");
        format ??= InferFormat(output);
        return new(input, output, quality, maxWidth, maxHeight, format.Value, algorithm, removeMetadata);
    }
    static string Next(string[] args, ref int i, string name) { if (++i >= args.Length) throw new ArgumentException($"Missing value for {name}"); return args[i]; }
    static int ParsePositive(string value, string name) => int.TryParse(value, out var parsed) && parsed > 0 ? parsed : throw new ArgumentException($"{name} must be greater than zero");
    static string NormalizeFormat(string value) => value.Equals("jpg", StringComparison.OrdinalIgnoreCase) ? "Jpeg" : value;
    static OutputFormat InferFormat(string path) => Path.GetExtension(path).ToLowerInvariant() switch { ".jpg" or ".jpeg" => OutputFormat.Jpeg, ".png" => OutputFormat.Png, ".webp" => OutputFormat.WebP, _ => throw new ArgumentException("Cannot infer output format from extension") };
}
