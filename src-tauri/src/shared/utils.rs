use anki::decks::DeckId;
use anki::prelude::Collection;
use anki_proto::cards::CardId as ProtoCardId;
use anki_proto::notes::NoteId as ProtoNoteId;
use crate::error::AnkiChessError;
pub fn to_proto_card_id(card_id: i64) -> ProtoCardId {
    ProtoCardId { cid: card_id }
}

pub fn _to_proto_note_id(note_id: i64) -> ProtoNoteId {
    ProtoNoteId { nid: note_id }
}

pub fn format_anki_sfld(canonical_id: &str, deck_name: &str) -> String {
    format!("{} ({})", canonical_id, deck_name)
}


pub fn get_deck_name(col: &mut Collection, deck_id: DeckId) -> Result<String, AnkiChessError> {
    match col.get_deck(deck_id)? {
        Some(deck) => Ok(deck.name.to_string()),
        None => Err(AnkiChessError::NotFound(format!("Deck with id {} not found", deck_id.0))),
    }
}