use wasm_image_compress::{compress_core, inspect_core, CompressionOptions, OutputFormat, ResizeAlgorithm};

fn tiny_png() -> Vec<u8> {
    let img = image::RgbaImage::from_pixel(2, 2, image::Rgba([255, 0, 0, 255]));
    let mut out = Vec::new();
    image::DynamicImage::ImageRgba8(img)
        .write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png)
        .unwrap();
    out
}

#[test]
fn inspect_reports_dimensions_and_format() {
    let bytes = tiny_png();
    let info = inspect_core(&bytes).unwrap();
    assert_eq!((info.width, info.height), (2, 2));
    assert_eq!(info.format, "PNG");
}

#[test]
fn compress_resizes_and_converts_to_webp() {
    let bytes = tiny_png();
    let options = CompressionOptions {
        quality: 80,
        max_width: Some(1),
        max_height: Some(1),
        output_format: OutputFormat::WebP,
        resize_algorithm: ResizeAlgorithm::Lanczos3,
        remove_metadata: true,
    };
    let out = compress_core(&bytes, &options).unwrap();
    let info = inspect_core(&out).unwrap();
    assert_eq!((info.width, info.height), (1, 1));
    assert_eq!(info.format, "WebP");
}

#[test]
fn invalid_quality_is_rejected() {
    let bytes = tiny_png();
    let options = CompressionOptions {
        quality: 0,
        max_width: None,
        max_height: None,
        output_format: OutputFormat::Jpeg,
        resize_algorithm: ResizeAlgorithm::Lanczos3,
        remove_metadata: true,
    };
    assert!(compress_core(&bytes, &options).is_err());
}
