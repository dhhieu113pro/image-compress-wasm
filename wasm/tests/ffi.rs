#![cfg(not(target_arch = "wasm32"))]
use std::ffi::CString;
use wasm_image_compress::{image_compress, image_compress_error_free, image_compress_free};

fn tiny_png() -> Vec<u8> {
    let img = image::RgbaImage::from_pixel(2, 2, image::Rgba([0, 128, 255, 255]));
    let mut out = Vec::new();
    image::DynamicImage::ImageRgba8(img).write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png).unwrap();
    out
}

#[test]
fn ffi_returns_owned_compressed_buffer() {
    let input = tiny_png(); let format = CString::new("webp").unwrap(); let alg = CString::new("Lanczos3").unwrap();
    let result = image_compress(input.as_ptr(), input.len(), 80, 1, 1, format.as_ptr(), alg.as_ptr(), true);
    assert_eq!(result.status, 0); assert!(!result.data.is_null()); assert!(result.len > 0);
    image_compress_free(result.data, result.len);
}

#[test]
fn ffi_returns_error_for_empty_input() {
    let format = CString::new("png").unwrap(); let alg = CString::new("Lanczos3").unwrap();
    let result = image_compress(std::ptr::null(), 0, 80, 0, 0, format.as_ptr(), alg.as_ptr(), true);
    assert_ne!(result.status, 0); assert!(!result.error.is_null()); image_compress_error_free(result.error);
}
