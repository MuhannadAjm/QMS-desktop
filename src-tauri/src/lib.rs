mod commands;
mod db;
mod license;
mod password;
mod permissions;
mod storage;

use commands::{
    activate_license_online,
    add_audit_finding,
    attach_audit_file,
    attach_capa_file,
    attach_complaint_file,
    attach_document_file,
    get_document_file_info,
    read_document_file,
    print_document_file,
    remove_document_attachment,
    approve_document,
    reject_document,
    attach_nc_file,
    attach_risk_file,
    change_own_password,
    check_first_admin_exists,
    clear_local_license_dev_only,
    create_audit,
    create_capa,
    create_capa_from_complaint,
    create_capa_from_non_conformity,
    create_capa_from_risk,
    create_complaint,
    create_customer,
    create_dev_license_for_current_machine,
    create_document,
    create_first_admin,
    create_local_backup,
    create_nc_from_audit_finding,
    create_nc_from_complaint,
    create_nc_from_risk,
    create_non_conformity,
    create_risk,
    create_risk_source,
    create_role,
    create_user,
    delete_backup,
    get_app_storage_status,
    get_audit,
    get_audit_activity,
    get_audit_report,
    get_backup_status,
    get_capa,
    get_capa_activity,
    get_capa_report,
    get_complaint,
    get_complaint_activity,
    get_complaint_report,
    get_dashboard_high_risks,
    get_dashboard_open_ncs,
    get_dashboard_overdue_capas,
    get_dashboard_recent_activity,
    get_dashboard_summary,
    get_document,
    get_document_activity,
    get_document_register_report,
    get_hardware_fingerprint,
    get_license_details,
    get_license_status,
    get_my_permissions,
    get_nc_report,
    get_non_conformity,
    get_non_conformity_activity,
    get_risk,
    get_risk_activity,
    get_risk_report,
    get_role_permissions,
    get_settings,
    get_user_rbac,
    import_license_token,
    initialize_app_storage,
    list_all_risk_sources,
    list_audit_attachments,
    list_audit_findings,
    list_audits,
    list_capa_attachments,
    list_capa_responsible_candidates,
    list_capas,
    list_complaint_attachments,
    list_complaints,
    list_customer_options,
    list_customers,
    list_document_revisions,
    list_documents,
    list_lead_auditor_candidates,
    list_nc_attachments,
    list_non_conformities,
    list_permissions,
    list_record_owner_candidates,
    list_risk_attachments,
    list_risk_sources,
    list_risks,
    list_roles,
    list_users,
    login,
    open_audit_attachment,
    open_backups_folder,
    open_capa_attachment,
    open_complaint_attachment,
    open_document_file,
    open_nc_attachment,
    open_risk_attachment,
    rename_risk_source,
    reorder_risk_sources,
    reset_user_overrides,
    reset_user_password,
    restore_local_backup,
    set_audit_status,
    set_capa_status,
    set_complaint_status,
    set_customer_active,
    set_document_status,
    set_non_conformity_status,
    set_risk_source_active,
    set_risk_status,
    set_role_active,
    set_role_permissions,
    set_user_eligibility,
    set_user_override,
    set_user_role,
    set_user_status,
    update_audit,
    update_audit_finding,
    update_capa,
    update_complaint,
    update_customer,
    update_document,
    update_non_conformity,
    update_own_profile,
    update_risk,
    update_role,
    update_setting,
    update_user,
    validate_backup_path,
    validate_import_backup,
    validate_license_online,
    validate_local_license,
    export_text_file,
};

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Listener, Manager};

