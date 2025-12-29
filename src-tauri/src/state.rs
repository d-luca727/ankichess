use anki::collection::Collection;
use std::sync::{Arc, Mutex};

use crate::models::bootstrap::AppBootstrapData;

pub struct AppState {
    pub col: Arc<Mutex<Collection>>,
    pub bootstrap_data: Arc<AppBootstrapData>,
}
