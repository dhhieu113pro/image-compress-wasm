# DNX Native Image Compressor Design

## Goal

Publish the existing Rust image compressor as a cross-platform .NET 10 tool that can be executed through `dnx ImageCompress.Dnx -- ...` in CI/CD pipelines while preserving the existing browser WebAssembly application.

## Architecture

The Rust compression implementation becomes platform-neutral. The existing WebAssembly API remains a thin `wasm-bindgen` adapter over that core, while a new native C ABI adapter exposes the same compressor to .NET. The .NET 10 CLI uses P/Invoke/LibraryImport to call the native library and is packaged as `ImageCompress.Dnx` with `PackAsTool=true`.

The NuGet tool contains native assets under `runtimes/<rid>/native/` so consumers use one package rather than selecting a platform-specific package.

## Rust components

- Extract image inspection, resizing, format conversion, quality handling, and metadata behavior from the `wasm_bindgen` surface into a platform-neutral module returning Rust error types.
- Keep the existing WASM exports and JavaScript-facing behavior compatible by translating core errors to `JsValue` in the WASM adapter.
- Add a C ABI with explicit ownership rules. The native API accepts input bytes plus compression options and returns an owned result buffer or an error. An exported free function releases memory allocated by Rust.
- Keep JPEG, PNG, and WebP output support and the existing Lanczos3, CatmullRom, and Triangle resize choices.

## .NET components

Create `dotnet/ImageCompress.Dnx` targeting `net10.0`.

- Package ID: `ImageCompress.Dnx`
- Tool command: `image-compress`
- Package mode: `PackAsTool=true`
- Native interop: source-generated `LibraryImport`/P/Invoke with safe managed wrappers around Rust-owned buffers.
- CLI syntax:

```text
image-compress <input> -o <output> [--quality 1-100] [--format jpeg|png|webp] [--max-width N] [--max-height N] [--algorithm Lanczos3|CatmullRom|Triangle] [--remove-metadata]
```

The output format defaults from the output extension when `--format` is omitted. Invalid options, unsupported extensions, native load failures, and Rust compression errors return a non-zero exit code with a concise diagnostic.

## Native targets

The intended package targets are:

- `win-x64`
- `win-arm64`
- `linux-x64`
- `linux-arm64`
- `osx-x64`
- `osx-arm64`

CI may cross-compile pure-Rust targets where GitHub-hosted runners support it. Every packaged RID must have its native asset validated before publishing.

## Testing

Testing is required at three levels:

1. Rust tests for platform-neutral compression behavior and the native ABI ownership/error contract.
2. .NET unit/integration tests for CLI parsing, option mapping, native loading, successful compression, dimensions, format, and failure handling.
3. Package smoke tests that build the actual `.nupkg`, install/execute it through `dnx`, compress a fixture, and validate the output.

At least one end-to-end native/DNX smoke test runs on Windows, Linux, and macOS so platform-specific native loading failures are caught before release.

## CI and publishing

Follow the established `RoslynMcp.Dnx` release convention:

- PR/push CI verifies Rust and .NET tests.
- Build native libraries for supported RIDs.
- Assemble and pack `ImageCompress.Dnx`.
- Exercise the produced package through `dnx`, not merely `dotnet run`.
- Upload the verified NuGet package as a workflow artifact.
- On `v*` tags, derive the package version from the tag and publish to NuGet.org using trusted publishing/OIDC.
- Release tags must point to `master` history.

## Compatibility

The browser WASM build, GitHub Pages deployment, and Netlify paths remain supported. The native/DNX work reuses the same Rust core but does not require .NET or native binaries for browser builds.
