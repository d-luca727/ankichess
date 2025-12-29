export interface ImportOptions {
  deck_id: number;
  min_rating?: number;
  max_rating?: number;
  min_popularity?: number;
  max_popularity?: number;
  limit?: number;
  themes?: string[];       
  opening_tags?: string[];
}

export interface CsvImportPayload {
    deckId: number;
    csvContent: string;
}

export interface DbStatus {
  dbExists: boolean;
  lastUpdated: number | null;
  puzzleCount: number;
}

export interface DownloadProgress {
  downloaded: number;
  total: number;
}

export interface IndexingProgress {
  status: 'starting' | 'indexing' | 'finished';
  processedCount: number;
}

export interface AppBootstrapData {
  openings: Opening[];
  themes: Theme[];
}

export interface Opening {
  eco: string;
  name: string;
  pgn: string;
}

export interface Theme {
  id: string;
  label: string;
  description: string;
}

