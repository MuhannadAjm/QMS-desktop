mod audits;
mod auth;
mod backup;
mod capa;
mod complaints;
mod dashboard;
mod documents;
mod files;
mod license;
mod non_conformities;
mod profile;
mod reports;
mod risks;
mod settings_cmd;
mod storage;
mod users;

pub use audits::{
    add_audit_finding, attach_audit_file, create_audit, create_nc_from_audit_finding,
    get_audit, get_audit_activity, list_audit_attachments, list_audit_findings,
    list_audits, open_audit_attachment, set_audit_status, update_audit,
    update_audit_finding,
};
pub use auth::{check_first_admin_exists, create_first_admin, login};
pub use capa::{
    attach_capa_file, create_capa, get_capa, get_capa_activity, list_capa_attachments,
    list_capas, open_capa_attachment, set_capa_status, update_capa,
};
pub use complaints::{
    attach_complaint_file, create_capa_from_complaint, create_complaint,
    create_nc_from_complaint, get_complaint, get_complaint_activity,
    list_complaint_attachments, list_complaints, open_complaint_attachment,
    set_complaint_status, update_complaint,
};
pub use documents::{
    attach_document_file, create_document, get_document, get_document_activity,
    list_document_revisions, list_documents, open_document_file, set_document_status,
    update_document,
};
pub use backup::{
    create_local_backup, get_backup_status, open_backups_folder,
    restore_local_backup, validate_backup_path,
};
pub use dashboard::{
    get_dashboard_high_risks, get_dashboard_open_ncs, get_dashboard_overdue_capas,
    get_dashboard_recent_activity, get_dashboard_summary,
};
pub use files::write_text_file;
pub use license::{
    activate_license_online, clear_local_license_dev_only,
    create_dev_license_for_current_machine, get_hardware_fingerprint,
    get_license_details, get_license_status, import_license_token,
    validate_license_online, validate_local_license,
};
pub use profile::{change_own_password, update_own_profile};
pub use reports::{
    get_audit_report, get_capa_report, get_complaint_report,
    get_document_register_report, get_nc_report, get_risk_report,
};
pub use non_conformities::{
    attach_nc_file, create_capa_from_non_conformity, create_non_conformity,
    get_non_conformity, get_non_conformity_activity, list_nc_attachments,
    list_non_conformities, open_nc_attachment, set_non_conformity_status,
    update_non_conformity,
};
pub use risks::{
    attach_risk_file, create_capa_from_risk, create_nc_from_risk, create_risk,
    get_risk, get_risk_activity, list_risk_attachments, list_risks,
    open_risk_attachment, set_risk_status, update_risk,
};
pub use settings_cmd::{get_settings, update_setting};
pub use storage::{get_app_storage_status, initialize_app_storage};
pub use users::{
    create_user, list_users, list_users_minimal, reset_user_password, set_user_status,
    update_user,
};
