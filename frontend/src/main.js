import init, { get_image_info, compress_image } from './pkg/wasm_image_compress.js';

let originalBytes = null;
let originalName = 'image';
let lastResult = null;
let lastResultUrl = null;

const $ = (id) => document.getElementById(id);
const fmt = (n) => n > 1048576 ? `${(n / 1048576).toFixed(2)} MB` : n > 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;

function showLoading() { $('dropzone').classList.add('loading'); }
function hideLoading() { $('dropzone').classList.remove('loading'); }

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
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('dragging');
    processFile(e.dataTransfer.files[0]);
  });
  input.addEventListener('change', () => processFile(input.files[0]));
  dz.addEventListener('paste', (e) => {
    const item = [...e.clipboardData.items].find((it) => it.type.startsWith('image/'));
    if (item) processFile(item.getAsFile());
  });

  $('compare-slider').addEventListener('input', onCompareSlide);

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
  <h1>Image Compressor</h1>
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
</main>
<style>
  :root { color-scheme: dark; font-family: system-ui, sans-serif; }
  body { margin: 0; background: #111318; color: #e6e8ee; }
  main { max-width: 860px; margin: 0 auto; padding: 24px; }
  h1 { margin: 0 0 4px; }
  .sub { margin: 0 0 16px; color: #9aa0ad; }
  #dropzone { border: 2px dashed #3a4050; border-radius: 12px; padding: 40px; text-align: center;
    position: relative; color: #9aa0ad; cursor: pointer; transition: border-color .2s; }
  #dropzone.dragging, #dropzone:hover { border-color: #5b8def; }
  #loading { display: none; position: absolute; inset: 0; align-items: center; justify-content: center;
    gap: 10px; background: rgba(17,19,24,.7); border-radius: 12px; color: #e6e8ee; font-weight: 600; }
  #loading::before { content: ""; width: 20px; height: 20px; border: 3px solid #5b8def; border-top-color: transparent;
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
  .compare img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; background: #0c0e12; }
  #preview { clip-path: inset(0 50% 0 0); }
  .divider { position: absolute; top: 0; bottom: 0; left: 50%; width: 2px; background: #fff; opacity: .8; }
  .divider span { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 34px; height: 34px;
    background: #fff; border-radius: 50%; border: 2px solid #5b8def; }
  .compare-bar { display: flex; align-items: center; gap: 12px; margin-top: 8px; font-size: 13px; color: #9aa0ad; }
  .compare-bar input { flex: 1; }
  .controls { flex: 1; display: flex; flex-direction: column; gap: 12px; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
  label.check { flex-direction: row; align-items: center; }
  .error { color: #ff6b6b; min-height: 1.2em; margin-top: 8px; }
  .result { border-top: 1px solid #2a2f3a; padding-top: 12px; }
  .result p { margin: 4px 0; }
  .btn { display: inline-block; margin-top: 8px; padding: 8px 16px; background: #5b8def;
    color: #fff; border-radius: 6px; text-decoration: none; }
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
