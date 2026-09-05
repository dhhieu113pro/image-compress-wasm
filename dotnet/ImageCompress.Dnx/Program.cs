using ImageCompress.Dnx;
try {
    var options = CliOptions.Parse(args);
    var input = await File.ReadAllBytesAsync(options.InputPath);
    var output = ImageCompressor.Compress(input, options);
    Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(options.OutputPath))!);
    await File.WriteAllBytesAsync(options.OutputPath, output);
    Console.WriteLine($"Compressed {input.Length} -> {output.Length} bytes: {options.OutputPath}");
    return 0;
} catch (Exception ex) { Console.Error.WriteLine(ex.Message); return 1; }
