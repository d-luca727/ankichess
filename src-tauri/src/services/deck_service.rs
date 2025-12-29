use anki::services::CardsService;
use csv::WriterBuilder;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

use anki::deckconfig::UpdateDeckConfigsRequest;
use anki::{collection::Collection, prelude::*};
use anki_proto::deck_config::UpdateDeckConfigsMode;
use anki_proto::decks::DeckTreeNode;

use crate::error::AnkiChessError;
use crate::models::deck::{DeckInfo, DeckLimitsPayload};
use crate::repository::puzzle_repo::PuzzleRepository;
use crate::shared::utils::to_proto_card_id;
use anki::prelude::BoolKey::Fsrs;

pub struct DeckService;

impl DeckService {
    pub fn create_deck(col: &mut Collection, deck_name: &str) -> Result<i64, AnkiChessError> {
        let deck = col.get_or_create_normal_deck(deck_name)?;
        Ok(deck.id.0)
    }

    pub fn get_all_decks(col: &mut Collection) -> Result<Vec<DeckInfo>, AnkiChessError> {
        let deck_names = col
            .get_all_deck_names(false)
            .map_err(AnkiChessError::from)?;

        let timing = TimestampSecs::now();
        let root_node = col.deck_tree(Some(timing))?;
        let mut tree_map = HashMap::new();
        Self::flatten_deck_tree_into_map(root_node, &mut tree_map);

        let mut result = Vec::new();
        for (deck_id, name) in deck_names {
            let node_opt = tree_map.get(&deck_id);
            let (new_count, learn_count, due_count) = node_opt
                .map(|n| (n.new_count, n.learn_count, n.review_count))
                .unwrap_or((0, 0, 0));

            result.push(DeckInfo {
                id: deck_id,
                name,
                new_count,
                learn_count,
                due_count,
            });
        }
        Ok(result)
    }

    pub fn delete_deck(col: &mut Collection, deck_id: i64) -> Result<(), AnkiChessError> {
        let did = DeckId(deck_id);

        let search_query = format!("did:{}", deck_id);
        let card_ids = col.search_cards(&search_query, anki::search::SortMode::NoOrder)?;

        let mut nids_to_clean = HashSet::new();
        for cid in card_ids {
            let proto_cid = to_proto_card_id(cid.0);
            if let Ok(card) = col.get_card(proto_cid) {
                nids_to_clean.insert(card.note_id);
            }
        }

        let nids_vec: Vec<i64> = nids_to_clean.into_iter().collect();

        if !nids_vec.is_empty() {
            col.storage.db().execute("BEGIN TRANSACTION", [])?;
            PuzzleRepository::delete_links(col.storage.db(), &nids_vec)?;
            col.storage.db().execute("COMMIT", [])?;
        }

        col.remove_decks_and_child_decks(&[did])?;

        Ok(())
    }

    pub fn get_deck_limits(
        col: &mut Collection,
        deck_id: i64,
    ) -> Result<DeckLimitsPayload, AnkiChessError> {
        let deck = col
            .get_deck(DeckId(deck_id))?
            .ok_or_else(|| AnkiChessError::NotFound(format!("Deck {} not found", deck_id)))?;

        let config_id = deck.config_id().ok_or_else(|| {
            AnkiChessError::NotFound("Deck has no config (maybe filtered deck?)".to_string())
        })?;

        let config = col
            .get_deck_config(config_id, true)?
            .ok_or_else(|| AnkiChessError::NotFound(format!("Config {} not found", config_id)))?;

        Ok(DeckLimitsPayload {
            new_cards_per_day: config.inner.new_per_day,
            reviews_per_day: config.inner.reviews_per_day,
        })
    }

    pub fn set_deck_limits(
        col: &mut Collection,
        deck_id: i64,
        limits: DeckLimitsPayload,
    ) -> Result<(), AnkiChessError> {
        let target_did = DeckId(deck_id);

        let deck_opts = col.get_deck_configs_for_update(target_did)?;

        let current_deck_info = deck_opts
            .current_deck
            .ok_or_else(|| AnkiChessError::NotFound("Deck info not found".to_string()))?;

        let current_conf_id = current_deck_info.config_id;

        let config_entry = deck_opts
            .all_config
            .iter()
            .find(|c| c.config.as_ref().map(|cc| cc.id).unwrap_or(0) == current_conf_id)
            .ok_or_else(|| AnkiChessError::NotFound("Config not found".to_string()))?;

        let use_count = config_entry.use_count;
        let is_default = current_conf_id == 1;

        // preparing config (cloning if shared across decks, edit if unique)
        let mut config: DeckConfig = if use_count > 1 || is_default {
            let mut new_conf: DeckConfig = config_entry.config.clone().unwrap().into();
            new_conf.id = DeckConfigId(0); 
            new_conf.name = format!("{} (Custom)", current_deck_info.name);
            new_conf
        } else {
            config_entry.config.clone().unwrap().into()
        };

        config.inner.new_per_day = limits.new_cards_per_day;
        config.inner.reviews_per_day = limits.reviews_per_day;

        let update_req = UpdateDeckConfigsRequest {
            target_deck_id: target_did,
            configs: vec![config],
            removed_config_ids: vec![],
            mode: UpdateDeckConfigsMode::Normal,

            card_state_customizer: deck_opts.card_state_customizer,
            limits: Default::default(),
            new_cards_ignore_review_limit: deck_opts.new_cards_ignore_review_limit,
            apply_all_parent_limits: deck_opts.apply_all_parent_limits,
            fsrs: col.get_config_bool(Fsrs),
            fsrs_reschedule: false,
            fsrs_health_check: deck_opts.fsrs_health_check,
        };

        col.update_deck_configs(update_req)?;
        Ok(())
    }

    pub async fn export_deck_csv(
        col_arc: Arc<Mutex<Collection>>,
        deck_id: i64,
        file_path: String,
    ) -> Result<usize, AnkiChessError> {
        tokio::task::spawn_blocking(move || -> Result<usize, AnkiChessError> {
            let mut col = col_arc
                .lock()
                .map_err(|_| AnkiChessError::DatabaseError("Lock poisoned".into()))?;

            let search_query = format!("did:{}", deck_id);
            let card_ids = col.search_cards(&search_query, anki::search::SortMode::NoOrder)?;

            let mut nids = HashSet::new();
            for cid in card_ids {
                let proto_cid = to_proto_card_id(cid.0);
                if let Ok(card) = col.get_card(proto_cid) {
                    nids.insert(card.note_id);
                }
            }
            let nids_vec: Vec<i64> = nids.into_iter().collect();

            let puzzles_map = PuzzleRepository::get_batch_by_nids(col.storage.db(), &nids_vec)?;

            let mut wtr = WriterBuilder::new()
                .has_headers(false)
                .from_path(file_path)?;

            let mut count = 0;

            for puzzle in puzzles_map.values() {
                wtr.write_record(&[&puzzle.fen, &puzzle.moves, &puzzle.comment])?;
                count += 1;
            }

            wtr.flush()?;
            Ok(count)
        })
        .await?
    }

    fn flatten_deck_tree_into_map(node: DeckTreeNode, map: &mut HashMap<DeckId, DeckTreeNode>) {
        let children = node.children;

        let node_data = DeckTreeNode {
            children: vec![],
            ..node
        };
        map.insert(DeckId(node_data.deck_id), node_data);
        for child in children {
            Self::flatten_deck_tree_into_map(child, map);
        }
    }
}
