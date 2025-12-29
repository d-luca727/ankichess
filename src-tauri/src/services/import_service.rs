use std::path::PathBuf;
use std::time::Instant;
use rusqlite::{Connection};
use uuid::Uuid;
use csv;

use anki::{collection::Collection, prelude::*};
use tauri::{Emitter, Runtime, Window};

use crate::error::AnkiChessError;
use crate::models::puzzle::{ChessPuzzle, CsvImportPayload, ImportOptions};
use crate::repository::puzzle_repo::{ PuzzleRepository};
use crate::shared::utils::{format_anki_sfld, get_deck_name};


#[derive(Clone, serde::Serialize)]
struct ImportProgress {
    message: String,
    processed_count: usize,
    imported_count: usize,
    skipped_count: usize,
    total_to_import: Option<usize>,
}


#[derive(Debug)]
struct LichessDbRow {
    puzzle_id: String,
    fen: String,
    moves: String,
    rating: Option<u32>,
    rating_deviation: Option<i32>, 
    popularity: Option<i32>,
    nb_plays: Option<i32>,
    themes: String,
    game_url: Option<String>,
    opening_tags: Option<String>,
}

pub struct ImportService;

impl ImportService {


    
    
    
    pub fn import_from_lichess_db<R: Runtime>(
        col: &mut Collection,
        payload: ImportOptions,
        db_path: PathBuf,
        window: &Window<R>,
    ) -> Result<i64, AnkiChessError> {
        PuzzleRepository::init_tables(col.storage.db())?;
        let _start_time = Instant::now();

        
        let deck_id = DeckId(payload.deck_id);
        let deck_name = get_deck_name(col, deck_id)?;
        
        let nt_id = col.get_notetype_by_name("Basic")?
            .ok_or_else(|| AnkiChessError::NotFound("Notetype 'Basic' missing".into()))?.id;
        let nt = col.get_notetype(nt_id)?.unwrap();

        
        window.emit("import-progress", ImportProgress { 
            message: "Checking duplicates...".into(), processed_count: 0, imported_count: 0, skipped_count: 0, total_to_import: None 
        })?;
        
        let existing_ids = PuzzleRepository::get_existing_ids_in_deck(col.storage.db(), payload.deck_id)?;

        
        let conn = Connection::open(db_path)?;
        let mut query = "SELECT PuzzleId, FEN, Moves, Rating, RatingDeviation, Popularity, NbPlays, Themes, GameUrl, OpeningTags FROM puzzles WHERE 1=1".to_string();
        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        
        if let Some(min) = payload.min_rating { query.push_str(" AND Rating >= ?"); params_vec.push(Box::new(min)); }
        if let Some(max) = payload.max_rating { query.push_str(" AND Rating <= ?"); params_vec.push(Box::new(max)); }
        if let Some(min) = payload.min_popularity { query.push_str(" AND Popularity >= ?"); params_vec.push(Box::new(min)); }
        if let Some(max) = payload.max_popularity { query.push_str(" AND Popularity <= ?"); params_vec.push(Box::new(max)); }
        
        
        if let Some(themes) = payload.themes {
            let valid_themes: Vec<String> = themes.into_iter().filter(|t| !t.trim().is_empty()).collect();
            
            if !valid_themes.is_empty() {
                query.push_str(" AND ("); 
                for (i, theme) in valid_themes.iter().enumerate() {
                    if i > 0 {
                        query.push_str(" OR ");
                    }
                    query.push_str("Themes LIKE ?");
                    
                    params_vec.push(Box::new(format!("%{}%", theme.trim())));
                }
                query.push_str(")"); 
            }
        }
        
        if let Some(tags) = payload.opening_tags {
            let valid_tags: Vec<String> = tags.into_iter().filter(|t| !t.trim().is_empty()).collect();
            
            if !valid_tags.is_empty() {
                query.push_str(" AND (");
                for (i, tag) in valid_tags.iter().enumerate() {
                    if i > 0 {
                        query.push_str(" OR ");
                    }
                    query.push_str("OpeningTags LIKE ?");
                    params_vec.push(Box::new(format!("%{}%", tag.trim())));
                }
                query.push_str(")");
            }
        }

        if let Some(limit) = payload.limit { query.push_str(" LIMIT ?"); params_vec.push(Box::new(limit)); }

        let params_sql = rusqlite::params_from_iter(params_vec.iter().map(|p| p.as_ref()));
        let mut stmt = conn.prepare(&query)?;
        
        let puzzle_iter = stmt.query_map(params_sql, |row| {
            
            Ok(LichessDbRow {
                puzzle_id: row.get(0)?,
                fen: row.get(1)?,
                moves: row.get(2)?,
                rating: row.get(3).ok(),
                rating_deviation: row.get(4).ok(),
                popularity: row.get(5).ok(),
                nb_plays: row.get(6).ok(),
                themes: row.get(7)?,
                game_url: row.get(8).ok(),
                opening_tags: row.get(9).ok(),
            })
        })?;

        
        const BATCH_SIZE: usize = 500;
        let mut batch_puzzles: Vec<ChessPuzzle> = Vec::with_capacity(BATCH_SIZE);
        let mut batch_links: Vec<(i64, String)> = Vec::with_capacity(BATCH_SIZE);
        
        let mut processed_count = 0;
        let mut imported_count = 0;
        let mut skipped_count = 0;

        for puzzle_res in puzzle_iter {
            let row = puzzle_res?;
            processed_count += 1;

            
            if existing_ids.contains(&row.puzzle_id) {
                skipped_count += 1;
                continue;
            }

            
            let puzzle = ChessPuzzle {
                puzzle_id: row.puzzle_id.clone(),
                fen: row.fen,
                moves: row.moves,
                rating: row.rating.unwrap_or(0) as i32,
                rating_deviation: row.rating_deviation.unwrap_or(0),
                popularity: row.popularity.unwrap_or(0),
                nb_plays: row.nb_plays.unwrap_or(0),
                themes: row.themes,
                game_url: row.game_url.unwrap_or_default(),
                opening_tags: row.opening_tags.unwrap_or_default(),
                comment: String::new(),
                has_setup_move: true, 
            };

            batch_puzzles.push(puzzle);

            
            if batch_puzzles.len() >= BATCH_SIZE {
                imported_count += Self::process_batch(col, &nt, deck_id, &deck_name, &mut batch_puzzles, &mut batch_links)?;
                
                window.emit("import-progress", ImportProgress {
                    message: format!("Importing... ({} analyzed)", processed_count),
                    processed_count, imported_count, skipped_count, total_to_import: None
                })?;
            }
        }

        
        if !batch_puzzles.is_empty() {
            imported_count += Self::process_batch(col, &nt, deck_id, &deck_name, &mut batch_puzzles, &mut batch_links)?;
        }

        window.emit("import-progress", ImportProgress {
            message: format!("Done! Added {} notes.", imported_count),
            processed_count, imported_count, skipped_count, total_to_import: None
        })?;

        Ok(imported_count as i64)
    }

    
    
    
    pub fn import_from_csv<R: Runtime>(
        col: &mut Collection,
        payload: CsvImportPayload,
        window: &Window<R>,
    ) -> Result<i64, AnkiChessError> {
        PuzzleRepository::init_tables(col.storage.db())?;
        
        let deck_id = DeckId(payload.deck_id);
        let deck_name = get_deck_name(col, deck_id)?;
        
        let nt_id = col.get_notetype_by_name("Basic")?
            .ok_or_else(|| AnkiChessError::NotFound("Notetype 'Basic' missing".into()))?.id;
        let nt = col.get_notetype(nt_id)?.unwrap();

        let existing_ids = PuzzleRepository::get_existing_ids_in_deck(col.storage.db(), payload.deck_id)?;

        let mut rdr = csv::ReaderBuilder::new().has_headers(false).from_reader(payload.csv_content.as_bytes());
        
        const BATCH_SIZE: usize = 500;
        let mut batch_puzzles: Vec<ChessPuzzle> = Vec::with_capacity(BATCH_SIZE);
        let mut batch_links: Vec<(i64, String)> = Vec::with_capacity(BATCH_SIZE);
        
        let mut processed_count = 0;
        let mut imported_count = 0;
        let mut skipped_count = 0;

        for result in rdr.records() {
            let record = result?;
            processed_count += 1;
            if record.len() < 2 { continue; }

            let fen = record.get(0).unwrap_or("").trim().to_string();
            let moves = record.get(1).unwrap_or("").trim().to_string();
            let comment = record.get(2).unwrap_or("").to_string();
            let csv_id_opt = record.get(3).map(|s| s.trim().to_string());

            if fen.is_empty() || moves.is_empty() { continue; }

            
            let clean_id = match csv_id_opt {
                Some(id) if !id.is_empty() => id,
                _ => format!("csv_{}", Uuid::new_v4().simple().to_string())
            };

            if existing_ids.contains(&clean_id) {
                skipped_count += 1;
                continue;
            }

            let puzzle = ChessPuzzle {
                puzzle_id: clean_id,
                fen,
                moves,
                rating: 0, rating_deviation: 0, popularity: 0, nb_plays: 0,
                themes: "imported_csv".to_string(),
                game_url: String::new(), opening_tags: String::new(),
                comment,
                has_setup_move: false,
            };

            batch_puzzles.push(puzzle);

            if batch_puzzles.len() >= BATCH_SIZE {
                imported_count += Self::process_batch(col, &nt, deck_id, &deck_name, &mut batch_puzzles, &mut batch_links)?;
                
                window.emit("import-progress", ImportProgress {
                    message: format!("Processing CSV... ({})", processed_count),
                    processed_count, imported_count, skipped_count, total_to_import: None
                })?;
            }
        }

        if !batch_puzzles.is_empty() {
            imported_count += Self::process_batch(col, &nt, deck_id, &deck_name, &mut batch_puzzles, &mut batch_links)?;
        }

        window.emit("import-progress", ImportProgress {
            message: format!("CSV Done! Added {}.", imported_count),
            processed_count, imported_count, skipped_count, total_to_import: None
        })?;

        Ok(imported_count as i64)
    }

    
    
    
    fn process_batch(
        col: &mut Collection,
        nt: &Notetype,
        deck_id: DeckId,
        deck_name: &str,
        puzzles: &mut Vec<ChessPuzzle>,
        links: &mut Vec<(i64, String)>,
    ) -> Result<usize, AnkiChessError> {
        let count = puzzles.len();
        if count == 0 { return Ok(0); }

        
        col.storage.db().execute("BEGIN TRANSACTION", [])?;

        
        PuzzleRepository::save_batch_puzzles(col.storage.db(), puzzles)?;

        
        
        
        
        links.clear();
        for p in puzzles.iter() {
            let anki_sfld = format_anki_sfld(&p.puzzle_id, deck_name);
            let mut note = nt.new_note();
            note.set_field(0, &anki_sfld)?;
            
            
            col.add_note(&mut note, deck_id)?;
            
            links.push((note.id.0, p.puzzle_id.clone()));
        }

        
        PuzzleRepository::save_batch_links(col.storage.db(), links)?;

        
        col.storage.db().execute("COMMIT", [])?;

        
        puzzles.clear();
        

        Ok(count)
    }
}