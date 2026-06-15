use std::fs;
use std::path::PathBuf;

const APP_DIR_NAME: &str = "QMSDesktop";

pub struct StoragePaths {
    pub root: PathBuf,
    pub database: PathBuf,
    pub settings: PathBuf,
    pub license: PathBuf,
    pub uploads_documents: PathBuf,
    pub uploads_capa: PathBuf,
    pub uploads_risks: PathBuf,
    pub uploads_complaints: PathBuf,
    pub uploads_audits: PathBuf,
    pub uploads_nc: PathBuf,
    pub backups: PathBuf,
}

/// Resolve %APPDATA%\QMSDesktop on Windows. QMS Desktop is a Windows-only product.
pub fn get_app_storage_root() -> Result<PathBuf, String> {
    let appdata = std::env::var("APPDATA")
        .map_err(|_| "APPDATA environment variable not set".to_string())?;
    Ok(PathBuf::from(appdata).join(APP_DIR_NAME))
}

pub fn get_storage_paths() -> Result<StoragePaths, String> {
    let root = get_app_storage_root()?;
    Ok(StoragePaths {
        database:           root.join("data.db"),
        settings:           root.join("settings.json"),
        license:            root.join("license.json"),
        uploads_documents:  root.join("uploads").join("documents"),
        uploads_capa:       root.join("uploads").join("capa"),
        uploads_risks:      root.join("uploads").join("risks"),
        uploads_complaints: root.join("uploads").join("complaints"),
        uploads_audits:     root.join("uploads").join("audits"),
        uploads_nc:         root.join("uploads").join("nc"),
        backups:            root.join("backups"),
        root,
    })
}

pub fn create_storage_directories(paths: &StoragePaths) -> Result<(), String> {
    let dirs = [
        &paths.root,
        &paths.uploads_documents,
        &paths.uploads_capa,
        &paths.uploads_risks,
        &paths.uploads_complaints,
        &paths.uploads_audits,
        &paths.uploads_nc,
        &paths.backups,
    ];
    for dir in &dirs {
        fs::create_dir_all(dir)
            .map_err(|e| format!("Failed to create directory {:?}: {}", dir, e))?;
    }
    Ok(())
}

/// Create settings.json and license.json with minimal placeholder content if they do not exist.
pub fn create_placeholder_files(paths: &StoragePaths) -> Result<(), String> {
    if !paths.settings.exists() {
        let content = r#"{"company_name":"","company_logo_path":"","timezone":"UTC","date_format":"YYYY-MM-DD"}"#;
        fs::write(&paths.settings, content)
            .map_err(|e| format!("Failed to create settings.json: {}", e))?;
    }
    if !paths.license.exists() {
        let content = r#"{"status":"unlicensed","activated_at":null,"hardware_id":null,"token":null}"#;
        fs::write(&paths.license, content)
            .map_err(|e| format!("Failed to create license.json: {}", e))?;
    }
    Ok(())
}

pub fn uploads_initialized(paths: &StoragePaths) -> bool {
    paths.uploads_documents.exists()
        && paths.uploads_capa.exists()
        && paths.uploads_risks.exists()
        && paths.uploads_complaints.exists()
        && paths.uploads_audits.exists()
        && paths.uploads_nc.exists()
        && paths.backups.exists()
}
