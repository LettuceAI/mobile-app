use tauri::AppHandle;

use super::service;
use super::types::{CreationGoal, CreationSession, DraftCharacter, UploadedImage};

#[tauri::command]
pub fn creation_helper_start(
    creation_goal: Option<CreationGoal>,
) -> Result<CreationSession, String> {
    service::start_session(creation_goal.unwrap_or(CreationGoal::Character))
}

#[tauri::command]
pub fn creation_helper_get_session(session_id: String) -> Result<Option<CreationSession>, String> {
    service::get_session(&session_id)
}

#[tauri::command]
pub async fn creation_helper_send_message(
    app: AppHandle,
    session_id: String,
    message: String,
    uploaded_images: Option<Vec<UploadedImageArg>>,
    request_id: Option<String>,
) -> Result<CreationSession, String> {
    let images = uploaded_images.map(|imgs| {
        imgs.into_iter()
            .map(|img| (img.id, img.data, img.mime_type))
            .collect()
    });
    service::send_message(app, session_id, message, images, request_id).await
}

#[tauri::command]
pub async fn creation_helper_regenerate(
    app: AppHandle,
    session_id: String,
    request_id: Option<String>,
) -> Result<CreationSession, String> {
    service::regenerate_response(app, session_id, request_id).await
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadedImageArg {
    pub id: String,
    pub data: String,
    pub mime_type: String,
}

#[tauri::command]
pub fn creation_helper_get_draft(session_id: String) -> Result<Option<DraftCharacter>, String> {
    service::get_draft(&session_id)
}

#[tauri::command]
pub fn creation_helper_cancel(app: AppHandle, session_id: String) -> Result<(), String> {
    service::cancel_session(&app, &session_id)
}

#[tauri::command]
pub fn creation_helper_complete(session_id: String) -> Result<DraftCharacter, String> {
    service::complete_session(&session_id)
}

#[tauri::command]
pub fn creation_helper_get_uploaded_image(
    session_id: String,
    image_id: String,
) -> Result<Option<UploadedImage>, String> {
    service::get_uploaded_image(&session_id, &image_id)
}

#[tauri::command]
pub fn creation_helper_get_images(session_id: String) -> Result<Vec<UploadedImage>, String> {
    service::get_all_uploaded_images(&session_id)
}
