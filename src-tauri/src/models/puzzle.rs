use serde::Deserialize;

#[derive(Debug, Deserialize, Clone)]
pub struct ImportOptions {
    pub deck_id: i64,
    pub min_rating: Option<u32>,
    pub max_rating: Option<u32>,
    pub min_popularity: Option<i32>,
    pub max_popularity: Option<i32>,
    pub limit: Option<usize>,
    pub themes: Option<Vec<String>>,
    pub opening_tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct CsvImportPayload {
    pub deck_id: i64,
    pub csv_content: String,
}

//full lichess open db data
#[derive(Debug, Deserialize)]
pub struct PuzzleRecord {
    #[serde(rename = "PuzzleId")]
    pub puzzle_id: String,
    #[serde(rename = "FEN")]
    pub fen: String,
    #[serde(rename = "Moves")]
    pub moves: String,
    #[serde(rename = "Rating")]
    pub rating: u32,
    #[serde(rename = "RatingDeviation")] 
    pub rating_deviation: i32,
    #[serde(rename = "Popularity")]
    pub popularity: i32,
    #[serde(rename = "NbPlays")]        
    pub nb_plays: i32,
    #[serde(rename = "Themes")]
    pub themes: String,
    #[serde(rename = "GameUrl")]      
    pub game_url: String,
    #[serde(rename = "OpeningTags")]    
    pub opening_tags: Option<String>,  
}

use serde::{Serialize};
use uuid::Uuid;

use crate::models::card::AddNotePayload;


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChessPuzzle {
    pub puzzle_id: String,
    pub fen: String,
    pub moves: String,
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

impl Default for ChessPuzzle {
    fn default() -> Self {
        Self {
            puzzle_id: "".to_string(),
            fen: "".to_string(),
            moves: "".to_string(),
            rating: 0,
            rating_deviation: 0,
            popularity: 0,
            nb_plays: 0,
            themes: "manual".to_string(),
            game_url: "".to_string(),
            opening_tags: "".to_string(),
            comment: "".to_string(),
            has_setup_move: false,
        }
    }
}






impl From<AddNotePayload> for ChessPuzzle {
    fn from(payload: AddNotePayload) -> Self {
        Self {
            
            puzzle_id: Uuid::new_v4().simple().to_string(),
            
            fen: payload.fen,
            moves: payload.solution, 
            rating: payload.rating.unwrap_or(0),
            themes: payload.themes.unwrap_or_else(|| "manual".to_string()),
            game_url: payload.game_url.unwrap_or_default(),
            opening_tags: payload.opening_tags.unwrap_or_default(),
            comment: payload.comment.unwrap_or_default(),
            
            
            has_setup_move: false, 
            rating_deviation: 0,
            popularity: 0,
            nb_plays: 0,
        }
    }
}