fn build_app_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Menu<R>> {
    // File menu — backup items start disabled; enabled after user logs in via auth-changed event
    let create_backup_item  = MenuItem::with_id(app, "create-backup",        "Create Backup",     false, None::<&str>)?;
    let restore_backup_item = MenuItem::with_id(app, "restore-backup",       "Restore Backup…",   false, None::<&str>)?;
    let open_backups_item   = MenuItem::with_id(app, "open-backups-folder",  "Open Backup Folder", false, None::<&str>)?;
    let sep_file            = PredefinedMenuItem::separator(app)?;
    let quit_item           = MenuItem::with_id(app, "quit", "Exit", true, None::<&str>)?;
    let file_menu = Submenu::with_items(app, "File", true, &[
        &create_backup_item,
        &restore_backup_item,
        &open_backups_item,
        &sep_file,
        &quit_item,
    ])?;

    // View menu
    let toggle_sidebar_item = MenuItem::with_id(app, "toggle-sidebar",    "Toggle Sidebar",     true, None::<&str>)?;
    let reload_item         = MenuItem::with_id(app, "reload",            "Reload",             true, Some("Ctrl+R"))?;
    let sep_view1           = PredefinedMenuItem::separator(app)?;
    let fullscreen_item     = MenuItem::with_id(app, "toggle-fullscreen", "Toggle Full Screen", true, Some("F11"))?;
    let sep_view2           = PredefinedMenuItem::separator(app)?;
    let zoom_in_item        = MenuItem::with_id(app, "zoom-in",           "Zoom In",            true, Some("Ctrl+Equal"))?;
    let zoom_out_item       = MenuItem::with_id(app, "zoom-out",          "Zoom Out",           true, Some("Ctrl+Minus"))?;
    let zoom_reset_item     = MenuItem::with_id(app, "zoom-reset",        "Reset Zoom",         true, Some("Ctrl+0"))?;
    let view_menu = Submenu::with_items(app, "View", true, &[
        &toggle_sidebar_item,
        &reload_item,
        &sep_view1,
        &fullscreen_item,
        &sep_view2,
        &zoom_in_item,
        &zoom_out_item,
        &zoom_reset_item,
    ])?;

    // Tools menu — Settings requires login; License always accessible (works at license gate too)
    let settings_item = MenuItem::with_id(app, "navigate-settings", "Settings", false, None::<&str>)?;
    let license_item  = MenuItem::with_id(app, "navigate-license",  "License",  true,  None::<&str>)?;
    let tools_menu = Submenu::with_items(app, "Tools", true, &[&settings_item, &license_item])?;

    // Help menu
    let help_item          = MenuItem::with_id(app, "help",             "Help",             true, None::<&str>)?;
    let support_item       = MenuItem::with_id(app, "support",          "Support",          true, None::<&str>)?;
    let tell_friend_item   = MenuItem::with_id(app, "tell-a-friend",    "Tell a Friend",    true, None::<&str>)?;
    let check_updates_item = MenuItem::with_id(app, "check-for-updates","Check for Updates",true, None::<&str>)?;
    let sep_help           = PredefinedMenuItem::separator(app)?;
    let about_item         = MenuItem::with_id(app, "about",            "About QMS Desktop",true, None::<&str>)?;
    let help_menu = Submenu::with_items(app, "Help", true, &[
        &help_item,
        &support_item,
        &tell_friend_item,
        &check_updates_item,
        &sep_help,
        &about_item,
    ])?;

    Menu::with_items(app, &[&file_menu, &view_menu, &tools_menu, &help_menu])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let menu = build_app_menu(app.handle())?;
            app.set_menu(menu)?;

            // Listen for auth state changes from the frontend.
            // Enables or disables backup menu items based on login state.
            let h = app.handle().clone();
            app.handle().clone().listen("auth-changed", move |event| {
                let authenticated: bool =
                    serde_json::from_str(event.payload()).unwrap_or(false);
                if let Some(menu) = h.menu() {
                    for id in ["create-backup", "restore-backup", "open-backups-folder", "navigate-settings"] {
                        if let Some(item) = menu.get(id) {
                            if let tauri::menu::MenuItemKind::MenuItem(mi) = item {
                                mi.set_enabled(authenticated).ok();
                            }
                        }
                    }
                }
            });

            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            match id {
                "quit" => {
                    app.exit(0);
                }
                "toggle-fullscreen" => {
                    if let Some(w) = app.get_webview_window("main") {
                        let is_fs = w.is_fullscreen().unwrap_or(false);
                        w.set_fullscreen(!is_fs).ok();
                    }
                }
                "reload" => {
                    if let Some(w) = app.get_webview_window("main") {
                        w.eval("location.reload()").ok();
                    }
                }
                // All other actions are forwarded to the frontend via event
                other => {
                    if let Some(w) = app.get_webview_window("main") {
                        w.emit("menu-action", other).ok();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            initialize_app_storage,
            get_app_storage_status,
            check_first_admin_exists,
            create_first_admin,
            login,
            list_users,
            create_user,
            update_user,
            set_user_status,
            reset_user_password,
            update_own_profile,
            change_own_password,
            get_settings,
            update_setting,
            list_documents,
            get_document,
            create_document,
            update_document,
            set_document_status,
            attach_document_file,
            get_document_file_info,
            read_document_file,
            print_document_file,
            remove_document_attachment,
            approve_document,
            reject_document,
            list_document_revisions,
            get_document_activity,
            open_document_file,
            export_text_file,
            list_capas,
            get_capa,
            create_capa,
            update_capa,
            set_capa_status,
            get_capa_activity,
            attach_capa_file,
            open_capa_attachment,
            list_capa_attachments,
            list_risks,
            get_risk,
            create_risk,
            update_risk,
            set_risk_status,
            get_risk_activity,
            attach_risk_file,
            open_risk_attachment,
            list_risk_attachments,
            create_nc_from_risk,
            create_capa_from_risk,
            list_complaints,
            get_complaint,
            create_complaint,
            update_complaint,
            set_complaint_status,
            get_complaint_activity,
            attach_complaint_file,
            open_complaint_attachment,
            list_complaint_attachments,
            create_nc_from_complaint,
            create_capa_from_complaint,
            list_audits,
            get_audit,
            create_audit,
            update_audit,
            set_audit_status,
            list_audit_findings,
            add_audit_finding,
            update_audit_finding,
            create_nc_from_audit_finding,
            attach_audit_file,
            open_audit_attachment,
            list_audit_attachments,
            get_audit_activity,
            list_non_conformities,
            get_non_conformity,
            create_non_conformity,
            update_non_conformity,
            set_non_conformity_status,
            create_capa_from_non_conformity,
            attach_nc_file,
            open_nc_attachment,
            list_nc_attachments,
            get_non_conformity_activity,
            get_dashboard_summary,
            get_dashboard_recent_activity,
            get_dashboard_overdue_capas,
            get_dashboard_high_risks,
            get_dashboard_open_ncs,
            get_document_register_report,
            get_capa_report,
            get_risk_report,
            get_complaint_report,
            get_audit_report,
            get_nc_report,
            get_backup_status,
            create_local_backup,
            delete_backup,
            open_backups_folder,
            validate_backup_path,
            restore_local_backup,
            validate_import_backup,
            list_risk_sources,
            list_all_risk_sources,
            create_risk_source,
            rename_risk_source,
            set_risk_source_active,
            reorder_risk_sources,
            list_customer_options,
            list_customers,
            create_customer,
            update_customer,
            set_customer_active,
            list_permissions,
            get_my_permissions,
            list_roles,
            get_role_permissions,
            create_role,
            update_role,
            set_role_active,
            set_role_permissions,
            get_user_rbac,
            set_user_role,
            set_user_override,
            reset_user_overrides,
            list_capa_responsible_candidates,
            list_record_owner_candidates,
            list_lead_auditor_candidates,
            set_user_eligibility,
            get_hardware_fingerprint,
            get_license_status,
            get_license_details,
            validate_local_license,
            import_license_token,
            clear_local_license_dev_only,
            create_dev_license_for_current_machine,
            activate_license_online,
            validate_license_online,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
