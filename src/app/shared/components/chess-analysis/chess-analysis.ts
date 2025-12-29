import {
  Component,
  Input,
  ElementRef,
  viewChild,
  AfterViewInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  signal,
  computed,
  effect,
  HostListener,
  inject 
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { parseUci, parseSquare } from 'chessops/util';
import { makeSan } from 'chessops/san';
import { chessgroundDests } from 'chessops/compat';
import { Chessground } from '@lichess-org/chessground';
import type { Api as ChessgroundApi } from '@lichess-org/chessground/api';
import type { Config } from '@lichess-org/chessground/config';
import type { Color, Key, Role } from '@lichess-org/chessground/types';


import { AudioService } from '../../../core/services/audio.service';

export interface AnalysisNode {
  id: string;
  ply: number;
  fen: string;
  uci: string | null;
  san: string | null;
  children: AnalysisNode[];
  parent: AnalysisNode | null;
}

@Component({
  selector: 'app-chess-analysis',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chess-analysis.html',
  styleUrls: ['./chess-analysis.css']
})
export class ChessAnalysisComponent implements AfterViewInit, OnChanges, OnDestroy {
  protected Math = Math;
  private boardContainer = viewChild.required<ElementRef<HTMLDivElement>>('board');

  @Input() initialFen: string = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  @Input() orientation: Color = 'white';
  @Input() moveList: string[] = [];

  private cg: ChessgroundApi | null = null;
  
  
  private audioService = inject(AudioService);

  
  boardWidth = signal<number>(480);
  private isResizing = false;
  private startX = 0;
  private startWidth = 0;

  
  public promotionData = signal<{ from: Key; to: Key; color: Color } | null>(null);
  public readonly promotionChoices: Role[] = ['queen', 'rook', 'bishop', 'knight'];

  rootNode: AnalysisNode = {
    id: 'root',
    ply: 0,
    fen: '',
    uci: null,
    san: null,
    children: [],
    parent: null
  };

  currentNode = signal<AnalysisNode>(this.rootNode);
  
  currentPosition = computed(() => {
    try {
      const setup = parseFen(this.currentNode().fen).unwrap();
      return Chess.fromSetup(setup).unwrap();
    } catch (e) {
      return Chess.default();
    }
  });

  constructor() {
    
    this.audioService.preloadSound('move', 'assets/sounds/move.wav');
    this.audioService.preloadSound('capture', 'assets/sounds/capture.wav');

    effect(() => {
      const node = this.currentNode();
      
      
      
      
      if (node.uci) {
        
        const isCapture = node.san?.includes('x');
        this.audioService.playSound(isCapture ? 'capture' : 'move');
      }

      if (this.cg) {
        this.updateBoard(node);
      }
      
      
      if (this.promotionData()) {
        this.promotionData.set(null);
      }
    });

    effect(() => {
      this.boardWidth();
      if (this.cg) {
        this.cg.redrawAll();
      }
    });
  }

  ngAfterViewInit() {
    this.initAnalysis();
  }

  ngOnChanges(changes: SimpleChanges) {
    if ((changes['initialFen'] && !changes['initialFen'].isFirstChange()) ||
        (changes['moveList'] && !changes['moveList'].isFirstChange())) {
      this.initAnalysis();
    }
    if (changes['orientation'] && !changes['orientation'].isFirstChange() && this.cg) {
      this.cg.set({ orientation: this.orientation });
    }
  }

  ngOnDestroy() {
    this.cg?.destroy();
  }

  

  onResizeStart(event: MouseEvent) {
    event.preventDefault();
    this.isResizing = true;
    this.startX = event.clientX;
    this.startWidth = this.boardWidth();
    document.body.style.cursor = 'ew-resize';
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

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }
    switch (event.key) {
      case 'ArrowLeft':
        this.prev();
        event.preventDefault();
        break;
      case 'ArrowRight':
        this.next();
        event.preventDefault();
        break;
      case 'ArrowUp':
        this.reset();
        event.preventDefault();
        break;
      case 'ArrowDown':
        this.jumpToEnd();
        event.preventDefault();
        break;
    }
  }

  public jumpToEnd() {
    let node = this.currentNode();
    while (node.children.length > 0) {
      node = node.children[0];
    }
    this.currentNode.set(node);
  }

  

  private initAnalysis() {
    const setup = parseFen(this.initialFen).unwrap();
    this.rootNode = {
      id: 'root',
      ply: (setup.fullmoves - 1) * 2 + (setup.turn === 'white' ? 0 : 1),
      fen: this.initialFen,
      uci: null,
      san: null,
      children: [],
      parent: null
    };

    let head = this.rootNode;
    let tempPos = Chess.fromSetup(setup).unwrap();

    for (const uci of this.moveList) {
      const move = parseUci(uci);
      if (!move) continue;
      
      const san = makeSan(tempPos, move);
      tempPos.play(move);
      const newFen = makeFen(tempPos.toSetup());
      
      const newNode: AnalysisNode = {
        id: `${head.id}-${uci}`,
        ply: head.ply + 1,
        fen: newFen,
        uci: uci,
        san: san,
        children: [],
        parent: head
      };
      head.children.push(newNode);
      head = newNode;
    }

    this.currentNode.set(this.rootNode);

    if (!this.cg && this.boardContainer()) {
      const config: Config = {
        fen: this.initialFen,
        orientation: this.orientation,
        viewOnly: false,
        draggable: { enabled: true },
        selectable: { enabled: true },
        movable: {
          free: false,
          color: this.getTurnColor(),
          dests: this.getDests(),
          events: {
            after: (orig, dest) => this.onMove(orig, dest)
          }
        },
        highlight: { lastMove: true, check: true },
        animation: { enabled: true, duration: 200 }
      };
      this.cg = Chessground(this.boardContainer().nativeElement, config);
    } else if (this.cg) {
      this.updateBoard(this.rootNode);
    }
  }

  private onMove(orig: Key, dest: Key) {
    const position = this.currentPosition();
    const piece = position.board.get(parseSquare(orig)!);
    const isPawn = piece?.role === 'pawn';
    const isPromotionRank = (dest[1] === '8' && position.turn === 'white') || (dest[1] === '1' && position.turn === 'black');
    
    if (isPawn && isPromotionRank) {
      this.promotionData.set({ 
        from: orig, 
        to: dest, 
        color: position.turn 
      });
      this.cg?.set({ movable: { color: undefined, dests: new Map() } });
      return; 
    }

    this.processMove(`${orig}${dest}`);
  }
  
  public onPromotionSelect(role: Role): void {
    const data = this.promotionData();
    if (!data) return;

    this.promotionData.set(null);

    
    let promotionChar: string;
    if (role === 'knight') {
      promotionChar = 'n';
    } else {
      promotionChar = role.charAt(0);
    }

    const uci = `${data.from}${data.to}${promotionChar}`;
    this.processMove(uci);
  }

  private processMove(uci: string): void {
    const move = parseUci(uci);
    if (!move) return;

    const node = this.currentNode();
    const position = this.currentPosition();

    const san = makeSan(position, move);
    if (!san) return;

    const newPos = position.clone();
    newPos.play(move);
    const newFen = makeFen(newPos.toSetup());

    let nextNode = node.children.find(child => child.uci === uci);

    if (!nextNode) {
      nextNode = {
        id: `${node.id}-${uci}`,
        ply: node.ply + 1,
        fen: newFen,
        uci: uci,
        san: san,
        children: [],
        parent: node
      };
      node.children.push(nextNode);
    }

    this.currentNode.set(nextNode);
  }

  public playVariation(uciMoves: string[]) {
    this.reset();
    
    for (const uci of uciMoves) {
      this.processMove(uci);
    }
  }

  private updateBoard(node: AnalysisNode) {
    if (!this.cg) return;
    const parsed = parseFen(node.fen).unwrap();
    const position = Chess.fromSetup(parsed).unwrap();
    
    this.cg.set({
      fen: node.fen,
      turnColor: parsed.turn,
      check: position.isCheck(),
      lastMove: node.uci ? [node.uci.slice(0, 2) as Key, node.uci.slice(2, 4) as Key] : undefined,
      movable: {
        color: parsed.turn,
        dests: chessgroundDests(position)
      }
    });
  }

  public jumpTo(node: AnalysisNode) { this.currentNode.set(node); }
  
  public next() {
    const current = this.currentNode();
    if (current.children.length > 0) this.jumpTo(current.children[0]);
  }

  public prev() {
    const current = this.currentNode();
    if (current.parent) this.jumpTo(current.parent);
  }

  public reset() { this.jumpTo(this.rootNode); }
  
  public flipBoard() { this.cg?.toggleOrientation(); }

  private getTurnColor(): Color { return this.currentPosition().turn; }
  private getDests() { return chessgroundDests(this.currentPosition()); }
}