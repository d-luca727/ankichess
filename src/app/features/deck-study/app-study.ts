import { Component, OnInit, inject, signal, ChangeDetectionStrategy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TauriService } from '../../core/services/tauri.service';
import { UpdatedStudyCard } from '../../core/models/card.models';
import { ChessPuzzle } from '../../shared/components/chess-puzzle/chess-puzzle';
import { ChessAnalysisComponent } from '../../shared/components/chess-analysis/chess-analysis';
import { FormatSecondsPipe } from '../../shared/pipes/format-seconds.pipe';
import { InteractiveCommentComponent } from '../../shared/components/interactive-comment/interactive-comment.component';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-study',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, ChessPuzzle, ChessAnalysisComponent, FormatSecondsPipe, InteractiveCommentComponent],
  templateUrl: './app-study.html',
  styleUrls: ['./app-study.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudyComponent implements OnInit {
  private apiService = inject(TauriService);
  private route = inject(ActivatedRoute);

  deckId!: number;
  currentCard = signal<UpdatedStudyCard | null>(null);
  feedbackMessage = signal<string>('');
  
  
  showAnswerButtons = signal<boolean>(false);
  incorrectMove = signal<boolean>(false);
  isAnalyzing = signal<boolean>(false);

  isEditingComment = signal<boolean>(false);
  commentText = signal<string>('');

  @ViewChild(ChessAnalysisComponent) analysisComponent?: ChessAnalysisComponent;

  ngOnInit() {
    this.deckId = Number(this.route.snapshot.paramMap.get('deckId'));
    this.loadNextCard();
  }

  async loadNextCard() {
    this.feedbackMessage.set('');
    this.showAnswerButtons.set(false);
    this.incorrectMove.set(false);
    this.isAnalyzing.set(false);
    this.isEditingComment.set(false);
    this.currentCard.set(null);

    try {
      
      const cardFromApi = await this.apiService.getNextCard(this.deckId);

      if (cardFromApi) {
        
        let orientation: 'white' | 'black' = cardFromApi.fen.includes(' w ') ? 'white' : 'black';
        
        
        if (cardFromApi.hasSetupMove) {
             orientation = cardFromApi.fen.includes(' w ') ? 'black' : 'white';
        }

        const card: UpdatedStudyCard = {
          ...cardFromApi,
          orientation: orientation
        };
        
        this.currentCard.set(card);
      } else {
        this.feedbackMessage.set("Congratulations! You have finished the cards in this deck for today. 🎉");
      }
    } catch (error) {
      console.error("Failed to load the next card", error);
      this.feedbackMessage.set("Error loading the card.");
    }
  }

  startEditComment() {
    const card = this.currentCard();
    if (card) {
      this.commentText.set(card.comment || '');
      this.isEditingComment.set(true);
    }
  }

  cancelEditComment() {
    this.isEditingComment.set(false);
  }

  async saveComment() {
    const card = this.currentCard();
    if (!card) return;

    try {
      const solutionStr = card.moves.join(' ');
      const newComment = this.commentText();

      await this.apiService.updateChessNote({
        noteId: card.noteId,
        fen: card.fen,
        solution: solutionStr,
        comment: newComment
      });

      this.currentCard.update(c => c ? { ...c, comment: newComment } : null);
      this.isEditingComment.set(false);
      
    } catch (e) {
      console.error('Failed to update comment', e);
      alert('Error updating comment');
    }
  }

  handlePuzzleSolved(): void {
    this.feedbackMessage.set('Correct! Rate the difficulty:');
    this.incorrectMove.set(false);
    this.showAnswerButtons.set(true);
  }

  handleIncorrectMove(): void {
    this.feedbackMessage.set('Incorrect move. Review the position and rate it');
    this.incorrectMove.set(true);
    this.showAnswerButtons.set(true);
  }

  handleCommentVariation(uciMoves: string[]) {
    
    if (!this.isAnalyzing()) {
      this.isAnalyzing.set(true);
      
      setTimeout(() => {
        this.analysisComponent?.playVariation(uciMoves);
      });
    } else {
      
      this.analysisComponent?.playVariation(uciMoves);
    }
  }

  toggleAnalysis(): void {
    this.isAnalyzing.update(v => !v);
  }

  async rateCard(rating: 1 | 2 | 3 | 4): Promise<void> {
    const card = this.currentCard();
    if (!card) return;

    this.feedbackMessage.set('Answer registered...');

    try {
      
      await this.apiService.answerCard(card.cardId, rating);
      this.feedbackMessage.set('Loading next card...');
      await this.loadNextCard();
    } catch (error) {
      console.error("Failed to answer card", error);
      this.feedbackMessage.set("Error registering the answer.");
    }
  }
}