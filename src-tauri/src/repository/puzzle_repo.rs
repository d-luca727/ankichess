use std::collections::{HashMap, HashSet};

use rusqlite::{params, Connection, Result};

use crate::models::puzzle::ChessPuzzle;

pub struct PuzzleRepository;

impl PuzzleRepository {
    
    pub fn init_tables(conn: &Connection) -> Result<()> {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS app_chess_puzzles (
                puzzle_id TEXT PRIMARY KEY,
                fen TEXT NOT NULL,
                moves TEXT NOT NULL,
                rating INTEGER,
                rating_deviation INTEGER,
                popularity INTEGER,
                nb_plays INTEGER,
                themes TEXT,
                game_url TEXT,
                opening_tags TEXT,
                comment TEXT,
                has_setup_move INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS app_chess_note_links (
                nid INTEGER PRIMARY KEY,
                puzzle_id TEXT NOT NULL,
                FOREIGN KEY(puzzle_id) REFERENCES app_chess_puzzles(puzzle_id)
            );
            
            
            CREATE INDEX IF NOT EXISTS idx_link_puzzle_id ON app_chess_note_links(puzzle_id);
            
            CREATE INDEX IF NOT EXISTS idx_puzzles_rating ON app_chess_puzzles(rating);
            CREATE INDEX IF NOT EXISTS idx_puzzles_popularity ON app_chess_puzzles(popularity);
            
            CREATE INDEX IF NOT EXISTS idx_puzzles_themes ON app_chess_puzzles(themes);
            CREATE INDEX IF NOT EXISTS idx_puzzles_opening_tags ON app_chess_puzzles(opening_tags);"
        )
    }

    
    pub fn save(conn: &Connection, puzzle: &ChessPuzzle) -> Result<()> {
        let mut stmt = conn.prepare(
            "INSERT INTO app_chess_puzzles 
            (puzzle_id, fen, moves, rating, rating_deviation, popularity, nb_plays, themes, game_url, opening_tags, comment, has_setup_move) 
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            ON CONFLICT(puzzle_id) DO UPDATE SET
                fen=excluded.fen,
                moves=excluded.moves,
                comment=excluded.comment" 
        )?;

        stmt.execute(params![
            puzzle.puzzle_id,
            puzzle.fen,
            puzzle.moves,
            puzzle.rating,
            puzzle.rating_deviation,
            puzzle.popularity,
            puzzle.nb_plays,
            puzzle.themes,
            puzzle.game_url,
            puzzle.opening_tags,
            puzzle.comment,
            puzzle.has_setup_move as i32 
        ])?;
        Ok(())
    }

    
    pub fn create_link(conn: &Connection, nid: i64, puzzle_id: &str) -> Result<()> {
        conn.execute(
            "INSERT INTO app_chess_note_links (nid, puzzle_id) VALUES (?1, ?2)",
            params![nid, puzzle_id],
        )?;
        Ok(())
    }

    
    
    pub fn update_fields_by_nid(
        conn: &Connection, 
        nid: i64, 
        fen: &str, 
        moves: &str, 
        comment: &str
    ) -> Result<bool> {
        
        
        
        let updated_count = conn.execute(
            "UPDATE app_chess_puzzles
             SET fen = ?1, moves = ?2, comment = ?3
             WHERE puzzle_id = (
                 SELECT puzzle_id 
                 FROM app_chess_note_links 
                 WHERE nid = ?4
             )",
            params![fen, moves, comment, nid],
        )?;

        Ok(updated_count > 0)
    }

