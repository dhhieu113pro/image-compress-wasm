import init, { get_image_info, compress_image } from './pkg/wasm_image_compress.js';

let originalBytes = null;
let originalName = 'image';
let lastResult = null;
let lastResultUrl = null;

const $ = (id) => document.getElementById(id);
const fmt = (n) => n > 1048576 ? `${(n / 1048576).toFixed(2)} MB` : n > 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;

function showLoading() { $('dropzone').classList.add('loading'); }
function hideLoading() { $('dropzone').classList.remove('loading'); }

// Convert a dragged-out image URL (from another tab/page) into a File.
async function urlToFile(url) {
  if (!url) return null;
  const res = await fetch(url);
  const blob = await res.blob();
  const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
  return new File([blob], `image.${ext}`, { type: blob.type });
}

async function processFile(file) {
  showLoading();
  try {
    await handleFile(file);
  } finally {
    hideLoading();
  }
}

async function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    $('error').textContent = 'Please drop an image file.';
    return;
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = get_image_info(bytes);
    originalBytes = bytes;
    originalName = file.name.replace(/\.[^.]+$/, '');
    $('error').textContent = '';
    $('info').textContent = `${info.format} · ${info.width}×${info.height} · ${fmt(info.size)}`;
    $('preview').src = URL.createObjectURL(file);
    $('dropzone').classList.add('has-image');
    $('size-before').textContent = fmt(info.size);
    $('compare-block').classList.remove('active');
    await compress();
    enableDownload();
  } catch (e) {
    $('error').textContent = `Error: ${e}`;
  }
}

async function compress() {
  if (!originalBytes) return;
  const quality = Number($('quality').value);
  const q = Number($('scale').value);
  const opts = { maxWidth: null, maxHeight: null, outputFormat: $('format').value };
  if (q < 100) {
    // scale is % of original; convert to a max dimension so aspect ratio is kept
    const info = get_image_info(originalBytes);
    opts.maxWidth = Math.round((info.width * q) / 100);
    opts.maxHeight = Math.round((info.height * q) / 100);
  }
  const output = compress_image(
    originalBytes,
    quality,
    opts.maxWidth,
    opts.maxHeight,
    opts.outputFormat,
    $('algorithm').value,
    $('metadata').checked
  );
  lastResult = new Blob([output], { type: `image/${opts.outputFormat === 'jpg' ? 'jpeg' : opts.outputFormat}` });
  if (lastResultUrl) URL.revokeObjectURL(lastResultUrl);
  lastResultUrl = URL.createObjectURL(lastResult);
  const resultImg = $('result-preview');
  resultImg.src = lastResultUrl;
  $('compare-block').classList.add('active');
  $('size-after').textContent = fmt(lastResult.size);
  $('savings').textContent = `${(100 * (1 - lastResult.size / originalBytes.length)).toFixed(1)}% smaller`;
}

function onCompareSlide() {
  // slider 0..100: show original (before) on the left, compressed (after) on the right
  $('preview').style.clipPath = `inset(0 ${100 - Number($('compare-slider').value)}% 0 0)`;
}

function enableDownload() {
  const a = $('download');
  a.hidden = !lastResult;
  if (lastResult) {
    a.href = lastResultUrl;
    a.download = `${originalName}.${$('format').value === 'jpeg' ? 'jpg' : $('format').value}`;
  }
}

