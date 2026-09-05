# Image Compressor (WASM)

Compress images entirely in your browser — or via a REST API — using a shared [Rust](https://rustwasm.github.io/) codec compiled to WebAssembly. No image ever leaves your device when using the frontend.

**Live app:** https://dhhieu113pro.github.io/image-compress-wasm/

## DNX / .NET 10 CLI

The same Rust compression core is available as the `ImageCompress.Dnx` .NET tool for CI/CD pipelines and local automation.

```bash
dnx ImageCompress.Dnx -- input.png -o output.webp --quality 80
```

Resize while preserving aspect ratio:

```bash
dnx ImageCompress.Dnx -- photo.jpg -o photo.webp --quality 75 --max-width 1600 --max-height 1600 --algorithm Lanczos3 --remove-metadata
```

Supported output formats are JPEG, PNG, and WebP. Resize algorithms are `Lanczos3`, `CatmullRom`, and `Triangle`. The output format is inferred from the output extension unless `--format` is supplied.

GitHub Actions example:

```yaml
- uses: actions/setup-dotnet@v5
  with:
    dotnet-version: 10.0.x

- run: dnx ImageCompress.Dnx -- assets/logo.png -o dist/logo.webp --quality 80
```

The NuGet package includes the Rust native library and is designed for Windows, Linux, and macOS pipelines.

## Features

- Browser-side compression using WebAssembly
- JPEG, PNG, and WebP output
- Quality selection
- Optional resize with aspect-ratio preservation
- Lanczos3, CatmullRom, and Triangle resize algorithms
- Optional JPEG metadata removal
- REST API support through Netlify Functions

## Development

```bash
npm install
npm run dev
```

The root build compiles the browser WebAssembly module, the Vite frontend, and the Netlify function package:

```bash
npm run build
```

The GitHub Pages workflow builds only the browser WASM and Vite frontend.

## Rust crate

The Rust code lives in `wasm/`. Its platform-neutral compression core is shared by the browser WASM adapter and the native C ABI consumed by `ImageCompress.Dnx`.

```bash
cargo test --manifest-path wasm/Cargo.toml
```

## License

See the repository license information.
