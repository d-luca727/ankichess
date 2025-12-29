import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';


import type { DeckInfo, DeckLimitsPayload } from '../models/deck.models';
import type { CardInfo, BrowseCardInfo, PaginatedBrowseResult, StudyCard } from '../models/card.models';
import type { ImportOptions, DbStatus } from '../models/db.models';
import { BehaviorSubject, Observable } from 'rxjs';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { save } from '@tauri-apps/plugin-dialog';


interface RustImportProgress {
  message: string;
  processed_count: number;
  imported_count: number;
  skipped_count: number;
  total_to_import: number | null;
}


export interface ImportProgress {
  message: string;
  processedCount: number;
  importedCount: number;
  skippedCount: number;
  totalToImport: number | null;
  isError: boolean;
  isComplete: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class TauriService implements OnDestroy {


  private importProgressSubject = new BehaviorSubject<ImportProgress | null>(null);
  public importProgress$: Observable<ImportProgress | null> = this.importProgressSubject.asObservable();


  private unlistenFns: UnlistenFn[] = [];

  constructor(private ngZone: NgZone) {

    this.listenToImportProgress();
  }

  private async listenToImportProgress(): Promise<void> {
    try {

      const unlistenProgress = await listen('import-progress', (event: any) => {
        const payload = event.payload as RustImportProgress;

        this.ngZone.run(() => {

          const progress: ImportProgress = {
            message: payload.message,
            processedCount: payload.processed_count,
            importedCount: payload.imported_count,
            skippedCount: payload.skipped_count,
            totalToImport: payload.total_to_import,
            isError: false,

            isComplete: payload.message.toLowerCase().includes('completed') || payload.message.toLowerCase().includes('finished'),
          };
          this.importProgressSubject.next(progress);
        });
      });



      const unlistenStatus = await listen('IMPORT_STATUS', (event: any) => {
        const message = event.payload as string;


        if (message.startsWith('Import started')) return;

        this.ngZone.run(() => {
          const isError = message.startsWith('Error');
          const isComplete = message.toLowerCase().includes('completed') || message.toLowerCase().includes('finished') || isError;


          const currentState = this.importProgressSubject.value;
          this.importProgressSubject.next({
            message: message,
            processedCount: currentState?.processedCount ?? 0,
            importedCount: currentState?.importedCount ?? 0,
            skippedCount: currentState?.skippedCount ?? 0,
            totalToImport: currentState?.totalToImport ?? null,
            isError: isError,
            isComplete: isComplete,
          });
        });
      });


      this.unlistenFns = [unlistenProgress, unlistenStatus];

    } catch (error) {
      console.error("Failed to start listening for import events:", error);
      this.ngZone.run(() => {
        this.importProgressSubject.next({
          message: "Error connecting to the progress event.",
          processedCount: 0,
          importedCount: 0,
          skippedCount: 0,
          totalToImport: null,
          isError: true,
          isComplete: true,
        });
      });
    }
  }

  public clearImportProgress(): void {
    this.importProgressSubject.next(null);
  }

  async importPuzzlesFromDb(options: ImportOptions): Promise<void> {
    try {

      this.clearImportProgress();

      await invoke<void>('import_puzzles_from_db', {
        payload: options,
      });
    } catch (error) {
      console.error("Error starting DB import:", error);

      this.ngZone.run(() => {
        this.importProgressSubject.next({
          message: `Error starting command: ${String(error)}`,
          processedCount: 0,
          importedCount: 0,
          skippedCount: 0,
          totalToImport: null,
          isError: true,
          isComplete: true,
        });
      });

    }
  }

  async importPuzzlesFromCsv(deckId: number, csvContent: string): Promise<void> {
    try {
      this.clearImportProgress();
      await invoke('import_puzzles_from_csv', {
        payload: {
          deck_id: deckId,
          csv_content: csvContent
        }
      });
    } catch (error) {
      console.error("Error starting CSV import:", error);
      this.ngZone.run(() => {

        this.importProgressSubject.next({
          message: `Error starting import: ${String(error)}`,
          processedCount: 0,
          importedCount: 0,
          skippedCount: 0,
          totalToImport: null,
          isError: true,
          isComplete: true,
        });
      });
    }
  }


  ngOnDestroy() {
    this.unlistenFns.forEach(fn => fn());
    this.unlistenFns = [];
  }


  async getPuzzleDbStatus(): Promise<DbStatus> {
    try {
      return await invoke('get_puzzle_db_status');
    } catch (e) {
      console.error('Failed to get puzzle DB status:', e);
      throw new Error(`Failed to get DB status: ${e}`);
    }
  }

  async checkForUpdate(): Promise<boolean> {
    return invoke('check_for_update');
  }

  async startDatabaseDownloadAndIndex(): Promise<void> {
    try {
      await invoke('start_database_download_and_index');
    } catch (e) {
      console.error('Failed to start DB download/index:', e);
      throw new Error(`Failed to start download: ${e}`);
    }
  }

  async getAllDecks(): Promise<DeckInfo[]> {
    return invoke('get_all_decks');
  }

  async createDeck(deckName: string): Promise<number> {
    return invoke('create_deck', { deckName });
  }

  async deleteDeck(deckId: number): Promise<void> {
    return invoke('delete_deck', { deckId });
  }



  async getCardsInDeck(deckId: number): Promise<CardInfo[]> {
    return invoke('get_cards_in_deck', { deckId });
  }

  async getCard(cardId: number): Promise<BrowseCardInfo> {
    return invoke('get_card_by_id', { cardId });
  }


  async updateChessNote(payload: { noteId: number; fen: string; solution: string; comment: string; }): Promise<void> {
    return invoke('update_chess_note', { payload });
  }

  async browseCardsInDeck(
    deckId: number,
    page: number,
    pageSize: number,
    filterText: string = '',
    sortOrder: string = 'default'
  ): Promise<PaginatedBrowseResult> {
    try {
      return await invoke('browse_cards_in_deck', {
        options: {
          deckId: deckId,
          page: page,
          pageSize: pageSize,
          filterText: filterText,
          sortOrder: sortOrder
        },
      });
    } catch (e) {
      console.error('Failed to browse cards:', e);
      throw new Error(`Failed to browse cards: ${e}`);
    }
  }

  async addChessNote(payload: {
    deck_id: number;
    fen: string;
    solution: string;
    comment: string;
  }): Promise<number> {
    return invoke('add_chess_note', { payload });
  }

  async deleteNotes(noteIds: number[]): Promise<void> {
    return invoke('delete_notes', { noteIds });
  }



  async getNextCard(deckId: number): Promise<StudyCard | null> {
    try {
      return await invoke('get_next_card', { deckId });
    } catch (e) {
      console.error("Failed to get next card:", e);
      return null;
    }
  }

  async answerCard(cardId: number, rating: 1 | 2 | 3 | 4): Promise<void> {
    try {
      await invoke('answer_card', { cardId, rating });
    } catch (e) {
      console.error("Failed to answer card:", e);
    }
  }

  async getDeckLimits(deckId: number): Promise<DeckLimitsPayload> {
    try {
      return await invoke('get_deck_limits', { deckId });
    } catch (e) {
      console.error("Failed to get deck limits:", e);
      throw new Error(`Failed to get limits for deck ${deckId}: ${e}`);
    }
  }

  async setDeckLimits(deckId: number, limits: DeckLimitsPayload): Promise<void> {
    try {
      await invoke('set_deck_limits', { deckId, limits });
    } catch (e) {
      console.error("Failed to set deck limits:", e);
      throw new Error(`Failed to set limits for deck ${deckId}: ${e}`);
    }
  }

  async exportDeckToCsv(deckId: number, deckName: string): Promise<number> {
    try {

      const filePath = await save({
        title: `Export ${deckName}`,
        defaultPath: `${deckName.replace(/\s+/g, '_')}_export.csv`,
        filters: [{
          name: 'CSV Files',
          extensions: ['csv']
        }]
      });

      if (!filePath) {
        return -1;
      }


      const count = await invoke<number>('export_deck_to_csv', {
        deckId: deckId,
        filePath: filePath
      });

      console.log(`Exported ${count} puzzles successfully.`);
      return count;
    } catch (e) {
      console.error('Failed to export deck:', e);
      throw new Error(`Failed to export deck: ${e}`);
    }
  }

  async cleanupUnusedPuzzles(): Promise<number> {
    try {
      return await invoke('cleanup_unused_puzzles');
    } catch (e) {
      console.error('Failed to cleanup puzzles:', e);
      throw new Error(`Failed to cleanup puzzles: ${e}`);
    }
  }
}