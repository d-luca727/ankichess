use crate::{error::AnkiChessError, services::lichessdb_service::LichessdbService};
use crate::services::import_service::ImportService;
use crate::state::AppState;
use tauri::{AppHandle, Emitter, Runtime, State, Window};
use crate::models::puzzle::{CsvImportPayload, ImportOptions};

pub const IMPORT_STATUS_EVENT: &str = "IMPORT_STATUS";

#[tauri::command]
pub async fn import_puzzles_from_db<R: Runtime>(
    window: Window<R>,
    payload: ImportOptions,
    app_handle: AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<(), AnkiChessError> {
    let col_arc = state.col.clone();
    let app_handle_clone = app_handle.clone();

    let db_path = LichessdbService::get_sqlite_db_path(&app_handle)?;

    app_handle
        .emit(
            IMPORT_STATUS_EVENT,
            "Import started... The app may be slow.", 
        )
        .ok();

    tokio::task::spawn_blocking(move || {
        let import_result = (|| -> Result<i64, AnkiChessError> {
            let mut col = col_arc.lock()?;
            ImportService::import_from_lichess_db(&mut col, payload, db_path, &window)
    
        })();

        match import_result {
            Ok(count) => {
                let msg = format!("Import completed. Added {} new notes.", count); 
                app_handle_clone.emit(IMPORT_STATUS_EVENT, msg).ok();
            }
            Err(e) => {
                let error_msg = format!("Error during import: {}", e.to_string()); 
                app_handle_clone.emit(IMPORT_STATUS_EVENT, error_msg).ok();
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn import_puzzles_from_csv<R: Runtime>(
    window: Window<R>,
    payload: CsvImportPayload,
    app_handle: AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<(), AnkiChessError> {
    let col_arc = state.col.clone();
    let app_handle_clone = app_handle.clone();

    tokio::task::spawn_blocking(move || {
        let import_result = (|| -> Result<i64, AnkiChessError> {
            let mut col = col_arc.lock()?;
            ImportService::import_from_csv(&mut col, payload, &window)
        })();

        match import_result {
            Ok(count) => {
                let msg = format!(
                    "CSV Import completed. Added {} new notes.", 
                    count
                );
                app_handle_clone.emit(IMPORT_STATUS_EVENT, msg).ok();
            }
            Err(e) => {
                let error_msg = format!("Error during CSV import: {}", e.to_string()); 
                app_handle_clone.emit(IMPORT_STATUS_EVENT, error_msg).ok();
            }
        }
    });

    Ok(())
}
