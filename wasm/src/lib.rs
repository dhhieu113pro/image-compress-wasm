use wasm_bindgen::prelude::*;
use image::{DynamicImage, ImageReader, ImageFormat};
use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::PngEncoder;
use fast_image_resize as fr;
use std::num::NonZeroU32;

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen(getter_with_clone)]
#[derive(Clone)]
pub struct ImageInfo {
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub size: usize,
}

#[wasm_bindgen]
pub fn get_image_info(bytes: &[u8]) -> Result<ImageInfo, JsValue> {
    let reader = ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| JsValue::from_str(&format!("Failed to parse image format: {}", e)))?;
    
    let format = reader.format().ok_or_else(|| JsValue::from_str("Unknown or unsupported image format"))?;
    let (width, height) = reader.into_dimensions().map_err(|e| JsValue::from_str(&format!("Failed to read image dimensions: {}", e)))?;
    
    let format_str = match format {
        ImageFormat::Jpeg => "JPEG",
        ImageFormat::Png => "PNG",
        ImageFormat::WebP => "WebP",
        _ => "Unsupported",
    }.to_string();

    Ok(ImageInfo {
        width,
        height,
        format: format_str,
        size: bytes.len(),
    })
}

#[wasm_bindgen]
pub fn compress_image(
    bytes: &[u8],
    quality: u8, // 1 to 100
    max_width: Option<u32>,
    max_height: Option<u32>,
    output_format: &str, // "jpeg" | "png" | "webp"
    resize_algorithm: &str, // "Lanczos3" | "CatmullRom" | "Triangle"
    remove_metadata: bool,
) -> Result<Vec<u8>, JsValue> {
    let reader = ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| JsValue::from_str(&format!("Failed to read format: {}", e)))?;
    
    let original_format = reader.format();
    let mut img = reader.decode().map_err(|e| JsValue::from_str(&format!("Failed to decode image: {}", e)))?;
    
    let width = img.width();
    let height = img.height();
    
    let (target_width, target_height) = calculate_dimensions(width, height, max_width, max_height);
    
    if target_width != width || target_height != height {
        img = resize_internal(img, target_width, target_height, resize_algorithm)?;
    }
    
    let final_width = img.width();
    let final_height = img.height();
    
    let mut output = Vec::new();
    match output_format.to_lowercase().as_str() {
        "jpeg" | "jpg" => {
            img.write_with_encoder(JpegEncoder::new_with_quality(&mut output, quality))
                .map_err(|e| JsValue::from_str(&format!("JPEG encode error: {}", e)))?;
        }
        "png" => {
            // PNG is lossless, so quality parameter doesn't alter visual details directly
            img.write_with_encoder(PngEncoder::new(&mut output))
                .map_err(|e| JsValue::from_str(&format!("PNG encode error: {}", e)))?;
        }
        "webp" => {
            let rgba = img.to_rgba8();
            let layout = zenwebp::PixelLayout::Rgba8;
            let webp_bytes = zenwebp::EncodeRequest::lossy(
                &zenwebp::LossyConfig::new().with_quality(quality as f32),
                &rgba,
                layout,
                final_width,
                final_height,
            ).encode().map_err(|e| JsValue::from_str(&format!("WebP encode error: {:?}", e)))?;
            output = webp_bytes;
        }
        _ => return Err(JsValue::from_str("Unsupported output format")),
    }
    
    if !remove_metadata && output_format.to_lowercase() == "jpeg" && original_format == Some(ImageFormat::Jpeg) {
        output = copy_jpeg_exif(bytes, &output);
    }
    
    Ok(output)
}

