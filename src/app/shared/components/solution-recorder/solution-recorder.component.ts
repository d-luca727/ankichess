import { Component, Input, ElementRef, viewChild, AfterViewInit, OnDestroy, OnChanges, SimpleChanges, signal, computed, effect, inject, Output, EventEmitter, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { parseUci, parseSquare, makeUci } from 'chessops/util';
import { makeSan } from 'chessops/san';
import { chessgroundDests } from 'chessops/compat';
import { Chessground } from '@lichess-org/chessground';
import type { Api as ChessgroundApi } from '@lichess-org/chessground/api';
import type { Config } from '@lichess-org/chessground/config';
import type { Color, Key, Role } from '@lichess-org/chessground/types';
import { AudioService } from '../../../core/services/audio.service';

interface HistoryStep {
  fen: string;
  uci: string | null;
  san: string | null;
  dests: Map<Key, Key[]>;
}

@Component({
  selector: 'app-solution-recorder',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './solution-recorder.component.html',
  styleUrls: ['./solution-recorder.component.css']
})
export class SolutionRecorderComponent implements AfterViewInit, OnChanges, OnDestroy {
  private boardContainer = viewChild.required<ElementRef<HTMLDivElement>>('board');
  private ngZone = inject(NgZone);
  private audioService = inject(AudioService);

  @Input() initialFen: string = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  @Input() moveList: string[] = []; 
  @Input() orientation: Color = 'white';
  @Output() solutionChange = new EventEmitter<string[]>();
  @Output() currentFenChange = new EventEmitter<string>();

  private cg: ChessgroundApi | null = null;
  history = signal<HistoryStep[]>([]);
  currentIndex = signal<number>(0);
  promotionData = signal<{ from: Key; to: Key; color: Color } | null>(null);
  readonly promotionChoices: Role[] = ['queen', 'rook', 'bishop', 'knight'];

  currentStep = computed(() => this.history()[this.currentIndex()]);
  
  constructor() {
    this.audioService.preloadSound('move', 'assets/sounds/move.wav');
    this.audioService.preloadSound('capture', 'assets/sounds/capture.wav');
    
    effect(() => {
      const step = this.currentStep();
      if (this.cg && step) {
        // Aggiorna la board fuori dalla zona per fluidità
        this.ngZone.runOutsideAngular(() => {
          this.cg?.set({
            fen: step.fen,
            lastMove: step.uci ? [step.uci.slice(0, 2) as Key, step.uci.slice(2, 4) as Key] : undefined,
            turnColor: parseFen(step.fen).unwrap().turn,
            movable: { color: parseFen(step.fen).unwrap().turn, dests: step.dests }
          });
        });
        this.currentFenChange.emit(step.fen);
      }
    });
  }

  ngAfterViewInit() {
    this.initBoard();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['initialFen'] && !changes['initialFen'].isFirstChange()) {
      this.initBoard();
    } else if (changes['moveList'] && !changes['moveList'].isFirstChange()) {
      // FIX: Evita il rebuild se la lista è identica a quella interna (causa del lag)
      const currentUcis = this.history().filter(h => h.uci !== null).map(h => h.uci);
      if (JSON.stringify(this.moveList) !== JSON.stringify(currentUcis)) {
        this.rebuildHistoryFromMoves(this.moveList);
      }
    }
    if (changes['orientation'] && this.cg) {
      this.cg.set({ orientation: this.orientation });
    }
  }

  ngOnDestroy() {
    this.cg?.destroy();
  }

  initBoard() {
    this.ngZone.runOutsideAngular(() => {
      try {
        const setup = parseFen(this.initialFen).unwrap();
        const pos = Chess.fromSetup(setup).unwrap();
        const firstStep: HistoryStep = { fen: this.initialFen, uci: null, san: null, dests: chessgroundDests(pos) };
        
        this.ngZone.run(() => {
          this.history.set([firstStep]);
          this.currentIndex.set(0);
        });

        if (!this.cg && this.boardContainer()) {
          const config: Config = {
            fen: this.initialFen,
            orientation: this.orientation,
            movable: { 
              free: false, 
              color: setup.turn, 
              dests: firstStep.dests, 
              events: { after: (orig, dest) => this.ngZone.run(() => this.onMove(orig, dest)) } 
            },
            animation: { enabled: true, duration: 200 }
          };
          this.cg = Chessground(this.boardContainer().nativeElement, config);
        }
      } catch (e) { console.error(e); }
    });
  }

  private rebuildHistoryFromMoves(ucis: string[]) {
    try {
      const setup = parseFen(this.initialFen).unwrap();
      let pos = Chess.fromSetup(setup).unwrap();
      const newHistory: HistoryStep[] = [{ fen: this.initialFen, uci: null, san: null, dests: chessgroundDests(pos) }];

      for (const uci of ucis) {
        const move = parseUci(uci);
        if (!move) break;
        const san = makeSan(pos, move);
        pos.play(move);
        newHistory.push({
          fen: makeFen(pos.toSetup()),
          uci: uci,
          san: san,
          dests: chessgroundDests(pos)
        });
      }

      this.history.set(newHistory);
      this.currentIndex.set(newHistory.length - 1);
    } catch (e) { console.error(e); }
  }

  private onMove(orig: Key, dest: Key) {
    const step = this.currentStep();
    const setup = parseFen(step.fen).unwrap();
    const pos = Chess.fromSetup(setup).unwrap();
    const piece = pos.board.get(parseSquare(orig)!);
    
    if (piece?.role === 'pawn' && ((dest[1] === '8' && setup.turn === 'white') || (dest[1] === '1' && setup.turn === 'black'))) {
      this.promotionData.set({ from: orig, to: dest, color: setup.turn });
      this.cg?.set({ movable: { color: undefined } });
      return;
    }
    this.handleMove(orig, dest);
  }

  handleMove(orig: Key, dest: Key, promotion?: string) {
    const uci = `${orig}${dest}${promotion || ''}`;
    const step = this.currentStep();
    const pos = Chess.fromSetup(parseFen(step.fen).unwrap()).unwrap();
    const move = parseUci(uci);
    if (!move) return;
    
    const san = makeSan(pos, move);
    const isCapture = san.includes('x');
    pos.play(move);
    
    const newStep: HistoryStep = {
      fen: makeFen(pos.toSetup()),
      uci: uci,
      san: san,
      dests: chessgroundDests(pos)
    };

    const newHistory = this.history().slice(0, this.currentIndex() + 1);
    newHistory.push(newStep);
    
    this.history.set(newHistory);
    this.currentIndex.set(newHistory.length - 1);
    this.audioService.playSound(isCapture ? 'capture' : 'move');
    this.emitSolution();
  }

  onPromotionSelect(role: Role) {
    const data = this.promotionData();
    if (!data) return;
    this.promotionData.set(null);
    this.handleMove(data.from, data.to, role.charAt(0) === 'k' ? 'n' : role.charAt(0));
  }

  emitSolution() {
    const moves = this.history().filter(h => h.uci !== null).map(h => h.uci as string);
    this.solutionChange.emit(moves);
  }

  goTo(index: number) {
    if (index >= 0 && index < this.history().length) {
      this.currentIndex.set(index);
      this.audioService.playSound('move');
    }
  }

  prev() { this.goTo(this.currentIndex() - 1); }
  next() { this.goTo(this.currentIndex() + 1); }
  reset() { this.goTo(0); this.emitSolution(); }
  jumpToEnd() { this.goTo(this.history().length - 1); }
  flip() { this.cg?.toggleOrientation(); }
}