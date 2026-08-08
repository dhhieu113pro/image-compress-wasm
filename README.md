# Image Compressor (WASM)

Compress images entirely in your browser — or via a REST API — using a shared [Rust](https://rustwasm.github.io/) codec compiled to WebAssembly. No image ever leaves your device when using the frontend.

```
┌─────────────────────────┐     ┌─────────────────────┐     ┌──────────────┐
│  frontend/  (Vite UI)   │ ──► │ wasm/  (Rust codec) │ ──► │  output      │
│  netlify/functions/ API │ ──► │  (WebAssembly)      │     │  compressed  │
└─────────────────────────┘     └─────────────────────┘     └──────────────┘
```

## Repository layout

| Path                    | Purpose                                                        |
| ----------------------- | -------------------------------------------------------------- |
| `wasm/`                 | Rust codec compiled to WebAssembly (`get_image_info`, `compress_image`) |
| `frontend/`             | Vanilla JS + Vite SPA                                          |
| `netlify/functions/`    | Netlify Function exposing the compressor as a REST API         |

---

## Requirements

- [Node.js](https://nodejs.org) ≥ 18
- [Rust](https://rustup.rs) toolchain (for building the Rust→WASM codec)
- [`wasm-pack`](https://rustwasm.github.io/wasm-pack/installer/) (via `npm` in this repo)

---

## 1. Build

All Rust→WASM builds and the Vite bundle are wired through npm scripts in the root `package.json`.

```bash
# install dependencies
npm install
npm install --prefix frontend

# full build: web wasm + vite bundle + node wasm (for the API)
npm run build

# run the Vite dev server (rebuilds web wasm first)
npm run dev
```

The build produces:

- `frontend/src/pkg/` — ESM wasm module loaded by the web app
- `frontend/dist/` — deployable site
- `netlify/functions/wasm/` — CommonJS wasm module used by the API function

> `frontend/src/pkg/` and `netlify/functions/wasm/` are generated output and git-ignored; run `npm run build` before serving or locally testing the API.

### Build script reference

```jsonc
"build:wasm":     "wasm-pack build wasm --target web    --out-dir ../frontend/src/pkg",
"build:function": "wasm-pack build wasm --target nodejs --out-dir ../netlify/functions/wasm",
"build":          "build:wasm && vite build && build:function"
```

---

## 2. Use in your website (JavaScript)

After `npm run build`, import the generated wasm module from
`frontend/src/pkg/wasm_image_compress.js` (Vite handles the `.wasm` fetch automatically):

```js
import init, { compress_image, get_image_info } from './src/pkg/wasm_image_compress.js';

await init(); // instantiate the WebAssembly module

const input = document.querySelector('input[type=file]');
input.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  const bytes = new Uint8Array(await file.arrayBuffer());

  // (optional) inspect the image first
  const info = get_image_info(bytes);
  console.log(info); // { width, height, format, size }

  // compress: WebP re-encoded at quality 80
  const output = compress_image(
    bytes,        // Uint8Array
    80,           // quality 1..100
    null,         // maxWidth  (null = keep width)
    null,         // maxHeight (null = keep height)
    'webp',       // 'webp' | 'jpeg' | 'png'
    'Lanczos3',   // 'Lanczos3' | 'CatmullRom' | 'Triangle'
    false         // removeMetadata (strip EXIF)
  );

  const blob = new Blob([output], { type: 'image/webp' });
  const url = URL.createObjectURL(blob);
  document.querySelector('img').src = url;
});
```

### Function signature

```ts
compress_image(
  bytes: Uint8Array,            // source image bytes
  quality: u8,                  // 1..100 (JPEG/WebP)
  max_width: number | null,     // optional max width (maintains aspect ratio)
  max_height: number | null,    // optional max height
  output_format: string,        // "webp" | "jpeg" | "png"
  resize_algorithm: string,     // "Lanczos3" | "CatmullRom" | "Triangle"
  remove_metadata: boolean,     // strip EXIF etc.
): Uint8Array                   // compressed bytes
```

It runs **synchronously** (blocks briefly for large images) — keep it off the hot path or wrap it in a Web Worker for very large files.

---

## 3. REST API (Netlify Function)

The repo deploys to Netlify as a function. On your deployed site the endpoint is:

```
POST https://<your-site>.netlify.app/api/compress
```

It accepts the image **three** ways:

### 3.1 JSON with base64 (browser-friendly, has CORS)

```bash
curl -X POST https://<your-site>.netlify.app/api/compress \
  -H "Content-Type: application/json" \
  -d '{
        "image": "<base64-encoded-image-bytes>",
        "quality": 80,
        "format": "webp",
        "algorithm": "Lanczos3",
        "maxWidth": null,
        "maxHeight": null,
        "removeMetadata": false,
        "filename": "photo.png"
      }'
```

JavaScript:

```js
const input = document.querySelector('input[type=file]');
input.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  const bytes = new Uint8Array(await file.arrayBuffer());

  const res = await fetch('https://<your-site>.netlify.app/api/compress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: arrayBufferToBase64(bytes),
      quality: 80,
      format: 'webp',
      algorithm: 'Lanczos3',
      filename: file.name,
    }),
  });

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  document.querySelector('img').src = url;
});

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
```

### 3.2 Raw image bytes (simplest for curl)

```bash
curl -X POST https://<your-site>.netlify.app/api/compress \
  -H "Content-Type: image/png" \
  --data-binary "@photo.png" -o photo.webp
```

### 3.3 multipart/form-data

```bash
curl -X POST https://<your-site>.netlify.app/api/compress \
  -F "file=@photo.png" \
  -F "quality=80" \
  -F "format=webp"
```

### Response

- **200** — compressed image bytes (`Content-Type: image/webp`), with useful headers:

| Header                  | Meaning                              |
| ----------------------- | ------------------------------------ |
| `Content-Type`          | `image/webp` \| `image/jpeg` \| `image/png` |
| `Content-Disposition`   | suggested download filename          |
| `X-Original-Size`       | input size in bytes                  |
| `X-Compressed-Size`     | output size in bytes                 |
| `X-Savings-Percent`     | e.g. `15.1`                          |
| `X-Format`              | output format used                   |

- **400** — no image provided
- **405** — method not allowed (use `POST`)
- **422** — image decoded but compression produced no output
- **500** — error message in JSON `{ "error": "..." }`

---

## Local API testing

```bash
node -e "
const { handler } = require('./netlify/functions/compress.js');
const fs = require('fs');
const evt = {
  httpMethod: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ image: fs.readFileSync('photo.png').toString('base64'), format: 'webp' }),
};
handler(evt).then(r => {
  console.log(r.statusCode, r.headers['content-type'], r.headers['x-format']);
  fs.writeFileSync('out.webp', Buffer.from(r.body, 'base64'));
});
"
```

---

## Deployment (Netlify)

The included `netlify.toml` builds on every push:

```bash
# at repo root
netlify deploy --prod
# or connect the GitHub repo to Netlify and push
git push origin master
```

Netlify runs `npm run build` (compiling the Rust→WASM codec), publishes `frontend/dist`, and auto-discovers the `/api/compress` function in `netlify/functions/`.
