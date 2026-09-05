# DNX Native Image Compressor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish a cross-platform .NET 10 `ImageCompress.Dnx` tool backed by the repository's Rust image compressor.

**Architecture:** Refactor the Rust crate into a platform-neutral compression core with separate WASM and C ABI adapters. A .NET 10 tool wraps the C ABI, packages per-RID native libraries into one NuGet tool, and CI validates the actual package through `dnx` before tag-driven NuGet publishing.

**Tech Stack:** Rust 2021, `image`, `fast_image_resize`, `zenwebp`, wasm-bindgen, .NET 10, source-generated `LibraryImport`, xUnit, GitHub Actions, NuGet trusted publishing.

**Spec:** `docs/superpowers/specs/2026-09-05-dnx-native-cli-design.md`

## Global Constraints

- Existing browser WASM behavior and GitHub Pages/Netlify builds must remain compatible.
- NuGet package ID is `ImageCompress.Dnx`; tool command is `image-compress`.
- Target framework is `net10.0`.
- Intended native RIDs are win-x64, win-arm64, linux-x64, linux-arm64, osx-x64, osx-arm64.
- CI must test the produced `.nupkg` through `dnx` before publishing.
- NuGet publishing occurs only for `v*` tags and follows the RoslynMcp.Dnx trusted-publishing convention.

---

### Task 1: Platform-neutral Rust compression core

**Files:**
- Create: `wasm/src/core.rs`
- Modify: `wasm/src/lib.rs`

**Interfaces:**
- Produces: `CompressionOptions`, `ImageInfo`, `CompressionError`, `get_image_info_core(&[u8])`, `compress_image_core(&[u8], &CompressionOptions)`.
- Existing WASM exports consume these core functions and translate `CompressionError` to `JsValue`.

- [ ] Write Rust tests that exercise JPEG/PNG/WebP inspection, resizing, invalid input, quality/format validation, and metadata behavior through the core API.
- [ ] Run `cargo test --manifest-path wasm/Cargo.toml` and confirm the new tests fail before the core exists.
- [ ] Move the compression implementation into `core.rs`, with no `wasm_bindgen` or `JsValue` dependency in that module.
- [ ] Adapt `lib.rs` WASM exports to delegate to the core while preserving the current JavaScript signatures.
- [ ] Run `cargo test --manifest-path wasm/Cargo.toml` and the existing browser WASM build; both must pass.
- [ ] Commit with `refactor: extract platform-neutral compression core`.

### Task 2: Native Rust C ABI

**Files:**
- Create: `wasm/src/ffi.rs`
- Modify: `wasm/src/lib.rs`
- Modify: `wasm/Cargo.toml`

**Interfaces:**
- Produces exported native functions `image_compress`, `image_compress_free`, and `image_compress_error_free` with explicit Rust-owned buffer/error ownership.
- Consumes the Task 1 core API only; the FFI layer does not duplicate compression logic.

- [ ] Add Rust tests for successful FFI compression, invalid input, null/invalid arguments, and allocation/free behavior.
- [ ] Run the targeted Rust tests and verify they fail because the FFI functions do not exist.
- [ ] Implement `#[no_mangle] extern "C"` functions with panic containment and stable primitive/UTF-8 inputs; return status plus pointer/length values without exposing Rust layout-dependent types.
- [ ] Ensure every Rust allocation returned to callers has exactly one matching exported free function.
- [ ] Build the crate as a native `cdylib` and run all Rust tests.
- [ ] Commit with `feat: expose native image compression ABI`.

### Task 3: .NET interop and CLI with tests

**Files:**
- Create: `dotnet/ImageCompress.Dnx/ImageCompress.Dnx.csproj`
- Create: `dotnet/ImageCompress.Dnx/Program.cs`
- Create: `dotnet/ImageCompress.Dnx/CliOptions.cs`
- Create: `dotnet/ImageCompress.Dnx/NativeMethods.cs`
- Create: `dotnet/ImageCompress.Dnx/ImageCompressor.cs`
- Create: `dotnet/ImageCompress.Dnx/NativeLibraryResolver.cs`
- Create: `dotnet/ImageCompress.Dnx.Tests/ImageCompress.Dnx.Tests.csproj`
- Create: `dotnet/ImageCompress.Dnx.Tests/CliOptionsTests.cs`
- Create: `dotnet/ImageCompress.Dnx.Tests/ImageCompressorTests.cs`
- Create: `ImageCompress.slnx`

