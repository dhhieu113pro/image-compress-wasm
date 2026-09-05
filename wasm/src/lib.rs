mod core;
#[cfg(not(target_arch = "wasm32"))]
mod ffi;

pub use core::{compress_core, inspect_core, CompressionError, CompressionOptions, ImageInfo as CoreImageInfo, OutputFormat, ResizeAlgorithm};

use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init() { console_error_panic_hook::set_once(); }

#[wasm_bindgen(getter_with_clone)]
#[derive(Clone)]
pub struct ImageInfo { pub width: u32, pub height: u32, pub format: String, pub size: usize }

#[wasm_bindgen]
pub fn get_image_info(bytes: &[u8]) -> Result<ImageInfo, JsValue> {
    let info = inspect_core(bytes).map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(ImageInfo { width: info.width, height: info.height, format: info.format, size: info.size })
}

#[wasm_bindgen]
pub fn compress_image(bytes: &[u8], quality: u8, max_width: Option<u32>, max_height: Option<u32>, output_format: &str, resize_algorithm: &str, remove_metadata: bool) -> Result<Vec<u8>, JsValue> {
    let options = CompressionOptions {
        quality,
        max_width,
        max_height,
        output_format: OutputFormat::parse(output_format).map_err(|e| JsValue::from_str(&e.to_string()))?,
        resize_algorithm: ResizeAlgorithm::parse(resize_algorithm).map_err(|e| JsValue::from_str(&e.to_string()))?,
        remove_metadata,
    };
    compress_core(bytes, &options).map_err(|e| JsValue::from_str(&e.to_string()))
}
