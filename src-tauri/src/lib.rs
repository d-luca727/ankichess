use anki::collection::CollectionBuilder;
use std::sync::{Arc, Mutex};
use tauri::Manager; 

mod error;
mod commands;
mod models;
mod shared;
mod state;
mod repository;
mod services;

use state::AppState;
use crate::models::bootstrap::AppBootstrapData;
use crate::commands::{card::*, database::*, deck::*, import::*};
use crate::repository::puzzle_repo::PuzzleRepository;




#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {

    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()
                .expect("could not find app data dir");

            std::fs::create_dir_all(&app_data_dir)
                .expect("could not create app data dir");

            let col_path = app_data_dir.join("collection.ankichess");

            let col = CollectionBuilder::default()
                .set_collection_path(col_path.to_str().expect("invalid path"))
                .build()
                .expect("error while trying to open anki collection");

            let _ = PuzzleRepository::init_tables(col.storage.db());

            //resources
            let resource_dir = app.path()
                .resource_dir()
                .expect("Failed to get resource directory");

            let openings_path = resource_dir.join("resources").join("openings");
            let themes_xml_path = resource_dir.join("resources").join("puzzleTheme.xml");

            let mut bootstrap_data = AppBootstrapData::new();
            if let Err(e) = bootstrap_data.load_openings(&openings_path.to_string_lossy()) {
                eprintln!("Failed to load opening tags: {}", e);
            } 
            if let Err(e) = bootstrap_data.load_themes(&themes_xml_path) {
                eprintln!("Failed to load themes tags: {}", e);
            }

            app.manage(AppState {
                col: Arc::new(Mutex::new(col)),
                bootstrap_data: Arc::new(bootstrap_data),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_bootstrap_data,

            //decks
            create_deck,
            get_all_decks,
            delete_deck,
            set_deck_limits,
            get_deck_limits,
            export_deck_to_csv,
            //cards
            add_chess_note,
            delete_notes,
            get_card_by_id,
            update_chess_note,
            //study
            get_next_card,
            answer_card,
            browse_cards_in_deck,
            //lichessdb stuff
            import_puzzles_from_db,
            import_puzzles_from_csv,
            get_puzzle_db_status,
            check_for_update,
            start_database_download_and_index,
            cleanup_unused_puzzles
        ])
        .run(tauri::generate_context!())
        .expect("Error running the Tauri application."); 
}