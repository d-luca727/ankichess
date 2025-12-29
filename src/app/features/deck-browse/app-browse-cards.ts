import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms'; 
import { TauriService } from '../../core/services/tauri.service';
import { BrowseCardInfo, PaginatedBrowseResult } from '../../core/models/card.models';
import { ModalComponent } from '../../shared/components/modal/modal.component';
import { ChessThumbnail } from '../../shared/components/chess-thumbnail/chess-thumbnail';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { Color } from '@lichess-org/chessground/types';
import { TruncatePipe } from '../../shared/pipes/text.pipe';

@Component({
  selector: 'app-browse-cards',
  standalone: true,
  imports: [
    CommonModule, 
    RouterLink, 
    FormsModule, 
    ModalComponent,  
    ChessThumbnail,
    TruncatePipe
  ],
  templateUrl: './app-browse-cards.html',
  styleUrls: ['./app-browse-cards.css']
})
export class AppBrowseCards implements OnInit {
  private apiService = inject(TauriService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  deckId!: number;
  
  
  protected allLoadedCards = signal<BrowseCardInfo[]>([]);
  
  
  filteredCards = computed(() => this.allLoadedCards());
  
  isLoading = signal<boolean>(true);
  errorMessage = signal<string>('');
  deckName = signal<string>('');

  public readonly PAGE_SIZE = 50;
  protected currentPage = signal<number>(1);
  totalCards = signal<number>(0);
  isLoadingMore = signal<boolean>(false);

  
  searchTerm = signal<string>('');
  sortBy = signal<'default' | 'rating-desc' | 'rating-asc' | 'popularity'>('default');
  
  
  showSearchHelp = signal(false);

  
  private searchSubject = new Subject<string>();

  
  showModal = signal(false);
  modalTitle = signal('');
  modalMessage = signal('');
  modalConfirmText = signal('');
  modalCancelText = signal('');
  confirmAction: (() => void) | null = null;

  constructor() {
    
    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged()
    ).subscribe(term => {
      this.performSearch();
    });
  }

  ngOnInit() {
    this.deckId = Number(this.route.snapshot.paramMap.get('deckId'));
    this.loadCards(false);

    this.apiService.getAllDecks().then(decks => {
       const currentDeck = decks.find(d => d.id === this.deckId);
       this.deckName.set(currentDeck?.name ?? `Deck ${this.deckId}`);
    });
  }

  async loadCards(append: boolean = false) {
    if (append) {
      this.isLoadingMore.set(true);
    } else {
      this.isLoading.set(true);
      if (!append) this.allLoadedCards.set([]); 
    }
    this.errorMessage.set('');

    try {
      const result: PaginatedBrowseResult = await this.apiService.browseCardsInDeck(
        this.deckId,
        this.currentPage(),
        this.PAGE_SIZE,
        this.searchTerm(), 
        this.sortBy()      
      );

      this.totalCards.set(result.totalCards);

      if (append) {
        this.allLoadedCards.update(current => [...current, ...result.cards]);
      } else {
        this.allLoadedCards.set(result.cards);
      }

    } catch (error) {
      console.error('Error loading cards:', error);
      this.errorMessage.set(`Error loading cards: ${error}`);
    } finally {
      this.isLoading.set(false);
      this.isLoadingMore.set(false);
    }
  }

  loadMore() {
    if (this.isLoadingMore() || this.allLoadedCards().length >= this.totalCards()) {
      return;
    }
    this.currentPage.update(page => page + 1);
    this.loadCards(true);
  }

  
  onSearch(term: string) {
    this.searchTerm.set(term);
    this.searchSubject.next(term);
  }

  
  private performSearch() {
    this.currentPage.set(1);
    this.loadCards(false);
  }

  onSort(sortValue: string) {
    this.sortBy.set(sortValue as any);
    this.currentPage.set(1);
    this.loadCards(false);
  }

  toggleSearchHelp() {
    this.showSearchHelp.update(v => !v);
  }

  deleteCardNote(noteId: number) {
    this.modalTitle.set('Confirm Deletion');
    this.modalMessage.set(`Are you sure you want to delete note ${noteId}?`);
    this.modalConfirmText.set('Delete');
    this.modalCancelText.set('Cancel');
    this.confirmAction = async () => {
      try {
        await this.apiService.deleteNotes([noteId]);
        this.currentPage.set(1);
        this.loadCards(false);
      } catch (error) { this.showAlert(`Error: ${error}`); }
    };
    this.showModal.set(true);
  }

  editCard(cardId: number) { 
    this.router.navigate(['/deck', this.deckId, 'edit-card', cardId]); 
  }
  
  showAlert(message: string) { 
    this.modalTitle.set('Info'); 
    this.modalMessage.set(message); 
    this.showModal.set(true); 
  }
  
  onConfirm() { if (this.confirmAction) this.confirmAction(); this.closeModal(); }
  closeModal() { this.showModal.set(false); }

  getOrientation(fen: string): Color {
    if (!fen) return 'white';
    const parts = fen.split(' ');
    return parts[1] === 'w' ? 'white' : 'black';
  }
}