fn calculate_dimensions(
    width: u32,
    height: u32,
    max_width: Option<u32>,
    max_height: Option<u32>,
) -> (u32, u32) {
    let mut new_width = width;
    let mut new_height = height;

    if let (Some(max_w), Some(max_h)) = (max_width, max_height) {
        let ratio_w = max_w as f64 / width as f64;
        let ratio_h = max_h as f64 / height as f64;
        let ratio = ratio_w.min(ratio_h);
        if ratio < 1.0 {
            new_width = (width as f64 * ratio).round() as u32;
            new_height = (height as f64 * ratio).round() as u32;
        }
    } else if let Some(max_w) = max_width {
        if width > max_w {
            let ratio = max_w as f64 / width as f64;
            new_width = max_w;
            new_height = (height as f64 * ratio).round() as u32;
        }
    } else if let Some(max_h) = max_height {
        if height > max_h {
            let ratio = max_h as f64 / height as f64;
            new_height = max_h;
            new_width = (width as f64 * ratio).round() as u32;
        }
    }

    (new_width.max(1), new_height.max(1))
}

fn resize_internal(
    img: DynamicImage,
    target_width: u32,
    target_height: u32,
    resize_algorithm: &str,
) -> Result<DynamicImage, JsValue> {
    let width = NonZeroU32::new(img.width()).ok_or_else(|| JsValue::from_str("Source width is zero"))?;
    let height = NonZeroU32::new(img.height()).ok_or_else(|| JsValue::from_str("Source height is zero"))?;
    
    let rgba8 = img.to_rgba8();
    let src_image = fr::Image::from_vec_u8(
        width,
        height,
        rgba8.into_raw(),
        fr::PixelType::U8x4,
    ).map_err(|e| JsValue::from_str(&format!("Failed to create source image: {}", e)))?;

    let dst_width = NonZeroU32::new(target_width).ok_or_else(|| JsValue::from_str("Destination width is zero"))?;
    let dst_height = NonZeroU32::new(target_height).ok_or_else(|| JsValue::from_str("Destination height is zero"))?;
    let mut dst_image = fr::Image::new(
        dst_width,
        dst_height,
        src_image.pixel_type(),
    );

    let alg = match resize_algorithm.to_lowercase().as_str() {
        "catmullrom" => fr::ResizeAlg::Convolution(fr::FilterType::CatmullRom),
        "triangle" => fr::ResizeAlg::Convolution(fr::FilterType::Bilinear),
        _ => fr::ResizeAlg::Convolution(fr::FilterType::Lanczos3),
    };

    let mut resizer = fr::Resizer::new(alg);
    resizer.resize(&src_image.view(), &mut dst_image.view_mut())
        .map_err(|e| JsValue::from_str(&format!("Failed to resize image: {}", e)))?;

    let img_buffer = image::ImageBuffer::<image::Rgba<u8>, _>::from_raw(
        target_width,
        target_height,
        dst_image.buffer().to_vec(),
    ).ok_or_else(|| JsValue::from_str("Failed to create destination image buffer"))?;

    Ok(DynamicImage::ImageRgba8(img_buffer))
}

fn copy_jpeg_exif(original: &[u8], compressed: &[u8]) -> Vec<u8> {
    if original.len() < 4 || compressed.len() < 4 {
        return compressed.to_vec();
    }
    if original[0] != 0xFF || original[1] != 0xD8 || compressed[0] != 0xFF || compressed[1] != 0xD8 {
        return compressed.to_vec();
    }

    let mut exif_segment: Option<&[u8]> = None;
    let mut offset = 2;
    while offset + 4 <= original.len() {
        if original[offset] != 0xFF {
            break;
        }
        let marker = original[offset + 1];
        if marker == 0xD9 {
            break;
        }
        let length = ((original[offset + 2] as usize) << 8) | (original[offset + 3] as usize);
        if offset + 2 + length > original.len() {
            break;
        }
        if marker == 0xE1 {
            exif_segment = Some(&original[offset..(offset + 2 + length)]);
            break;
        }
        if marker == 0xD8 || marker == 0x01 || (marker >= 0xD0 && marker <= 0xD7) {
            offset += 2;
        } else {
            offset += 2 + length;
        }
    }

    if let Some(segment) = exif_segment {
        let mut result = Vec::with_capacity(compressed.len() + segment.len());
        result.extend_from_slice(&compressed[0..2]);
        result.extend_from_slice(segment);
        result.extend_from_slice(&compressed[2..]);
        result
    } else {
        compressed.to_vec()
    }
}
