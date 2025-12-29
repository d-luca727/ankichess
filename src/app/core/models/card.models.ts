
export interface AddNotePayload {
  
  deck_id: number;
  fen: string;
  solution: string;
  comment?: string;
  rating?: number;
  themes?: string;
  game_url?: string;
  opening_tags?: string;
}

export interface UpdateNotePayload {
  
  noteId: number;
  fen: string;
  solution: string;
  comment: string;
}

export interface BrowseOptions {
  deckId: number;
  page: number;
  pageSize: number;
}


export interface CardInfo {
  cardId: number;
  noteId: number;
  deckId: number;
  fen: string;
  solution: string;
  comment: string;
}

export interface BrowseCardInfo {
  
  cardId: number;
  noteId: number;
  
  puzzleId: string;
  fen: string;
  solution: string;
  rating: number;
  ratingDeviation: number;
  popularity: number;
  nbPlays: number;
  themes: string;
  gameUrl: string;
  openingTags: string;
  comment: string;
  hasSetupMove: boolean;
}

export interface PaginatedBrowseResult {
  cards: BrowseCardInfo[];
  totalCards: number;
}

export interface StudyCard {
  
  cardId: number;
  noteId: number;
  deckId: number;
  
  // intervals buttons
  againSecs: number;
  hardSecs: number;
  goodSecs: number;
  easySecs: number;

  // puzzle data
  puzzleId: string;
  fen: string;
  moves: string[]; 
  rating: number;
  ratingDeviation: number;
  popularity: number;
  nbPlays: number;
  themes: string;
  gameUrl: string;
  openingTags: string;
  comment: string;
  hasSetupMove: boolean;
}

export interface UpdatedStudyCard extends StudyCard {
  orientation: 'white' | 'black';
}
