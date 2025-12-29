import { Component, OnInit, OnDestroy, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { TauriService, ImportProgress } from '../../core/services/tauri.service';
import { DbStateService } from '../../core/services/db-state.service';
import { DeckInfo } from '../../core/models/deck.models';
import { ImportOptions } from '../../core/models/db.models';
import { ImportOptionsComponent } from '../../shared/components/import-options/import-options';
import { ModalComponent } from '../../shared/components/modal/modal.component';
import { DeckSettingsComponent } from '../deck-settings/app-deck-settings';

@Component({
  selector: 'app-deck-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ImportOptionsComponent,
    ModalComponent,
    DeckSettingsComponent
  ],
  templateUrl: './app-deck-list.html',
  styleUrls: ['./app-deck-list.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckListComponent implements OnInit, OnDestroy {
  public apiService = inject(TauriService);
  private router = inject(Router);
  public dbStateService = inject(DbStateService);

  decks = signal<DeckInfo[]>([]);
  isLoading = signal(true);
  error = signal<string | null>(null);

  importProgress = signal<ImportProgress | null>(null);

  showDbMissingModal = signal(false);
  showImportModalForDeck = signal<DeckInfo | null>(null);
  showSettingsForDeck = signal<DeckInfo | null>(null);

  showDeleteModal = signal(false);
  deckToDelete = signal<{ id: number; name: string } | null>(null);

  showCreateModal = signal(false);
  newDeckName = signal('');

  openDropdownId = signal<number | null>(null);
  private importSub: Subscription | null = null;

  async ngOnInit() {
    await this.loadDecks();

    this.importSub = this.apiService.importProgress$.subscribe(progress => {
      this.importProgress.set(progress);
      if (progress?.isComplete && !progress?.isError) {
        this.loadDecks();
      }
    });
  }

  ngOnDestroy() {
    this.importSub?.unsubscribe();
  }

  async loadDecks() {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const deckList = await this.apiService.getAllDecks();
      this.decks.set(deckList);
    } catch (e: any) {
      console.error('Failed to load decks', e);
      this.error.set(e?.message || String(e) || 'Unknown error loading decks.');
    } finally {
      this.isLoading.set(false);
    }
  }

  openCreateDeckModal() {
    this.newDeckName.set('');
    this.showCreateModal.set(true);
  }

  closeCreateDeckModal() {
    this.showCreateModal.set(false);
  }

  async confirmCreateDeck() {
    const name = this.newDeckName().trim();
    if (!name) return;

    try {
      await this.apiService.createDeck(name);
      await this.loadDecks();
      this.closeCreateDeckModal();
    } catch (e: any) {
      console.error('Failed to create deck', e);
      alert(`Error creating deck: ${e}`);
    }
  }

  deleteDeck(deckId: number, deckName: string) {
    this.closeDropdown();
    this.deckToDelete.set({ id: deckId, name: deckName });
    this.showDeleteModal.set(true);
  }

  async confirmDelete() {
    const deck = this.deckToDelete();
    if (!deck) return;

    this.isLoading.set(true);
    this.error.set(null);
    try {
      await this.apiService.deleteDeck(deck.id);
      await this.loadDecks();
    } catch (e: any) {
      console.error(`Failed to delete deck ${deck.id}`, e);
      this.error.set(e?.message || String(e) || `Error deleting deck ${deck.id}.`);
    } finally {
      if (this.error()) {
        this.isLoading.set(false);
      }
      this.cancelDelete();
    }
  }

  cancelDelete() {
    this.showDeleteModal.set(false);
    this.deckToDelete.set(null);
  }

  navigateToStudy(deckId: number) { this.router.navigate(['/study', deckId]); }
  navigateToAddCard(deckId: number) { this.closeDropdown(); this.router.navigate(['/deck', deckId, 'add-card']); }
  navigateToBrowseCards(deckId: number) { this.closeDropdown(); this.router.navigate(['/browse', deckId]); }

  navigateToSettingsDeck(deckId: number) {
    this.closeDropdown();
    const deck = this.decks().find(d => d.id === deckId);
    if (deck) {
      this.showSettingsForDeck.set(deck);
    }
  }

  closeSettingsModal() {
    this.showSettingsForDeck.set(null);
  }

  openImportModal(deck: DeckInfo) {
    if (!this.dbStateService.isInstalled()) {
      this.showDbMissingModal.set(true);
      return;
    }
    this.closeDropdown();
    this.apiService.clearImportProgress();
    this.showImportModalForDeck.set(deck);
  }

  closeImportModal() { this.showImportModalForDeck.set(null); }

  async onImportCompleted(options: ImportOptions) {
    this.closeImportModal();
    await this.apiService.importPuzzlesFromDb(options);
  }

  formatBytes(bytes: number | undefined, decimals = 2): string {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  formatDate(timestamp: number | null | undefined): string {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString();
  }

  getDownloadPercentage(): number {
    const progress = this.dbStateService.downloadProgress();
    if (!progress || progress.total === 0) return 0;
    return (progress.downloaded / progress.total) * 100;
  }

  toggleDropdown(deckId: number, event: MouseEvent) {
    event.stopPropagation();
    this.openDropdownId.update(id => (id === deckId ? null : deckId));
  }

  closeDropdown() {
    this.openDropdownId.set(null);
  }

  onImportStarted(message: string) {
    this.importProgress.set({
      message: message,
      processedCount: 0,
      importedCount: 0,
      skippedCount: 0,
      totalToImport: null,
      isError: false,
      isComplete: false
    });
    this.closeImportModal();
  }

  async exportDeck(deckId: number, deckName: string) {
    this.closeDropdown();
    try {
      this.isLoading.set(true);
      const count = await this.apiService.exportDeckToCsv(deckId, deckName);
      let exportMessage = 'Deck exported successfully!';
      if (count === -1) exportMessage = 'Export cancelled by user.';
      alert(exportMessage);
    } catch (e) {
      console.error(e);
      alert(`Error exporting deck: ${e}`);
    } finally {
      this.isLoading.set(false);
    }
  }
}