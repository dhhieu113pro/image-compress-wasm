use fast_image_resize as fr;
use image::{codecs::jpeg::JpegEncoder, codecs::png::PngEncoder, DynamicImage, ImageFormat, ImageReader};
use std::{fmt, num::NonZeroU32};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ImageInfo {
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub size: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OutputFormat { Jpeg, Png, WebP }

impl OutputFormat {
    pub fn parse(value: &str) -> Result<Self, CompressionError> {
        match value.to_ascii_lowercase().as_str() {
            "jpeg" | "jpg" => Ok(Self::Jpeg),
            "png" => Ok(Self::Png),
            "webp" => Ok(Self::WebP),
            _ => Err(CompressionError::new("Unsupported output format")),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ResizeAlgorithm { Lanczos3, CatmullRom, Triangle }

impl ResizeAlgorithm {
    pub fn parse(value: &str) -> Result<Self, CompressionError> {
        match value.to_ascii_lowercase().as_str() {
            "lanczos3" => Ok(Self::Lanczos3),
            "catmullrom" => Ok(Self::CatmullRom),
            "triangle" => Ok(Self::Triangle),
            _ => Err(CompressionError::new("Unsupported resize algorithm")),
        }
    }
}

#[derive(Clone, Debug)]
pub struct CompressionOptions {
    pub quality: u8,
    pub max_width: Option<u32>,
    pub max_height: Option<u32>,
    pub output_format: OutputFormat,
    pub resize_algorithm: ResizeAlgorithm,
    pub remove_metadata: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompressionError(String);
impl CompressionError { pub fn new(message: impl Into<String>) -> Self { Self(message.into()) } }
impl fmt::Display for CompressionError { fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result { f.write_str(&self.0) } }
impl std::error::Error for CompressionError {}

pub fn inspect_core(bytes: &[u8]) -> Result<ImageInfo, CompressionError> {
    let reader = ImageReader::new(std::io::Cursor::new(bytes)).with_guessed_format().map_err(|e| CompressionError::new(format!("Failed to parse image format: {e}")))?;
    let format = reader.format().ok_or_else(|| CompressionError::new("Unknown or unsupported image format"))?;
    let (width, height) = reader.into_dimensions().map_err(|e| CompressionError::new(format!("Failed to read image dimensions: {e}")))?;
    let format = match format { ImageFormat::Jpeg => "JPEG", ImageFormat::Png => "PNG", ImageFormat::WebP => "WebP", _ => "Unsupported" }.to_string();
    Ok(ImageInfo { width, height, format, size: bytes.len() })
}

pub fn compress_core(bytes: &[u8], options: &CompressionOptions) -> Result<Vec<u8>, CompressionError> {
    if !(1..=100).contains(&options.quality) { return Err(CompressionError::new("Quality must be between 1 and 100")); }
    if matches!(options.max_width, Some(0)) || matches!(options.max_height, Some(0)) { return Err(CompressionError::new("Maximum dimensions must be greater than zero")); }

    let reader = ImageReader::new(std::io::Cursor::new(bytes)).with_guessed_format().map_err(|e| CompressionError::new(format!("Failed to read format: {e}")))?;
    let original_format = reader.format();
    let mut img = reader.decode().map_err(|e| CompressionError::new(format!("Failed to decode image: {e}")))?;
    let (target_width, target_height) = calculate_dimensions(img.width(), img.height(), options.max_width, options.max_height);
    if target_width != img.width() || target_height != img.height() { img = resize_internal(img, target_width, target_height, options.resize_algorithm)?; }

    let mut output = Vec::new();
    match options.output_format {
        OutputFormat::Jpeg => img.write_with_encoder(JpegEncoder::new_with_quality(&mut output, options.quality)).map_err(|e| CompressionError::new(format!("JPEG encode error: {e}")))?,
        OutputFormat::Png => img.write_with_encoder(PngEncoder::new(&mut output)).map_err(|e| CompressionError::new(format!("PNG encode error: {e}")))?,
        OutputFormat::WebP => {
            let rgba = img.to_rgba8();
            output = zenwebp::EncodeRequest::lossy(&zenwebp::LossyConfig::new().with_quality(options.quality as f32), &rgba, zenwebp::PixelLayout::Rgba8, img.width(), img.height()).encode().map_err(|e| CompressionError::new(format!("WebP encode error: {e:?}")))?;
        }
    }
    if !options.remove_metadata && options.output_format == OutputFormat::Jpeg && original_format == Some(ImageFormat::Jpeg) { output = copy_jpeg_exif(bytes, &output); }
    Ok(output)
}

fn calculate_dimensions(width: u32, height: u32, max_width: Option<u32>, max_height: Option<u32>) -> (u32, u32) {
    let (mut w, mut h) = (width, height);
    if let (Some(max_w), Some(max_h)) = (max_width, max_height) {
        let ratio = (max_w as f64 / width as f64).min(max_h as f64 / height as f64);
        if ratio < 1.0 { w = (width as f64 * ratio).round() as u32; h = (height as f64 * ratio).round() as u32; }
    } else if let Some(max_w) = max_width {
        if width > max_w { let ratio = max_w as f64 / width as f64; w = max_w; h = (height as f64 * ratio).round() as u32; }
    } else if let Some(max_h) = max_height {
        if height > max_h { let ratio = max_h as f64 / height as f64; h = max_h; w = (width as f64 * ratio).round() as u32; }
    }
    (w.max(1), h.max(1))
}

fn resize_internal(img: DynamicImage, target_width: u32, target_height: u32, algorithm: ResizeAlgorithm) -> Result<DynamicImage, CompressionError> {
    let width = NonZeroU32::new(img.width()).ok_or_else(|| CompressionError::new("Source width is zero"))?;
    let height = NonZeroU32::new(img.height()).ok_or_else(|| CompressionError::new("Source height is zero"))?;
    let src = fr::Image::from_vec_u8(width, height, img.to_rgba8().into_raw(), fr::PixelType::U8x4).map_err(|e| CompressionError::new(format!("Failed to create source image: {e}")))?;
    let mut dst = fr::Image::new(NonZeroU32::new(target_width).unwrap(), NonZeroU32::new(target_height).unwrap(), src.pixel_type());
    let alg = match algorithm { ResizeAlgorithm::CatmullRom => fr::ResizeAlg::Convolution(fr::FilterType::CatmullRom), ResizeAlgorithm::Triangle => fr::ResizeAlg::Convolution(fr::FilterType::Bilinear), ResizeAlgorithm::Lanczos3 => fr::ResizeAlg::Convolution(fr::FilterType::Lanczos3) };
    fr::Resizer::new(alg).resize(&src.view(), &mut dst.view_mut()).map_err(|e| CompressionError::new(format!("Failed to resize image: {e}")))?;
    let buffer = image::ImageBuffer::<image::Rgba<u8>, _>::from_raw(target_width, target_height, dst.buffer().to_vec()).ok_or_else(|| CompressionError::new("Failed to create destination image buffer"))?;
    Ok(DynamicImage::ImageRgba8(buffer))
}

fn copy_jpeg_exif(original: &[u8], compressed: &[u8]) -> Vec<u8> {
    if original.len() < 4 || compressed.len() < 4 || original[..2] != [0xFF, 0xD8] || compressed[..2] != [0xFF, 0xD8] { return compressed.to_vec(); }
    let mut offset = 2;
    while offset + 4 <= original.len() {
        if original[offset] != 0xFF { break; }
        let marker = original[offset + 1];
        if marker == 0xD9 { break; }
        let length = ((original[offset + 2] as usize) << 8) | original[offset + 3] as usize;
        if offset + 2 + length > original.len() { break; }
        if marker == 0xE1 {
            let segment = &original[offset..offset + 2 + length];
            let mut result = Vec::with_capacity(compressed.len() + segment.len());
            result.extend_from_slice(&compressed[..2]); result.extend_from_slice(segment); result.extend_from_slice(&compressed[2..]); return result;
        }
        offset += if marker == 0xD8 || marker == 0x01 || (0xD0..=0xD7).contains(&marker) { 2 } else { 2 + length };
    }
    compressed.to_vec()
}
