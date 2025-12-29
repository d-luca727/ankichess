use crate::error::AnkiChessError;
use crate::services::deck_service::DeckService;
use crate::state::AppState;
use tauri::State;

use crate::models::deck::{DeckInfo, DeckLimitsPayload};


#[tauri::command]
pub fn create_deck(deck_name: String, state: State<AppState>) -> Result<i64, AnkiChessError> {
    let mut col = state.col.lock()?;

    DeckService::create_deck(&mut col, &deck_name)
}

#[tauri::command]
pub fn get_all_decks(state: State<AppState>) -> Result<Vec<DeckInfo>, AnkiChessError> {
    let mut col = state.col.lock()?;
    DeckService::get_all_decks(&mut col)
}

#[tauri::command]
pub fn delete_deck(deck_id: i64, state: State<AppState>) -> Result<(), AnkiChessError> {
    let mut col = state.col.lock()?;
    DeckService::delete_deck(&mut col, deck_id)
}

#[tauri::command]
pub fn get_deck_limits(
    deck_id: i64,
    state: State<AppState>,
) -> Result<DeckLimitsPayload, AnkiChessError> {
    let mut col = state.col.lock()?;
    DeckService::get_deck_limits(&mut col, deck_id)
}

#[tauri::command]
pub fn set_deck_limits(
    deck_id: i64,
    limits: DeckLimitsPayload,
    state: State<AppState>,
) -> Result<(), AnkiChessError> {
    let mut col = state.col.lock()?;
    DeckService::set_deck_limits(&mut col, deck_id, limits)
}

#[tauri::command]
pub async fn export_deck_to_csv(
    deck_id: i64,
    file_path: String,
    state: State<'_, AppState>,
) -> Result<usize, AnkiChessError> {
    let col_arc = state.col.clone();
    DeckService::export_deck_csv(col_arc, deck_id, file_path).await
}

