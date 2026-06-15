use std::io::Write;
use std::path::Path;

#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    let dest = Path::new(&path);

    // Refuse to write to non-filesystem paths (e.g. UNC or device paths)
    if !dest.is_absolute() {
        return Err("Path must be absolute".to_string());
    }

    // Create any intermediate directories the user's chosen path requires
    if let Some(parent) = dest.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Could not create directory: {}", e))?;
        }
    }

    let mut file = std::fs::File::create(dest)
        .map_err(|e| format!("Could not create file '{}': {}", dest.display(), e))?;

    file.write_all(content.as_bytes())
        .map_err(|e| format!("Could not write file: {}", e))?;

    Ok(())
}
