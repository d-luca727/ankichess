import {
  Component,
  Input,
  Output,
  EventEmitter,
  viewChild,
  ElementRef,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  AfterViewInit,
  signal,
  effect,
  HostListener,
  inject,
  ViewEncapsulation
} from '@angular/core';


import { Chess, Position } from 'chessops/chess';
import { parseFen, makeFen } from 'chessops/fen';
import { parseUci, parseSquare, makeSquare } from 'chessops/util';
import { chessgroundDests } from 'chessops/compat';
import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Config } from '@lichess-org/chessground/config';
import type { Color, Key, Role } from '@lichess-org/chessground/types';
import type { DrawShape } from '@lichess-org/chessground/draw';
import { AudioService } from '../../../core/services/audio.service'; 

@Component({
  selector: 'app-chess-puzzle',
  standalone: true,
  imports: [],
  templateUrl: './chess-puzzle.html',
  styleUrls: ['./chess-puzzle.css'],
  encapsulation: ViewEncapsulation.None
})
export class ChessPuzzle implements AfterViewInit, OnChanges, OnDestroy {
  private boardEl = viewChild.required<ElementRef<HTMLDivElement>>('board');

  @Input() setupMove: boolean = false;
  @Input({ required: true }) fen!: string;
  @Input({ required: true }) solution!: string[];
  @Input({ required: true }) orientation!: Color;

  @Output() puzzleSolved = new EventEmitter<void>();
  @Output() incorrectMove = new EventEmitter<void>();

  private cg: Api | null = null;
  private currentMoveIndex = 0;
  private position!: Position;
  
  private audioService = inject(AudioService);

  isReviewing = signal<boolean>(false);
  reviewMoveIndex = signal<number>(-1);

  
  moveFeedback = signal<{ type: 'correct' | 'incorrect', key: Key } | null>(null);

  public promotionData = signal<{ from: Key; to: Key } | null>(null);
  public readonly promotionChoices: Role[] = ['queen', 'rook', 'bishop', 'knight'];

  
  boardWidth = signal<number>(600);
  private isResizing = false;
  private startX = 0;
  private startWidth = 0;

  //uci castling mapping
  private altCastles: { [key: string]: string } = {
    //white king side
    'e1g1': 'e1h1', 'e1h1': 'e1g1',
    //white queen side
    'e1c1': 'e1a1', 'e1a1': 'e1c1',
    //black king side
    'e8g8': 'e8h8', 'e8h8': 'e8g8',
    //black queen side
    'e8c8': 'e8a8', 'e8a8': 'e8c8',
  };
  constructor() {
    this.audioService.preloadSound('move', 'assets/sounds/move.wav');
    this.audioService.preloadSound('capture', 'assets/sounds/capture.wav');
    //this.audioService.preloadSound('success', 'assets/sounds/happy.wav');
    this.audioService.preloadSound('failure', 'assets/sounds/sad.wav');

    effect(() => {
      const reviewIndex = this.reviewMoveIndex();
      const reviewing = this.isReviewing();
      if (!reviewing || !this.cg) return;
      this.updateBoardToReviewState(reviewIndex);
    });

    effect(() => {
      this.boardWidth(); 
      if (this.cg) this.cg.redrawAll();
    });
  }

