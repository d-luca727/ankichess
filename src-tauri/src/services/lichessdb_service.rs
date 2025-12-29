use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use regex::Regex;
use tauri::{AppHandle, Emitter, Manager, Runtime, Window};
use rusqlite::{params, Connection};
use reqwest;

use crate::error::AnkiChessError;
use crate::models::lichessdb::{DbStatus, DownloadProgress, IndexingProgress};
use crate::models::puzzle::{PuzzleRecord};

const PUZZLE_DB_URL: &str = "https://database.lichess.org/lichess_db_puzzle.csv.zst";
const ZST_FILE_NAME: &str = "lichess_db_puzzle.csv.zst";
const SQLITE_FILE_NAME: &str = "ankichess_puzzles.sqlite";

const DOWNLOAD_PROGRESS_EVENT: &str = "DOWNLOAD_PROGRESS";
const INDEXING_PROGRESS_EVENT: &str = "INDEXING_PROGRESS";

pub struct LichessdbService;

impl LichessdbService {
    
    
    pub fn get_sqlite_db_path<R: Runtime>(app_handle: &AppHandle<R>) -> Result<PathBuf, AnkiChessError> {
        let data_dir = Self::get_app_data_dir(app_handle)?;
        Ok(data_dir.join(SQLITE_FILE_NAME))
    }

    
    
    pub async fn download_and_index<R: Runtime>(
        window: Window<R>,
        app_handle: AppHandle<R>,
    ) -> Result<(), AnkiChessError> {
        
        let zst_path = Self::get_zst_download_path(&app_handle)?;

        
        let zst_path_download = zst_path.clone();
        let window_clone = window.clone();

        
        let download_result = tokio::task::spawn_blocking(move || -> Result<(), AnkiChessError> {
            let mut response = reqwest::blocking::get(PUZZLE_DB_URL)?;
            if !response.status().is_success() {
                return Err(AnkiChessError::IoError(format!("HTTP Error: {}", response.status())));
            }
            
            let total_size = response.content_length().unwrap_or(0);
            
            let mut file = File::create(&zst_path_download)?;
            let mut downloaded: u64 = 0;
            let mut buffer = [0; 8192];

            while let Ok(bytes_read) = response.read(&mut buffer) {
                if bytes_read == 0 { break; }
                file.write_all(&buffer[..bytes_read])?;
                downloaded += bytes_read as u64;

                if total_size > 0 {
                    window_clone.emit(DOWNLOAD_PROGRESS_EVENT, DownloadProgress { downloaded, total: total_size }).ok();
                }
            }
            Ok(())
        }).await?;

        download_result?; 

        
        window.emit(INDEXING_PROGRESS_EVENT, IndexingProgress { status: "starting".to_string(), processed_count: 0 }).ok();

        let db_path = Self::get_sqlite_db_path(&app_handle)?;
        let window_idx = window.clone();
        
        
        let zst_path_index = zst_path.clone();

        let index_result = tokio::task::spawn_blocking(move || -> Result<u64, AnkiChessError> {
            let mut conn = Connection::open(&db_path)?;
            Self::init_sqlite_db(&conn)?; 

            let tx = conn.transaction()?;
            let mut processed_count = 0;

            {
                
                let file = File::open(&zst_path_index)?;
                let decoder = zstd::stream::read::Decoder::new(file)?;
                let mut rdr = csv::Reader::from_reader(decoder);

                let mut stmt = tx.prepare(
                    "INSERT OR REPLACE INTO puzzles 
                    (PuzzleId, FEN, Moves, Rating, RatingDeviation, Popularity, NbPlays, Themes, GameUrl, OpeningTags)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"
                )?;

                for (index, result) in rdr.deserialize().enumerate() {
                    let record: PuzzleRecord = match result {
                        Ok(r) => r,
                        Err(e) => { eprintln!("CSV Error: {}", e); continue; }
                    };

                    stmt.execute(params![
                        record.puzzle_id, record.fen, record.moves, record.rating,
                        record.rating_deviation, record.popularity, record.nb_plays,
                        record.themes, record.game_url, record.opening_tags.unwrap_or_default()
                    ])?;

                    processed_count += 1;
                    if index % 10000 == 0 {
                        window_idx.emit(INDEXING_PROGRESS_EVENT, IndexingProgress { status: "indexing".to_string(), processed_count }).ok();
                    }
                }
            }

            let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_millis() as u64;
            tx.execute("INSERT OR REPLACE INTO meta (key, value) VALUES ('last_updated', ?1)", params![now.to_string()])?;
            tx.commit()?;

            Ok(processed_count)
        }).await?;

        
        let _ = fs::remove_file(zst_path);
        
        window.emit(INDEXING_PROGRESS_EVENT, IndexingProgress { status: "finished".to_string(), processed_count: index_result? }).ok();

        Ok(())
    }

    
    
