use anki::decks::DeckId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Clone)]
pub struct DeckInfo {
    pub id: DeckId,
    pub name: String,
    pub new_count: u32,
    pub learn_count: u32,
    pub due_count: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeckLimitsPayload {
    pub new_cards_per_day: u32,
    pub reviews_per_day: u32,
}
