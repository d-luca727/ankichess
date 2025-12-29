use anki::error::AnkiError;
use serde::Serialize;
use std::sync::PoisonError;

use csv;
use reqwest;
use rusqlite;
use std::fmt;
use std::time;
use tokio::task::JoinError;

#[derive(Debug, Serialize)]
#[serde(tag = "type", content = "error")]
pub enum AnkiChessError {
    AnkiError(String),
    JsonError(String),
    IoError(String),
    TauriError(String),
    NotFound(String),
    InvalidInput(String),
    MutexPoison(String),
    DatabaseError(String),
    HttpError(String),
    CsvError(String),
    TimeError(String),
    JoinError(String),
}

impl fmt::Display for AnkiChessError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{:?}", self)
    }
}

impl From<AnkiError> for AnkiChessError {
    fn from(err: AnkiError) -> Self {
        AnkiChessError::AnkiError(err.to_string())
    }
}

impl From<serde_json::Error> for AnkiChessError {
    fn from(err: serde_json::Error) -> Self {
        AnkiChessError::JsonError(err.to_string())
    }
}

impl From<std::io::Error> for AnkiChessError {
    fn from(err: std::io::Error) -> Self {
        AnkiChessError::IoError(err.to_string())
    }
}

impl From<tauri::Error> for AnkiChessError {
    fn from(err: tauri::Error) -> Self {
        AnkiChessError::TauriError(err.to_string())
    }
}

impl<T> From<PoisonError<T>> for AnkiChessError {
    fn from(err: PoisonError<T>) -> Self {
        AnkiChessError::MutexPoison(err.to_string())
    }
}

impl From<rusqlite::Error> for AnkiChessError {
    fn from(err: rusqlite::Error) -> Self {
        AnkiChessError::DatabaseError(err.to_string())
    }
}

impl From<reqwest::Error> for AnkiChessError {
    fn from(err: reqwest::Error) -> Self {
        AnkiChessError::HttpError(err.to_string())
    }
}

impl From<csv::Error> for AnkiChessError {
    fn from(err: csv::Error) -> Self {
        AnkiChessError::CsvError(err.to_string())
    }
}

impl From<time::SystemTimeError> for AnkiChessError {
    fn from(err: time::SystemTimeError) -> Self {
        AnkiChessError::TimeError(err.to_string())
    }
}

impl From<JoinError> for AnkiChessError {
    fn from(err: JoinError) -> Self {
        AnkiChessError::JoinError(err.to_string())
    }
}