function wireEvents() {
  const dz = $('dropzone');
  const input = $('file-input');

  dz.addEventListener('click', () => input.click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragging'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragging'));
  dz.addEventListener('drop', async (e) => {
    e.preventDefault();
    dz.classList.remove('dragging');
    const file = e.dataTransfer.files[0]
      || await urlToFile(e.dataTransfer.getData('text/uri-list'));
    processFile(file);
  });
  input.addEventListener('change', () => processFile(input.files[0]));
  dz.addEventListener('paste', (e) => {
    const item = [...e.clipboardData.items].find((it) => it.type.startsWith('image/'));
    if (item) processFile(item.getAsFile());
  });

  $('compare-slider').addEventListener('input', onCompareSlide);

  $('theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });

  for (const btn of document.querySelectorAll('.tab')) {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
      for (const name of ['raw', 'multipart', 'json']) {
        $('tab-' + name).hidden = btn.dataset.tab !== name;
      }
    });
  }

  for (const id of ['quality', 'scale', 'format', 'algorithm', 'metadata']) {
    const el = $(id);
    el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
      if (id === 'format') enableDownload();
      compress().then(enableDownload);
    });
  }
}

const html = `
<main>
  <header class="topbar">
    <h1>Image Compressor</h1>
    <button id="theme-toggle" class="theme-toggle" aria-label="Toggle dark/light theme" title="Toggle theme">
      <svg class="sun" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.42l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.42L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.42l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.42l-1.06-1.06zm1.06-12.37c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.42l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.42L19.42 4.58zM5.99 18.01l-1.06 1.06c-.39.39-.39 1.03 0 1.42s1.03.39 1.41 0l1.06-1.06c.39-.39.39-1.03 0-1.42s-1.03-.39-1.41 0z"/></svg>
      <svg class="moon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12.3 22h-.1c-5.5 0-10-4.5-10-10 0-4.8 3.5-8.9 8.3-9.7.5-.1 1 .3 1.1.8.1.5-.2 1-.7 1.2-3.8 1.4-6.3 5.1-6.3 9.2 0 4.1 3.4 7.5 7.5 7.5 3.8 0 7.1-2.9 7.5-6.7.1-.5.6-.9 1.1-.8.5.1.8.6.7 1.1-.8 4.6-4.8 8-9.6 8z"/></svg>
    </button>
  </header>
  <p class="sub">Compress images entirely in your browser via WebAssembly. No upload.</p>
  <div id="dropzone">
    <div id="loading" class="loading">Processing…</div>
    <p>Drop an image here, or click to browse. You can also paste.</p>
    <input id="file-input" type="file" accept="image/*" hidden />
  </div>
  <div id="error" class="error"></div>
  <div id="panel" class="panel">
    <div class="preview-col">
      <div id="compare-block">
        <div class="compare">
          <img id="preview" alt="original" />
          <img id="result-preview" alt="compressed" />
          <div class="divider"><span></span></div>
        </div>
        <div class="compare-bar">
          <span class="left">Original</span>
          <input id="compare-slider" type="range" min="0" max="100" value="50" />
          <span class="right">Compressed</span>
        </div>
      </div>
    </div>
    <div class="controls">
      <p id="info"></p>
      <label>Quality <input id="quality" type="range" min="1" max="100" value="80" /> <span id="quality-label"></span></label>
      <label>Scale <input id="scale" type="range" min="1" max="100" value="100" /> <span id="scale-label"></span>%</label>
      <label>Format
        <select id="format">
          <option value="webp">WebP</option>
          <option value="jpeg">JPEG</option>
          <option value="png">PNG</option>
        </select>
      </label>
      <label>Resize algorithm
        <select id="algorithm">
          <option value="Lanczos3">Lanczos3</option>
          <option value="CatmullRom">CatmullRom</option>
          <option value="Triangle">Triangle</option>
        </select>
      </label>
      <label><input id="metadata" type="checkbox" /> Remove metadata (EXIF)</label>
      <div class="result">
        <p>Before: <span id="size-before"></span></p>
        <p>After: <span id="size-after"></span></p>
        <p id="savings"></p>
        <a id="download" hidden class="btn">Download</a>
      </div>
    </div>
  </div>
  <section id="api">
    <h2>REST API</h2>
    <p class="sub">Compress an image over HTTP. Same wasm engine, no install needed.</p>

    <h3>Compress image</h3>
    <p class="endpoint"><code>POST /api/compress</code></p>
    <p>The response body is the compressed image. Send the file as raw bytes, multipart, or JSON.</p>

    <div class="tabs">
      <button class="tab active" data-tab="raw">Raw bytes</button>
      <button class="tab" data-tab="multipart">Multipart</button>
      <button class="tab" data-tab="json">JSON</button>
    </div>

    <pre class="code" id="tab-raw"><code>curl -X POST https://image-compress-wasm.netlify.app/api/compress \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@photo.png" \
  -o compressed.webp</code></pre>

    <pre class="code" id="tab-multipart" hidden><code>curl -X POST https://image-compress-wasm.netlify.app/api/compress \
  -F "file=@photo.png" \
  -F "quality=80" \
  -F "format=webp" \
  -o compressed.webp</code></pre>

    <pre class="code" id="tab-json" hidden><code>curl -X POST https://image-compress-wasm.netlify.app/api/compress \
  -H "Content-Type: application/json" \
  -d '{"image":"&lt;base64&gt;","quality":80,"format":"webp"}' \
  -o compressed.webp</code></pre>

    <h3>Request parameters</h3>
    <table>
      <tr><th>param</th><th>type</th><th>default</th><th>description</th></tr>
      <tr><td><code>quality</code></td><td>int</td><td>80</td><td>1–100 (JPEG/WebP)</td></tr>
      <tr><td><code>format</code></td><td>string</td><td>webp</td><td>webp | jpeg | png</td></tr>
      <tr><td><code>algorithm</code></td><td>string</td><td>Lanczos3</td><td>Lanczos3 | CatmullRom | Triangle</td></tr>
      <tr><td><code>removeMetadata</code></td><td>bool</td><td>false</td><td>strip EXIF</td></tr>
      <tr><td><code>maxWidth</code>/<code>maxHeight</code></td><td>int</td><td>null</td><td>resize bounds (keeps aspect)</td></tr>
    </table>

    <h3>Response</h3>
    <p>Returns <code>200</code> with the compressed image as the body and these headers. On error, <code>400</code> or <code>500</code> with a JSON <code>{ "error": "..." }</code> body.</p>
    <pre class="code"><code>HTTP/1.1 200 OK
Content-Type: image/webp
X-Original-Size: 335088
X-Compressed-Size: 167116
X-Savings-Percent: 50.2
X-Format: webp

&#60;binary compressed image bytes&#62;</code></pre>

  </section>
</main>
<style>
  :root { color-scheme: dark; font-family: system-ui, sans-serif;
    --bg: #111318; --fg: #e6e8ee; --muted: #9aa0ad; --border: #2a2f3a;
    --code-bg: #0c0e12; --surface: #1c2230; --accent: #5b8def; --danger: #ff6b6b;
    --img-bg: #0c0e12; --code-fg: #c9d1e4; --green: #7ee787; }
  :root[data-theme="light"] { color-scheme: light;
    --bg: #f6f7f9; --fg: #1b1f24; --muted: #5b6470; --border: #d8dce2;
    --code-bg: #f0f2f5; --surface: #ffffff; --accent: #3b6fe0; --danger: #d93025;
    --img-bg: #e7eaf0; --code-fg: #2b333e; --green: #1a7f37; }
  body { margin: 0; background: var(--bg); color: var(--fg); }
  main { max-width: 860px; margin: 0 auto; padding: 24px; }
  .topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .topbar h1 { margin: 0 0 4px; }
  .theme-toggle { background: var(--surface); color: var(--fg); border: 1px solid var(--border);
    width: 38px; height: 38px; border-radius: 8px; cursor: pointer; display: grid; place-items: center; }
  .theme-toggle svg { grid-area: 1/1; }
  .theme-toggle .sun { display: none; }
  :root[data-theme="dark"] .theme-toggle .moon { display: none; }
  :root[data-theme="dark"] .theme-toggle .sun { display: block; }
  .sub { margin: 0 0 16px; color: var(--muted); }
  #dropzone { border: 2px dashed var(--border); border-radius: 12px; padding: 40px; text-align: center;
    position: relative; color: var(--muted); cursor: pointer; transition: border-color .2s; }
  #dropzone.dragging, #dropzone:hover { border-color: var(--accent); }
  #loading { display: none; position: absolute; inset: 0; align-items: center; justify-content: center;
    gap: 10px; background: color-mix(in srgb, var(--bg) 70%, transparent); border-radius: 12px;
    color: var(--fg); font-weight: 600; }
  #loading::before { content: ""; width: 20px; height: 20px; border: 3px solid var(--accent); border-top-color: transparent;
    border-radius: 50%; animation: spin .8s linear infinite; }
  #dropzone.loading #loading { display: flex; }
  #dropzone.loading p { opacity: .15; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .panel { display: none; margin-top: 16px; gap: 24px; }
  #dropzone.has-image ~ #panel { display: flex; }
  .preview-col { flex: 1; }
  #compare-block { display: none; }
  #compare-block.active { display: block; }
  .compare { position: relative; height: 320px; border-radius: 8px; overflow: hidden; }
  .compare img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; background: var(--img-bg); }
  #preview { clip-path: inset(0 50% 0 0); }
  .divider { position: absolute; top: 0; bottom: 0; left: 50%; width: 2px; background: var(--fg); opacity: .8; }
  .divider span { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 34px; height: 34px;
    background: var(--fg); border-radius: 50%; border: 2px solid var(--accent); }
  .compare-bar { display: flex; align-items: center; gap: 12px; margin-top: 8px; font-size: 13px; color: var(--muted); }
  .compare-bar input { flex: 1; }
  .controls { flex: 1; display: flex; flex-direction: column; gap: 12px; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
  label.check { flex-direction: row; align-items: center; }
  .error { color: var(--danger); min-height: 1.2em; margin-top: 8px; }
  .result { border-top: 1px solid var(--border); padding-top: 12px; }
  .result p { margin: 4px 0; }
  .btn { display: inline-block; margin-top: 8px; padding: 8px 16px; background: var(--accent);
    color: #fff; border-radius: 6px; text-decoration: none; }
  #api { margin-top: 40px; border-top: 1px solid var(--border); padding-top: 20px; }
  #api h2 { margin: 0 0 4px; }
  #api h3 { margin: 24px 0 8px; font-size: 1rem; }
  .endpoint code { background: var(--surface); padding: 2px 8px; border-radius: 4px; color: var(--green); }
  .tabs { display: flex; gap: 8px; margin: 12px 0; }
  .tab { background: var(--surface); color: var(--muted); border: 1px solid var(--border); padding: 6px 14px;
    border-radius: 6px; cursor: pointer; font-size: 14px; }
  .tab.active { background: var(--accent); border-color: var(--accent); color: #fff; }
  pre.code { background: var(--code-bg); border: 1px solid var(--border); border-radius: 8px;
    padding: 14px 16px; overflow-x: auto; margin: 0; }
  pre.code code { background: none; padding: 0; color: var(--code-fg); font-size: 13px; }
  #api table { border-collapse: collapse; width: 100%; font-size: 13px; }
  #api th, #api td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--border); }
  #api th { color: var(--muted); font-weight: 600; }
  #api code { background: var(--surface); padding: 1px 5px; border-radius: 4px; font-size: .9em; }
</style>
`;

document.getElementById('app').innerHTML = html;
$('quality-label').textContent = $('quality').value;
$('scale-label').textContent = $('scale').value;
$('quality').addEventListener('input', () => { $('quality-label').textContent = $('quality').value; });
$('scale').addEventListener('input', () => { $('scale-label').textContent = $('scale').value; });
wireEvents();

init().then(() => {
  // wasm loaded; nothing else needed
});