**Interfaces:**
- `CliOptions.Parse(string[] args)` returns validated input/output/quality/format/dimensions/algorithm/metadata options.
- `ImageCompressor.Compress(ReadOnlySpan<byte> input, CompressionOptions options)` calls the native ABI and always releases Rust-owned memory.
- `NativeLibraryResolver` resolves the bundled native asset for the current RID.

- [ ] Create failing xUnit tests for defaults, all CLI switches, invalid quality/dimensions/format/algorithm, output-extension format inference, and missing input/output.
- [ ] Run `dotnet test` and verify the tests fail before parser implementation.
- [ ] Implement the minimum CLI parser and validation needed to pass those tests without adding a CLI framework dependency.
- [ ] Add integration tests using a generated/fixture image that validate output signature, dimensions, and native error propagation.
- [ ] Implement `LibraryImport` declarations, native resolver, safe copy/free logic, and the CLI entry point.
- [ ] Run `dotnet test ImageCompress.slnx -c Release` against the host native library and verify all tests pass.
- [ ] Commit with `feat: add ImageCompress DNX CLI`.

### Task 4: Cross-platform native packaging and real DNX smoke tests

**Files:**
- Modify: `dotnet/ImageCompress.Dnx/ImageCompress.Dnx.csproj`
- Create: `scripts/build-native.ps1`
- Create: `scripts/test-package.ps1`
- Create: `tests/fixtures/README.md` if fixture provenance/documentation is needed.

**Interfaces:**
- `build-native.ps1 -Rid <rid> -Output <dir>` emits the correctly named native library for that RID.
- `test-package.ps1 -PackageDirectory <dir> -Version <version>` creates a temporary NuGet source, runs `dnx ImageCompress.Dnx@<version> -- ...`, and validates the output file.

- [ ] Add a package-structure test that fails unless each required `runtimes/<rid>/native/` asset is present in the `.nupkg`.
- [ ] Implement native build script and package `<None Pack="true" PackagePath="runtimes/.../native/">` entries.
- [ ] Pack a CI version such as `0.0.0-ci.1` and inspect the `.nupkg` to verify all expected RID assets.
- [ ] Implement the smoke script to run the package via `dnx`, compress a fixture, and assert output existence/signature and non-zero size.
- [ ] Execute the smoke test on the host platform and verify success.
- [ ] Commit with `build: package native libraries in DNX tool`.

### Task 5: CI matrix and NuGet trusted publishing

**Files:**
- Create: `.github/workflows/dnx.yml`

**Interfaces:**
- Native matrix jobs upload per-RID native artifacts.
- Package job downloads all native artifacts, runs .NET tests, packs once, and exercises the package.
- Release job consumes only the verified package artifact.

- [ ] Add PR/push workflow jobs for Rust tests and native builds on Windows, Linux, and macOS, covering all intended RIDs where supported.
- [ ] Add a .NET test job that executes unit/integration tests on Windows, Linux, and macOS with the matching host native asset.
- [ ] Add package assembly with version `0.0.0-ci.${GITHUB_RUN_NUMBER}` for non-tags and `${GITHUB_REF_NAME#v}` for tags.
- [ ] Add package smoke tests through `dnx` on Windows, Linux, and macOS.
- [ ] Add `v*` tag validation requiring the tag commit to be in `origin/master` history.
- [ ] Add NuGet trusted-publishing login and `dotnet nuget push` using the verified `ImageCompress.Dnx.<version>.nupkg` artifact only.
- [ ] Validate workflow syntax and trigger a PR run.
- [ ] Commit with `ci: build test and publish DNX package`.

### Task 6: Documentation and final verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Documents installation-free `dnx` execution and pipeline usage.

- [ ] Add `dnx ImageCompress.Dnx -- input.png -o output.webp --quality 80` usage and an example GitHub Actions step with .NET 10 setup.
- [ ] Document supported formats, resize switches, metadata option, and supported platforms.
- [ ] Run fresh Rust tests, WASM production build, .NET Release tests, native host integration tests, package inspection, and the real `dnx` smoke test.
- [ ] Verify the PR workflow results after pushing the final commit; do not claim completion while any required check is pending or failing.
- [ ] Commit with `docs: document DNX image compressor`.
