use crate::{error::AnkiChessError, models::{card::{AddNotePayload, BrowseCardInfo, BrowseOptions, PaginatedBrowseResult, StudyCard, UpdateNotePayload}, puzzle::ChessPuzzle}, shared::utils::{get_deck_name, to_proto_card_id}};
use anki::{collection::Collection, prelude::*, scheduler::states::{CardState, FilteredState, LearnState, NormalState, RelearnState, ReviewState}, services::CardsService};
use crate::repository::puzzle_repo::PuzzleRepository;

pub struct NoteService;

impl NoteService {
    
    pub fn create_note(col: &mut Collection, payload: AddNotePayload) -> Result<i64, AnkiChessError> {
        
        let deck_id = DeckId(payload.deck_id);
        
        let deck_name = get_deck_name(col, deck_id)?;
        
        let puzzle: ChessPuzzle = payload.into();
        
        let clean_id = puzzle.puzzle_id.clone();
        let anki_sfld = format!("{} ({})", clean_id, deck_name);

        PuzzleRepository::save(col.storage.db(), &puzzle)?;

        let nt_id = col
            .get_notetype_by_name("Basic")?
            .ok_or_else(|| AnkiChessError::NotFound("Notetype 'Basic' not found.".to_string()))?
            .id;
        let nt = col.get_notetype(nt_id)?.unwrap();

        let mut note = nt.new_note();
        note.set_field(0, &anki_sfld)?;
        
        col.add_note(&mut note, deck_id)?;
        let nid = note.id.0;

        PuzzleRepository::create_link(col.storage.db(), nid, &clean_id)?;

        Ok(nid)
    }

    
    pub fn update_note(col: &mut Collection, payload: UpdateNotePayload) -> Result<(), AnkiChessError> {
        
        
        if payload.fen.is_empty() {
             return Err(AnkiChessError::InvalidInput("FEN cannot be empty".to_string()));
        }

        
        
        
        let success = PuzzleRepository::update_fields_by_nid(
            col.storage.db(),
            payload.note_id,
            &payload.fen,
            &payload.solution,
            &payload.comment
        )?;

        if !success {
            return Err(AnkiChessError::NotFound(
                format!("No puzzle found linked to note id {}", payload.note_id)
            ));
        }

        Ok(())
    }

    pub fn get_card_details(col: &mut Collection, card_id: i64) -> Result<BrowseCardInfo, AnkiChessError> {
        
        let proto_cid = to_proto_card_id(card_id);
        let card = col.get_card(proto_cid)?; 
        let nid = card.note_id;      

        
        
        let puzzle = PuzzleRepository::get_by_nid(col.storage.db(), nid)?
            .ok_or_else(|| AnkiChessError::NotFound(format!("No puzzle data found for note id {}", nid)))?;

        
        
        Ok(BrowseCardInfo {
            card_id: card.id,
            note_id: nid,
            fen: puzzle.fen,
            solution: puzzle.moves, 
            comment: puzzle.comment,
            puzzle_id: puzzle.puzzle_id,
            rating: puzzle.rating,
            rating_deviation: puzzle.rating_deviation,
            popularity: puzzle.popularity,
            nb_plays: puzzle.nb_plays,
            themes: puzzle.themes,
            game_url: puzzle.game_url,
            opening_tags: puzzle.opening_tags,
            has_setup_move: puzzle.has_setup_move,
        })
    }

