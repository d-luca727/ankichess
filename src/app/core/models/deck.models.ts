export interface DeckInfo {
  id: number;
  name: string;
  new_count: number;
  learn_count: number;
  due_count: number;
}

export interface Deck {
  id: number;
  name: string;
}

export interface DeckLimitsPayload {
  newCardsPerDay: number;
  reviewsPerDay: number;
}