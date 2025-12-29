use serde::{Serialize, Deserialize};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;
use quick_xml::reader::Reader;
use quick_xml::events::Event;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Opening {
    pub eco: String,
    pub name: String,
    pub pgn: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Theme {
    pub id: String,
    pub label: String,
    pub description: String,
}

#[derive(Serialize, Clone)]
pub struct AppBootstrapData {
    pub openings: Vec<Opening>,
    pub themes: Vec<Theme>,
}

impl AppBootstrapData {
    pub fn new() -> Self {
        Self {
            openings: Vec::new(),
            themes: Vec::new(),
        }
    }

    pub fn load_openings(&mut self, base_path: &str) -> Result<(), Box<dyn std::error::Error>> {
        
        let files = vec!["a.tsv", "b.tsv", "c.tsv", "d.tsv", "e.tsv"];
        
        for file_name in files {
            let path = Path::new(base_path).join(file_name);
            if !path.exists() { continue; }

            let file = File::open(path)?;
            let reader = BufReader::new(file);

            
            for line in reader.lines().skip(1) {
                let line = line?;
                let parts: Vec<&str> = line.split('\t').collect();
                
                if parts.len() >= 3 {
                    self.openings.push(Opening {
                        eco: parts[0].to_string(),
                        name: parts[1].to_string(),
                        pgn: parts[2].to_string(),
                    });
                }
            }
        }
        Ok(())
    }

    pub fn load_themes(&mut self, xml_path: &Path) -> Result<(), Box<dyn std::error::Error>> {
        if !xml_path.exists() {
            return Err(format!("File temi non trovato: {:?}", xml_path).into());
        }

        let file_content = std::fs::read_to_string(xml_path)?;
        let mut reader = Reader::from_str(&file_content);
        reader.trim_text(true);
        
        let mut buf = Vec::new();
        let mut current_id = String::new();

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) if e.name().as_ref() == b"string" => {
                    for attr in e.attributes() {
                        let attr = attr?;
                        if attr.key.as_ref() == b"name" {
                            current_id = String::from_utf8_lossy(&attr.value).into_owned();
                        }
                    }
                }
                Ok(Event::Text(e)) => {
                    let text = e.unescape()?.into_owned();
                    if current_id.ends_with("Description") {
                        
                        let id = current_id.replace("Description", "");
                        if let Some(theme) = self.themes.iter_mut().find(|t| t.id == id) {
                            theme.description = text;
                        }
                    } else {
                        
                        self.themes.push(Theme {
                            id: current_id.clone(),
                            label: text,
                            description: String::new(), 
                        });
                    }
                }
                Ok(Event::Eof) => break,
                Err(e) => return Err(Box::new(e)),
                _ => (),
            }
            buf.clear();
        }
        Ok(())
    }
}