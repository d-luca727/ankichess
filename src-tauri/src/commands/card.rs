use crate::{services::note_service::NoteService};
use crate::error::AnkiChessError;
use crate::state::AppState;
use anki::card::CardId;
use anki::prelude::TimestampMillis;
use anki::scheduler::answering::{CardAnswer, Rating};
use tauri::{command, State};

use crate::models::card::*;

#[command]
pub fn add_chess_note(
    payload: AddNotePayload,
    state: State<AppState>,
) -> Result<i64, AnkiChessError> {
    let mut col = state.col.lock()?;
    NoteService::create_note(&mut col, payload)
}

#[command]
pub fn delete_notes(note_ids: Vec<i64>, state: State<AppState>) -> Result<(), AnkiChessError> {
    let mut col = state.col.lock()?;
    NoteService::delete_notes(&mut col, note_ids)
}

#[command]
pub fn get_next_card(
    deck_id: i64,
    state: State<AppState>,
) -> Result<Option<StudyCard>, AnkiChessError> {
    let mut col = state.col.lock()?;
    NoteService::get_next_study_card(&mut col, deck_id)
}

#[command]
pub fn browse_cards_in_deck(
    options: BrowseOptions,
    state: State<AppState>,
) -> Result<PaginatedBrowseResult, AnkiChessError> {
    let mut col = state.col.lock()?;
    NoteService::browse_cards(&mut col, options)
}

#[command]
pub fn answer_card(card_id: i64, rating: u8, state: State<AppState>) -> Result<(), AnkiChessError> {
    let mut col = state.col.lock()?;
    let states = col.get_scheduling_states(CardId(card_id))?;

    let (rating_enum, new_state) = match rating {
        1 => (Rating::Again, states.again),
        2 => (Rating::Hard, states.hard),
        3 => (Rating::Good, states.good),
        4 => (Rating::Easy, states.easy),
        _ => {
            return Err(AnkiChessError::InvalidInput(
                "Invalid rating. Use 1 (Again), 2 (Hard), 3 (Good), or 4 (Easy).".to_string(),
            ))
        }
    };

    let mut answer = CardAnswer {
        card_id: CardId(card_id),
        current_state: states.current,
        new_state,
        rating: rating_enum,
        answered_at: TimestampMillis::now(),
        milliseconds_taken: 0,
        custom_data: None,
        from_queue: true,
    };

    col.answer_card(&mut answer)?;
    Ok(())
}

#[command]
pub fn get_card_by_id(
    card_id: i64,
    state: State<AppState>,
) -> Result<BrowseCardInfo, AnkiChessError> {
    let mut col = state.col.lock()?;
    NoteService::get_card_details(&mut col, card_id)
}

#[command]
pub fn update_chess_note(
    payload: UpdateNotePayload,
    state: State<AppState>,
) -> Result<(), AnkiChessError> {
    let mut col = state.col.lock()?;
    NoteService::update_note(&mut col, payload)
}