    pub fn delete_notes(col: &mut Collection, note_ids: Vec<i64>) -> Result<(), AnkiChessError> {
        
        
        
        
        
        
        col.storage.db().execute("BEGIN TRANSACTION", [])?;
        PuzzleRepository::delete_links(col.storage.db(), &note_ids)?;
        col.storage.db().execute("COMMIT", [])?;

        
        let nids: Vec<NoteId> = note_ids.into_iter().map(NoteId).collect();

        
        col.remove_notes(&nids)?;

        Ok(())
    }

    
    pub fn get_next_study_card(
        col: &mut Collection, 
        deck_id: i64
    ) -> Result<Option<StudyCard>, AnkiChessError> {
        
        
        col.set_current_deck(DeckId(deck_id))?;

        
        
        let queued_card = match col.get_next_card()? {
            Some(card) => card,
            None => return Ok(None), 
        };

        
        let states = col.get_scheduling_states(queued_card.card.id())?;
        
        let again_secs = Self::get_interval_secs(states.again);
        let hard_secs = Self::get_interval_secs(states.hard);
        let good_secs = Self::get_interval_secs(states.good);
        let easy_secs = Self::get_interval_secs(states.easy);

        
        let nid = queued_card.card.note_id().0;
        
        
        let puzzle = PuzzleRepository::get_by_nid(col.storage.db(), nid)?
            .ok_or_else(|| AnkiChessError::NotFound(
                format!("Data consistency error: Anki note {} exists but has no linked puzzle in app_chess_puzzles", nid)
            ))?;

        
        
        let solution_vec: Vec<String> = puzzle.moves
            .split_whitespace()
            .map(|s| s.to_string())
            .collect();

        Ok(Some(StudyCard {
            
            card_id: queued_card.card.id().0,
            note_id: nid,
            deck_id,
            again_secs,
            hard_secs,
            good_secs,
            easy_secs,

            
            puzzle_id: puzzle.puzzle_id,
            fen: puzzle.fen,
            moves: solution_vec,
            rating: puzzle.rating,
            rating_deviation: puzzle.rating_deviation,
            popularity: puzzle.popularity,
            nb_plays: puzzle.nb_plays,
            themes: puzzle.themes,
            game_url: puzzle.game_url,
            opening_tags: puzzle.opening_tags,
            comment: puzzle.comment,
            has_setup_move: puzzle.has_setup_move,
        }))
    }

    pub fn browse_cards(col: &mut Collection, options: BrowseOptions) -> Result<PaginatedBrowseResult, AnkiChessError> {
        let deck_id = options.deck_id;
        let page_size = options.page_size;
        let offset = if options.page > 0 { (options.page - 1) * page_size } else { 0 };

        let filter = options.filter_text.unwrap_or_default().trim().to_string();
        let sort = options.sort_order.unwrap_or_else(|| "default".to_string());

        let mut sql_base = String::from(
            "FROM cards c
             JOIN app_chess_note_links l ON c.nid = l.nid
             JOIN app_chess_puzzles p ON l.puzzle_id = p.puzzle_id
             WHERE c.did = ?"
        );

        let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(deck_id)];

        if !filter.is_empty() {
            
            let is_range = filter.contains('-');
            let range_parts: Vec<&str> = if is_range { filter.split('-').collect() } else { vec![] };
            
            
            if is_range && range_parts.len() == 2 {
                let min = range_parts[0].trim().parse::<i32>();
                let max = range_parts[1].trim().parse::<i32>();
                
                if let (Ok(min_val), Ok(max_val)) = (min, max) {
                    sql_base.push_str(" AND (p.rating BETWEEN ? AND ?)");
                    params.push(Box::new(min_val));
                    params.push(Box::new(max_val));
                } else {
                    
                    apply_text_search(&mut sql_base, &mut params, &filter);
                }
            } 
            
            else if let Ok(rating_val) = filter.parse::<i32>() {
                sql_base.push_str(" AND (p.rating BETWEEN ? AND ?)");
                params.push(Box::new(rating_val - 50));
                params.push(Box::new(rating_val + 50));
            } 
            
            else if filter.starts_with('>') {
                if let Ok(val) = filter[1..].trim().parse::<i32>() {
                    sql_base.push_str(" AND p.rating > ?");
                    params.push(Box::new(val));
                } else {
                    apply_text_search(&mut sql_base, &mut params, &filter);
                }
            }
            
            else if filter.starts_with('<') {
                if let Ok(val) = filter[1..].trim().parse::<i32>() {
                    sql_base.push_str(" AND p.rating < ?");
                    params.push(Box::new(val));
                } else {
                    apply_text_search(&mut sql_base, &mut params, &filter);
                }
            }
            
            else {
                apply_text_search(&mut sql_base, &mut params, &filter);
            }
        }