    pub fn get_by_nid(conn: &Connection, nid: i64) -> Result<Option<ChessPuzzle>> {
        let sql = "
            SELECT p.* FROM app_chess_puzzles p
            JOIN app_chess_note_links l ON p.puzzle_id = l.puzzle_id
            WHERE l.nid = ?1
        ";

        let result = conn.query_row(sql, params![nid], |row| {
            Ok(ChessPuzzle {
                puzzle_id: row.get("puzzle_id")?,
                fen: row.get("fen")?,
                moves: row.get("moves")?,
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
        });

        match result {
            Ok(puzzle) => Ok(Some(puzzle)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn delete_links(conn: &Connection, nids: &[i64]) -> Result<()> {
        if nids.is_empty() {
            return Ok(());
        }

        
        let placeholders = std::iter::repeat("?")
            .take(nids.len())
            .collect::<Vec<_>>()
            .join(",");

        
        let sql = format!(
            "DELETE FROM app_chess_note_links WHERE nid IN ({})",
            placeholders
        );

        
        let params: Vec<&dyn rusqlite::ToSql> = nids
            .iter()
            .map(|n| n as &dyn rusqlite::ToSql)
            .collect();

        
        conn.execute(&sql, &*params)?;

        Ok(())
    }

    
    
    pub fn get_batch_by_nids(conn: &Connection, nids: &[i64]) -> Result<HashMap<i64, ChessPuzzle>> {
        if nids.is_empty() {
            return Ok(HashMap::new());
        }

        
        
        
        let placeholders = std::iter::repeat("?").take(nids.len()).collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT l.nid, p.* FROM app_chess_puzzles p
             JOIN app_chess_note_links l ON p.puzzle_id = l.puzzle_id
             WHERE l.nid IN ({})", 
            placeholders
        );

        
        let params: Vec<&dyn rusqlite::ToSql> = nids.iter().map(|n| n as &dyn rusqlite::ToSql).collect();

        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(&*params, |row| {
            let nid: i64 = row.get("nid")?;
            let puzzle = ChessPuzzle {
                puzzle_id: row.get("puzzle_id")?,
                fen: row.get("fen")?,
                moves: row.get("moves")?,
                rating: row.get("rating")?,
                rating_deviation: row.get("rating_deviation")?,
                popularity: row.get("popularity")?,
                nb_plays: row.get("nb_plays")?,
                themes: row.get("themes")?,
                game_url: row.get("game_url")?,
                opening_tags: row.get("opening_tags")?,
                comment: row.get("comment")?,
                has_setup_move: row.get::<_, i32>("has_setup_move")? != 0,
            };
            Ok((nid, puzzle))
        })?;

        let mut result_map = HashMap::new();
        for row in rows {
            let (nid, puzzle) = row?;
            result_map.insert(nid, puzzle);
        }

        Ok(result_map)
    }

    
    
    pub fn get_existing_ids_in_deck(conn: &Connection, deck_id: i64) -> Result<HashSet<String>> {
        let mut stmt = conn.prepare(
            "SELECT l.puzzle_id 
             FROM app_chess_note_links l
             JOIN cards c ON l.nid = c.nid
             WHERE c.did = ?"
        )?;
        
        let rows = stmt.query_map(params![deck_id], |row| row.get::<_, String>(0))?;
        
        let mut set = HashSet::new();
        for id in rows {
            set.insert(id?);
        }
        Ok(set)
    }

    
    
    pub fn save_batch_puzzles(conn: &Connection, puzzles: &[ChessPuzzle]) -> Result<()> {
        let mut stmt = conn.prepare(
            "INSERT OR IGNORE INTO app_chess_puzzles 
            (puzzle_id, fen, moves, rating, rating_deviation, popularity, nb_plays, themes, game_url, opening_tags, comment, has_setup_move) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )?;

        for p in puzzles {
            stmt.execute(params![
                p.puzzle_id,
                p.fen,
                p.moves,
                p.rating,
                p.rating_deviation,
                p.popularity,
                p.nb_plays,
                p.themes,
                p.game_url,
                p.opening_tags,
                p.comment,
                p.has_setup_move as i32
            ])?;
        }
        Ok(())
    }

    
    pub fn save_batch_links(conn: &Connection, links: &[(i64, String)]) -> Result<()> {
        let mut stmt = conn.prepare(
            "INSERT OR REPLACE INTO app_chess_note_links (nid, puzzle_id) VALUES (?, ?)"
        )?;

        for (nid, puzzle_id) in links {
            stmt.execute(params![nid, puzzle_id])?;
        }
        Ok(())
    }

    
    pub fn _exists_in_deck(conn: &Connection, puzzle_id: &str, deck_id: i64) -> Result<bool> {
        let mut stmt = conn.prepare(
            "SELECT 1 
             FROM app_chess_note_links l
             JOIN cards c ON l.nid = c.nid
             WHERE l.puzzle_id = ?1 AND c.did = ?2
             LIMIT 1"
        )?;
        
        Ok(stmt.exists(params![puzzle_id, deck_id])?)
    }

    //clear cache
    pub fn delete_unused_puzzles(conn: &Connection) -> Result<usize> {
        let sql = "
            DELETE FROM app_chess_puzzles 
            WHERE puzzle_id NOT IN (
                SELECT DISTINCT puzzle_id FROM app_chess_note_links
            )
        ";
        let count = conn.execute(sql, [])?;
        Ok(count)
    }
}