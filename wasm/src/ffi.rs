use crate::{compress_core, CompressionOptions, OutputFormat, ResizeAlgorithm};
use std::{ffi::{CStr, CString}, os::raw::c_char, panic::catch_unwind, ptr};

#[repr(C)]
pub struct NativeResult { pub status: i32, pub data: *mut u8, pub len: usize, pub error: *mut c_char }

impl NativeResult {
    fn ok(mut bytes: Vec<u8>) -> Self { let result = Self { status: 0, data: bytes.as_mut_ptr(), len: bytes.len(), error: ptr::null_mut() }; std::mem::forget(bytes); result }
    fn error(message: impl Into<String>) -> Self { let safe = message.into().replace('\0', " "); let error = CString::new(safe).unwrap().into_raw(); Self { status: 1, data: ptr::null_mut(), len: 0, error } }
}

fn string_arg(ptr: *const c_char, name: &str) -> Result<String, String> {
    if ptr.is_null() { return Err(format!("{name} is null")); }
    unsafe { CStr::from_ptr(ptr) }.to_str().map(str::to_owned).map_err(|_| format!("{name} is not UTF-8"))
}

#[no_mangle]
pub extern "C" fn image_compress(input: *const u8, input_len: usize, quality: u8, max_width: u32, max_height: u32, output_format: *const c_char, algorithm: *const c_char, remove_metadata: bool) -> NativeResult {
    match catch_unwind(|| {
        if input.is_null() || input_len == 0 { return Err("Input buffer is null or empty".to_string()); }
        let format = OutputFormat::parse(&string_arg(output_format, "output_format")?).map_err(|e| e.to_string())?;
        let algorithm = ResizeAlgorithm::parse(&string_arg(algorithm, "algorithm")?).map_err(|e| e.to_string())?;
        let input = unsafe { std::slice::from_raw_parts(input, input_len) };
        let options = CompressionOptions { quality, max_width: (max_width != 0).then_some(max_width), max_height: (max_height != 0).then_some(max_height), output_format: format, resize_algorithm: algorithm, remove_metadata };
        compress_core(input, &options).map_err(|e| e.to_string())
    }) { Ok(Ok(bytes)) => NativeResult::ok(bytes), Ok(Err(message)) => NativeResult::error(message), Err(_) => NativeResult::error("Native compression panicked") }
}

#[no_mangle]
pub extern "C" fn image_compress_free(data: *mut u8, len: usize) { if !data.is_null() { unsafe { drop(Vec::from_raw_parts(data, len, len)); } } }

#[no_mangle]
pub extern "C" fn image_compress_error_free(error: *mut c_char) { if !error.is_null() { unsafe { drop(CString::from_raw(error)); } } }