        let conn = col.storage.db();

        
        let count_sql = format!("SELECT COUNT(*) {}", sql_base);
        let params_sql = rusqlite::params_from_iter(params.iter().map(|p| p.as_ref()));
        let total_cards: usize = conn.query_row(&count_sql, params_sql, |row| row.get(0)).unwrap_or(0);

        if total_cards == 0 {
             return Ok(PaginatedBrowseResult { cards: vec![], total_cards: 0 });
        }

        
        let order_clause = match sort.as_str() {
            "rating-desc" => "ORDER BY p.rating DESC",
            "rating-asc" => "ORDER BY p.rating ASC",
            "popularity" => "ORDER BY p.popularity DESC",
            _ => "ORDER BY c.id DESC", 
        };

        
        let select_sql = format!(
            "SELECT c.id, c.nid, p.* {} {} LIMIT ? OFFSET ?",
            sql_base, order_clause
        );

        params.push(Box::new(page_size as i64));
        params.push(Box::new(offset as i64));

        let params_sql_select = rusqlite::params_from_iter(params.iter().map(|p| p.as_ref()));
        let mut stmt = conn.prepare(&select_sql)?;
        
        let cards_iter = stmt.query_map(params_sql_select, |row| {
             Ok(BrowseCardInfo {
                card_id: row.get(0)?,
                note_id: row.get(1)?,
                puzzle_id: row.get("puzzle_id")?,
                fen: row.get("fen")?,
                solution: row.get("moves")?,
                rating: row.get("rating")?,
                rating_deviation: row.get("rating_deviation")?,
                popularity: row.get("popularity")?,
                nb_plays: row.get("nb_plays")?,
                themes: row.get("themes")?,
                game_url: row.get("game_url")?,
                opening_tags: row.get("opening_tags")?,
                comment: row.get("comment")?,
                has_setup_move: row.get::<_, i32>("has_setup_move")? != 0,
            })
        })?;

        let mut cards = Vec::new();
        for card_res in cards_iter {
            cards.push(card_res?);
        }

        Ok(PaginatedBrowseResult {
            cards,
            total_cards,
        })
    }

    fn get_interval_secs(state: CardState) -> u32 {
    match state {
        CardState::Normal(normal_state) => match normal_state {
            NormalState::New(_) => 0,
            NormalState::Learning(LearnState { scheduled_secs, .. }) => scheduled_secs,
            NormalState::Relearning(RelearnState { learning, .. }) => learning.scheduled_secs,
            NormalState::Review(ReviewState { scheduled_days, .. }) => scheduled_days * 86_400,
        },
        CardState::Filtered(filtered_state) => match filtered_state {
            FilteredState::Preview(preview_state) => preview_state.scheduled_secs,
            FilteredState::Rescheduling(rescheduling_state) => {
                Self::get_interval_secs(CardState::Normal(rescheduling_state.original_state))
            }
        },
    }
}


    
    
    fn _card_type_to_string(ctype: u32) -> String {
        
        
        match ctype {
            0 => "New".to_string(),
            1 => "Learning".to_string(),
            2 => "Review".to_string(),
            3 => "Relearning".to_string(),
            _ => "Unknown".to_string(),
        }
    }

}

fn apply_text_search(sql: &mut String, params: &mut Vec<Box<dyn rusqlite::ToSql>>, filter: &str) {
    
    sql.push_str(" AND (p.puzzle_id LIKE ? OR p.themes LIKE ? OR p.comment LIKE ? OR p.opening_tags LIKE ?)");
    
    let pattern = format!("%{}%", filter);
    
    
    params.push(Box::new(pattern.clone())); // For puzzle_id
    params.push(Box::new(pattern.clone())); // For themes
    params.push(Box::new(pattern.clone())); // For comment
    params.push(Box::new(pattern.clone())); // For opening_tags
}