    pub fn get_status<R: Runtime>(app_handle: &AppHandle<R>) -> Result<DbStatus, AnkiChessError> {
        let db_path = Self::get_sqlite_db_path(app_handle)?;

        if !db_path.exists() {
            return Ok(DbStatus::default());
        }

        let conn = Connection::open(db_path)?;

        let puzzle_count = conn.query_row("SELECT COUNT(*) FROM puzzles", [], |row| row.get(0)).unwrap_or(0);
        
        let last_updated = conn.query_row("SELECT value FROM meta WHERE key = 'last_updated'", [], |row| {
            Ok(row.get::<_, String>(0).ok().and_then(|s| s.parse::<u64>().ok()))
        }).unwrap_or(None);

        Ok(DbStatus {
            db_exists: true,
            last_updated,
            puzzle_count,
        })
    }

    //i literally web scrape lichess page, maybe find a better way to check for updates
    pub async fn check_for_update<R: Runtime>(app_handle: &AppHandle<R>) -> Result<bool, AnkiChessError> {
    let db_path = Self::get_sqlite_db_path(app_handle)?;

    if !db_path.exists() {
        return Ok(true);
    }

    let conn = Connection::open(db_path)?;
    let local_count: i64 = conn.query_row("SELECT COUNT(*) FROM puzzles", [], |row| row.get(0)).unwrap_or(0);

    
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| AnkiChessError::TauriError(e.to_string()))?;

    let url = "https://database.lichess.org/";
    let response = client.get(url)
        .send()
        .await
        .map_err(|e| AnkiChessError::TauriError(e.to_string()))?;
    
    let body = response.text()
        .await
        .map_err(|e| AnkiChessError::TauriError(e.to_string()))?;

    
    
    
    let re = Regex::new(r"([\d,]+)[\s\S]{1,50}chess puzzles")
        .map_err(|e| AnkiChessError::TauriError(e.to_string()))?;
    
    if let Some(caps) = re.captures(&body) {
        let count_str = caps.get(1).map_or("", |m| m.as_str());
        let online_count = count_str.replace(',', "").parse::<i64>()
            .map_err(|_| AnkiChessError::InvalidInput("Failed to parse online count".into()))?;

        return Ok(online_count > local_count);
    }

    
    let re_fallback = Regex::new(r"([\d,]{5,12})\s+puzzles")
        .map_err(|e| AnkiChessError::TauriError(e.to_string()))?;

    if let Some(caps) = re_fallback.captures(&body) {
        let count_str = caps.get(1).map_or("", |m| m.as_str());
        let online_count = count_str.replace(',', "").parse::<i64>().unwrap_or(0);
        if online_count > 0 {
             return Ok(online_count > local_count);
        }
    }

    println!("[DB-CHECK] ERRORE: Parsing fallito. Controlla se la struttura della pagina è cambiata.");
    Err(AnkiChessError::NotFound("Impossibile trovare il numero di puzzle online".into()))
}

    

    fn get_app_data_dir<R: Runtime>(app_handle: &AppHandle<R>) -> Result<PathBuf, AnkiChessError> {
        let data_dir = app_handle.path().app_data_dir()?;
        if !data_dir.exists() {
            fs::create_dir_all(&data_dir)?;
        }
        Ok(data_dir)
    }

    fn get_zst_download_path<R: Runtime>(app_handle: &AppHandle<R>) -> Result<PathBuf, AnkiChessError> {
        Ok(Self::get_app_data_dir(app_handle)?.join(ZST_FILE_NAME))
    }

    fn init_sqlite_db(conn: &Connection) -> Result<(), rusqlite::Error> {
        conn.execute_batch(
            "BEGIN;
            CREATE TABLE IF NOT EXISTS puzzles (
                PuzzleId TEXT PRIMARY KEY,
                FEN TEXT NOT NULL,
                Moves TEXT NOT NULL,
                Rating INTEGER NOT NULL,
                RatingDeviation INTEGER,
                Popularity INTEGER NOT NULL,
                NbPlays INTEGER,
                Themes TEXT,
                GameUrl TEXT,
                OpeningTags TEXT
            );
            CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
            CREATE INDEX IF NOT EXISTS idx_rating ON puzzles (Rating);
            CREATE INDEX IF NOT EXISTS idx_popularity ON puzzles (Popularity);
            COMMIT;"
        )?;
        Ok(())
    }
}