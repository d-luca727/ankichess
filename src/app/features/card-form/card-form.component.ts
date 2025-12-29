import { Component, inject, OnInit, signal, computed, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { TauriService } from '../../core/services/tauri.service';
import { BoardEditorComponent } from '../../shared/components/board-editor/board-editor.component';
import { SolutionRecorderComponent } from '../../shared/components/solution-recorder/solution-recorder.component';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseUci, makeUci } from 'chessops/util';
import { makeSan, parseSan } from 'chessops/san';
import { Color } from '@lichess-org/chessground/types';
import { InteractiveCommentComponent } from '../../shared/components/interactive-comment/interactive-comment.component';

@Component({
  selector: 'app-card-form',
  standalone: true,
  imports: [CommonModule, FormsModule, BoardEditorComponent, SolutionRecorderComponent,InteractiveCommentComponent],
  templateUrl: './card-form.component.html',
  styleUrls: ['./card-form.component.css']
})
export class CardFormComponent implements OnInit {
  private apiService = inject(TauriService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  @ViewChild('recorder') recorder?: SolutionRecorderComponent;

  deckId!: number;
  cardId: number | null = null;
  mode: 'create' | 'edit' = 'create';
  noteId!: number;

  fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  orientation: Color = 'white';
  currentAnalysisFen = signal<string>('');
  
  solutionUci = signal<string>(''); 
  solutionInput = signal<string>('');
  isSolutionValid = signal<boolean>(true);

  solutionSan = computed(() => {
    const uciStr = this.solutionUci();
    if (!uciStr.trim()) return '';
    try {
      const setup = parseFen(this.fen).unwrap();
      const pos = Chess.fromSetup(setup).unwrap();
      const moves = uciStr.split(/\s+/);
      const sanMoves = [];
      for (const uci of moves) {
        const move = parseUci(uci);
        if (!move) { sanMoves.push(uci); continue; }
        sanMoves.push(makeSan(pos, move));
        pos.play(move);
      }
      return sanMoves.join(' ');
    } catch { return uciStr; }
  });

  comment = '';
  isLoading = signal(true);
  isFenValid = true;

  pageTitle = computed(() => this.mode === 'create' ? 'Add New Card' : 'Edit Card');
  submitLabel = computed(() => this.mode === 'create' ? 'Save' : 'Update');

  async ngOnInit() {
    this.deckId = Number(this.route.snapshot.paramMap.get('deckId'));
    const cardIdParam = this.route.snapshot.paramMap.get('cardId');
    if (cardIdParam) {
      this.mode = 'edit';
      this.cardId = Number(cardIdParam);
      const card = await this.apiService.getCard(this.cardId);
      this.noteId = card.noteId;
      this.fen = card.fen;
      this.solutionUci.set(card.solution);
      this.solutionInput.set(card.solution);
      this.comment = card.comment || '';
    }
    this.isLoading.set(false);
  }

  onPreviewMove(moves: string[]) {
    console.log("Variante rilevata:", moves);
  }
  
  get solutionArray(): string[] {
    return this.solutionUci().trim() ? this.solutionUci().trim().split(/\s+/) : [];
  }

  onFenChange(fen: string) { 
    this.fen = fen; 
    this.resetSolutionState();
    this.currentAnalysisFen.set(fen);
  }

  onSolutionChange(moves: string[]) {
    const uci = moves.join(' ');
    if (this.solutionUci() !== uci) {
      this.solutionUci.set(uci);
      this.solutionInput.set(uci);
    }
    this.isSolutionValid.set(true);
  }

  onCurrentFenChange(fen: string) { this.currentAnalysisFen.set(fen); }

  onManualSolutionChange(val: string) {
    this.solutionInput.set(val);
    if (!val.trim()) {
      this.solutionUci.set('');
      this.isSolutionValid.set(true);
      return;
    }
    try {
      const setup = parseFen(this.fen).unwrap();
      const pos = Chess.fromSetup(setup).unwrap();
      const ucis: string[] = [];
      for (const m of val.trim().split(/\s+/)) {
        const move = parseUci(m) || parseSan(pos, m);
        if (!move) throw new Error();
        ucis.push(makeUci(move));
        pos.play(move);
      }
      const finalUci = ucis.join(' ');
      if (this.solutionUci() !== finalUci) {
        this.solutionUci.set(finalUci);
      }
      this.isSolutionValid.set(true);
    } catch {
      this.isSolutionValid.set(false);
    }
  }

  private resetSolutionState() {
    this.solutionUci.set('');
    this.solutionInput.set('');
    this.isSolutionValid.set(true);
  }

  clearSolution() { 
    this.resetSolutionState();
    this.recorder?.initBoard();
  }

  onValidityChange(valid: boolean) { this.isFenValid = valid; }

  async onSubmit() {
    if (!this.isFenValid || !this.isSolutionValid() || !this.solutionUci().trim()) return;
    const data = { fen: this.fen, solution: this.solutionUci(), comment: this.comment };
    try {
      if (this.mode === 'create') await this.apiService.addChessNote({ ...data, deck_id: this.deckId });
      else await this.apiService.updateChessNote({ noteId: this.noteId, ...data });
      this.router.navigate(['/browse', this.deckId]);
    } catch (e) { console.error(e); }
  }

  cancel() { this.router.navigate(['/browse', this.deckId]); }
}