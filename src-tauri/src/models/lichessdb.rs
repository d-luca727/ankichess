use serde::Serialize;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub downloaded: u64,
    pub total: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IndexingProgress {
    pub status: String,
    pub processed_count: u64,
}

#[derive(Serialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct DbStatus {
    pub db_exists: bool,
    pub last_updated: Option<u64>,
    pub puzzle_count: i64,
}