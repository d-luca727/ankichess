use crate::{models::lichessdb::DbStatus, repository::puzzle_repo::PuzzleRepository, services::lichessdb_service::LichessdbService, state::AppState};
use tauri::{AppHandle, Emitter, Runtime, State, Window};
use crate::AppBootstrapData;


const DATABASE_READY_EVENT: &str = "DATABASE_READY";
const DATABASE_ERROR_EVENT: &str = "DATABASE_ERROR";

#[tauri::command]
pub fn get_puzzle_db_status<R: Runtime>(app_handle: AppHandle<R>) -> Result<DbStatus, String> {
    LichessdbService::get_status(&app_handle).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_for_update<R: Runtime>(app_handle: AppHandle<R>) -> Result<bool, String> {
    LichessdbService::check_for_update(&app_handle)
        .await 
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn start_database_download_and_index<R: Runtime>(
    window: Window<R>,
    app_handle: AppHandle<R>,
) -> Result<(), String> {
    tokio::spawn(async move {
        let result = LichessdbService::download_and_index(window.clone(), app_handle.clone()).await;

        if let Err(e) = result {
            window.emit(DATABASE_ERROR_EVENT, e.to_string()).ok();
        } else {
            if let Ok(status) = get_puzzle_db_status(app_handle) {
                window.emit(DATABASE_READY_EVENT, status).ok();
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn cleanup_unused_puzzles(state: State<AppState>) -> Result<usize, String> {
    let col_guard = state.col.lock().map_err(|e| e.to_string())?;
    
    let db = col_guard.storage.db();

    db.execute("BEGIN TRANSACTION", []).map_err(|e| e.to_string())?;

    let result = PuzzleRepository::delete_unused_puzzles(db);

    match result {
        Ok(count) => {
            db.execute("COMMIT", []).map_err(|e| e.to_string())?;
            Ok(count)
        },
        Err(e) => {
            
            db.execute("ROLLBACK", []).ok();
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub fn get_bootstrap_data(state: tauri::State<AppState>) -> AppBootstrapData {
    (*state.bootstrap_data).clone()
}