  ngAfterViewInit(): void {
    this.initializeBoard();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['fen'] && !changes['fen'].isFirstChange() && this.cg) {
      this.resetPuzzle();
    }
  }

  
  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    
    if (!this.isReviewing()) {
      return;
    }

    
    switch (event.key) {
      case 'ArrowLeft':
        this.goPrevious();
        event.preventDefault(); 
        break;
      case 'ArrowRight':
        this.goNext();
        event.preventDefault();
        break;
      case 'ArrowUp':
        this.goToStart();
        event.preventDefault();
        break;
      case 'ArrowDown':
        this.goToEnd();
        event.preventDefault();
        break;
    }
  }

  
  onResizeStart(event: MouseEvent) {
    event.preventDefault();
    this.isResizing = true;
    this.startX = event.clientX;
    this.startWidth = this.boardWidth();
    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';
  }

  @HostListener('document:mousemove', ['$event'])
  onResizeMove(event: MouseEvent) {
    if (!this.isResizing) return;
    const delta = event.clientX - this.startX;
    const newWidth = Math.min(Math.max(300, this.startWidth + delta), 800);
    this.boardWidth.set(newWidth);
  }

  @HostListener('document:mouseup')
  onResizeEnd() {
    if (this.isResizing) {
      this.isResizing = false;
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
      this.cg?.redrawAll();
    }
  }

  

  private initializeBoard(): void {
    if (this.cg || !this.boardEl()) return;
    this.resetPuzzleState();
    this.cg = Chessground(this.boardEl().nativeElement, this.createConfig());
  }

  private resetPuzzleState(): void {
    this.currentMoveIndex = 0;
    this.moveFeedback.set(null); 
    const setup = parseFen(this.fen).unwrap();
    this.position = Chess.fromSetup(setup).unwrap();
    if (this.setupMove && this.solution.length > 0) {
      this.playSetupMove();
    }
  }

  private playSetupMove(): void {
    const opponentMoveUci = this.solution[0];
    const move = parseUci(opponentMoveUci);
    
    if (move) {
      this.position.play(move);
      this.currentMoveIndex = 1; 
    }
  }

  private resetPuzzle(): void {
    if (!this.cg) return;
    this.isReviewing.set(false);
    this.reviewMoveIndex.set(-1);
    this.resetPuzzleState();
    this.cg.set(this.createConfig());
  }

  private createConfig(): Config {
    let lastMove: [Key, Key] | undefined = undefined;
    const currentFen = makeFen(this.position.toSetup());

    if (this.setupMove && this.solution.length > 0) {
       const uci = this.solution[0];
       const from = uci.substring(0, 2) as Key;
       const to = uci.substring(2, 4) as Key;
       lastMove = [from, to];
    }

    return {
      fen: currentFen,
      orientation: this.orientation,
      turnColor: this.orientation,
      viewOnly: false,
      lastMove: lastMove,
      coordinates: true, 
      movable: {
        color: this.orientation,
        free: false,
        dests: this.getValidDests(),
      },
      highlight: {
        lastMove: true,
        check: true
      },
      premovable:{
        enabled:false
      },
      drawable: {
        enabled: true,
        visible: true, 
        defaultSnapToValidMove: true,
      },
      events: {
        move: (orig, dest) => this.handleUserMove(orig, dest),
      },
      animation: { enabled: true, duration: 200 },
      draggable: { enabled: true },
      selectable: { enabled: true },
    };
  }

  public viewSolution(): void {
    if (!this.cg || !this.solution || this.isReviewing()) return;
    const solutionMoveUci = this.solution[this.currentMoveIndex];
    if (!solutionMoveUci) return;

    const from = solutionMoveUci.substring(0, 2) as Key;
    const to = solutionMoveUci.substring(2, 4) as Key;

    this.cg.setShapes([{ orig: from, dest: to, brush: 'green' }]);
  }

  private handleUserMove(orig: Key, dest: Key): void {
    this.cg?.setShapes([]); 

    const piece = this.position.board.get(parseSquare(orig)!);
    const isPawn = piece?.role === 'pawn';
    const promotionRank = this.orientation === 'white' ? '8' : '1';

    if (isPawn && dest.endsWith(promotionRank)) {
      this.promotionData.set({ from: orig, to: dest });
      this.cg?.set({ movable: { color: undefined, dests: new Map() } });
    } else {
      this.processMove(`${orig}${dest}`);
    }
  }

  public onPromotionSelect(role: Role): void {
    const currentPromotionData = this.promotionData();
    if (!currentPromotionData) return;

    const { from, to } = currentPromotionData;
    
    
    let promotionChar: string;
    if (role === 'knight') {
      promotionChar = 'n';
    } else {
      promotionChar = role.charAt(0);
    }

    this.promotionData.set(null);
    this.cg?.set({ movable: { color: this.orientation, dests: this.getValidDests() } });

    this.processMove(`${from}${to}${promotionChar}`);
  }

  private processMove(userMoveUci: string): void {
    if (!this.cg || this.isReviewing()) return;

    const expectedMoveUci = this.solution[this.currentMoveIndex];
    const move = parseUci(userMoveUci);

    if (!move) {
      this.handleIncorrectMove(userMoveUci);
      return;
    }

    if (this.currentMoveIndex % 2 !== 0 && !this.setupMove) return;
    if (this.currentMoveIndex % 2 !== 1 && this.setupMove) return;

    const isCorrect = (userMoveUci === expectedMoveUci) ||
      (this.altCastles[userMoveUci] === expectedMoveUci);

    const orig = userMoveUci.substring(0, 2) as Key;
    const dest = userMoveUci.substring(2, 4) as Key;
    const capture = this.isCapture(userMoveUci);

    this.position.play(move);

    if (isCorrect) {
      
      
      this.cg.set({
        fen: makeFen(this.position.toSetup()),
        check: this.position.isCheck(),
        lastMove: [orig, dest],
        turnColor: this.position.turn 
      });

      this.moveFeedback.set({ type: 'correct', key: dest });
      this.playSound(capture ? 'capture' : 'move');
      this.currentMoveIndex++;

      if (this.currentMoveIndex < this.solution.length) {
        setTimeout(() => {
            this.moveFeedback.set(null); 
            this.playComputerMove();
        }, 500); 
      } else {
        setTimeout(() => this.moveFeedback.set(null), 1000);
        this.onPuzzleSolved();
      }

    } else {
      

      this.cg.set({
        fen: makeFen(this.position.toSetup()),
        lastMove: [orig, dest]
      });

      this.moveFeedback.set({ type: 'incorrect', key: dest });
      this.playSound('failure');

      this.cg.set({ movable: { color: undefined } });

      setTimeout(() => {
        this.moveFeedback.set(null);
        this.revertToPreviousState();
      }, 800);
    }
  }

  private revertToPreviousState(): void {
    if (!this.cg) return;

    const setup = parseFen(this.fen).unwrap();
    this.position = Chess.fromSetup(setup).unwrap();

    for (let i = 0; i < this.currentMoveIndex; i++) {
        const move = parseUci(this.solution[i]);
        if (move) this.position.play(move);
    }

    this.cg.set({
      fen: makeFen(this.position.toSetup()),
      check: this.position.isCheck(),
      lastMove: this.currentMoveIndex > 0 ? [
          this.solution[this.currentMoveIndex - 1].substring(0, 2) as Key,
          this.solution[this.currentMoveIndex - 1].substring(2, 4) as Key
      ] : undefined,
      movable: { 
          color: this.orientation, 
          dests: this.getValidDests(),
          free: false
      },
      turnColor: this.orientation
    });
    
    this.cg.setShapes([]);
  }

  private handleIncorrectMove(uci: string): void {
      this.playSound('failure');
      this.incorrectMove.emit();
  }

  private playComputerMove(): void {
    if (!this.cg) return;

    const computerMoveUci = this.solution[this.currentMoveIndex];
    const move = parseUci(computerMoveUci);
    if (!move) return;

    const orig = computerMoveUci.substring(0, 2) as Key;
    const dest = computerMoveUci.substring(2, 4) as Key;
    const capture = this.isCapture(computerMoveUci);

    this.position.play(move);
    this.cg.set({
      fen: makeFen(this.position.toSetup()),
      turnColor: this.orientation,
      movable: { color: this.orientation, dests: this.getValidDests() },
      check: this.position.isCheck(),
      lastMove: [orig, dest]
    });

    this.playSound(capture ? 'capture' : 'move');

    this.currentMoveIndex++;

    if (this.currentMoveIndex >= this.solution.length) {
      this.onPuzzleSolved();
    }
  }

  private onPuzzleSolved(): void {
    this.puzzleSolved.emit();
    this.isReviewing.set(true);
    this.reviewMoveIndex.set(this.solution.length - 1);
    if (this.cg) {
      this.cg.set({ movable: { color: undefined, dests: new Map() } });
      this.cg.setShapes([]); 
    }
  }
  
  private playSound(soundName: string): void {
    this.audioService.playSound(soundName);
  }

  private isCapture(moveUci: string): boolean {
    const from = parseSquare(moveUci.slice(0, 2));
    const to = parseSquare(moveUci.slice(2, 4));
    if (from === undefined || to === undefined) return false;
    if (this.position.board.get(to)) return true;
    const piece = this.position.board.get(from);
    if (piece?.role === 'pawn') {
      const fromFile = from % 8;
      const toFile = to % 8;
      if (fromFile !== toFile) return true;
    }
    return false;
  }

  getValidDests(): Map<Key, Key[]> {
    return chessgroundDests(this.position);
  }

  ngOnDestroy(): void {
    this.cg?.destroy();
    this.cg = null;
  }

  private updateBoardToReviewState(reviewIndex: number): void {
    if (!this.cg) return;
    const setup = parseFen(this.fen).unwrap();
    const reviewPosition = Chess.fromSetup(setup).unwrap();
    let lastMoveUci: string | undefined;

    
    
    

    for (let i = 0; i <= reviewIndex; i++) {
      const moveUci = this.solution[i];
      const move = parseUci(moveUci);
      if (move) {
        reviewPosition.play(move);
        lastMoveUci = moveUci;
      }
    }

    const lastMoveKeys = lastMoveUci
      ? [lastMoveUci.substring(0, 2) as Key, lastMoveUci.substring(2, 4) as Key]
      : undefined;

    this.cg.set({
      fen: makeFen(reviewPosition.toSetup()),
      check: reviewPosition.isCheck(),
      lastMove: lastMoveKeys,
      movable: { color: undefined, dests: new Map() },
      viewOnly: true,
      turnColor: reviewPosition.turn,
    });
    this.cg.setShapes([]);
  }

  
  getFeedbackCoords(square: Key): { top: string, left: string } {
    if (!square) return { top: '0', left: '0' };

    const files = 'abcdefgh';
    const ranks = '12345678';
    
    let fileIdx = files.indexOf(square[0]);
    let rankIdx = ranks.indexOf(square[1]);

    const isWhite = this.orientation === 'white';

    const x = isWhite ? fileIdx : (7 - fileIdx);
    const y = isWhite ? (7 - rankIdx) : rankIdx;

    return {
      left: `${x * 12.5}%`,
      top: `${y * 12.5}%`
    };
  }

  goToStart(): void { this.reviewMoveIndex.set(-1); }
  goPrevious(): void { this.reviewMoveIndex.update(index => Math.max(-1, index - 1)); }
  goNext(): void { this.reviewMoveIndex.update(index => Math.min(this.solution.length - 1, index + 1)); }
  goToEnd(): void { this.reviewMoveIndex.set(this.solution.length - 1); }
}