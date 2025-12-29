use serde::{Deserialize, Serialize};

#[derive(Deserialize, Debug, Clone)]
pub struct AddNotePayload {
    pub deck_id: i64,
    pub fen: String,
    pub solution: String, 
    pub comment: Option<String>,
    pub rating: Option<i32>,
    pub themes: Option<String>,
    pub game_url: Option<String>,
    pub opening_tags: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNotePayload {
    pub note_id: i64,
    pub fen: String,
    pub solution: String,
    pub comment: String,
}


#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BrowseOptions {
    pub deck_id: i64,
    pub page: usize,
    pub page_size: usize,
    pub filter_text: Option<String>, 
    pub sort_order: Option<String>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BrowseCardInfo {
    
    pub card_id: i64,
    pub note_id: i64,
    
    
    pub puzzle_id: String,      
    pub fen: String,
    pub solution: String,       
    pub rating: i32,
    pub rating_deviation: i32,
    pub popularity: i32,
    pub nb_plays: i32,
    pub themes: String,
    pub game_url: String,
    pub opening_tags: String,
    pub comment: String,
    pub has_setup_move: bool,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedBrowseResult {
    pub cards: Vec<BrowseCardInfo>,
    pub total_cards: usize,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StudyCard {
    
    pub card_id: i64,
    pub note_id: i64,
    pub deck_id: i64,
    
    pub again_secs: u32,
    pub hard_secs: u32,
    pub good_secs: u32,
    pub easy_secs: u32,

    
    pub puzzle_id: String,
    pub fen: String,
    pub moves: Vec<String>, 
    pub rating: i32,
    pub rating_deviation: i32, 
    pub popularity: i32,
    pub nb_plays: i32,         
    pub themes: String,
    pub game_url: String,      
    pub opening_tags: String,  
    pub comment: String,
    pub has_setup_move: bool,
}