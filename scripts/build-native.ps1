param([Parameter(Mandatory=$true)][string]$Rid,[string]$Output="artifacts/native")
$ErrorActionPreference='Stop'
$targets=@{'win-x64'='x86_64-pc-windows-msvc';'win-arm64'='aarch64-pc-windows-msvc';'linux-x64'='x86_64-unknown-linux-gnu';'linux-arm64'='aarch64-unknown-linux-gnu';'osx-x64'='x86_64-apple-darwin';'osx-arm64'='aarch64-apple-darwin'}
if(-not $targets.ContainsKey($Rid)){throw "Unsupported RID: $Rid"}
$target=$targets[$Rid]; rustup target add $target; cargo build --manifest-path wasm/Cargo.toml --release --target $target
$dir=Join-Path $Output $Rid; New-Item -ItemType Directory -Force $dir|Out-Null
if($Rid.StartsWith('win-')){$src="wasm/target/$target/release/wasm_image_compress.dll";$dst=Join-Path $dir 'image_compress.dll'}elseif($Rid.StartsWith('osx-')){$src="wasm/target/$target/release/libwasm_image_compress.dylib";$dst=Join-Path $dir 'libimage_compress.dylib'}else{$src="wasm/target/$target/release/libwasm_image_compress.so";$dst=Join-Path $dir 'libimage_compress.so'}
Copy-Item $src $dst -Force
