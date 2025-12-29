import { Component, ElementRef, viewChild, AfterViewInit, OnDestroy, Output, EventEmitter, Input, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chessground } from '@lichess-org/chessground';
import { Api as ChessgroundApi } from '@lichess-org/chessground/api';
import { Config } from '@lichess-org/chessground/config';
import { Color, Role, Key } from '@lichess-org/chessground/types';

import { parseFen, INITIAL_FEN } from 'chessops/fen';
import { Chess } from 'chessops/chess';

export type Tool = { color: Color; role: Role } | 'trash' | 'pointer' | null;

@Component({
  selector: 'app-board-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './board-editor.component.html',
  styleUrls: ['./board-editor.component.scss']
})
export class BoardEditorComponent implements AfterViewInit, OnDestroy {
  private boardContainer = viewChild.required<ElementRef>('board');
  private cg: ChessgroundApi | null = null;

  @Input() initialFen: string = INITIAL_FEN;
  @Output() fenChange = new EventEmitter<string>();
  @Output() validityChange = new EventEmitter<boolean>(); 

  selectedTool = signal<Tool>('pointer');
  currentFen = signal<string>(INITIAL_FEN);
  isPositionValid = signal<boolean>(true); 
  
  turnColor = signal<Color>('white');
  castlingRights = signal<{ [key: string]: boolean }>({ K: true, Q: true, k: true, q: true });
  enPassantSquare = signal<string>('-');

  readonly roles: Role[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];
  readonly castlingOptions = [
    { key: 'K', label: 'White O-O', color: 'white' },
    { key: 'Q', label: 'White O-O-O', color: 'white' },
    { key: 'k', label: 'Black O-O', color: 'black' },
    { key: 'q', label: 'Black O-O-O', color: 'black' }
  ];

  constructor() {}

  ngAfterViewInit() {
    const config: Config = {
      fen: this.initialFen,
      movable: {
        free: true,
        color: 'both',
      },
      premovable: { enabled: false },
      drawable: { enabled: true },
      draggable: {
        showGhost: true,
        deleteOnDropOff: true
      },
      selectable: {
        enabled: false
      },
      events: {
        change: () => {
          this.updateFullFen();
        }
      }
    };

    this.cg = Chessground(this.boardContainer().nativeElement, config);
    this.parseMetadataFromFen(this.initialFen);
    this.currentFen.set(this.initialFen);
    this.setupBoardInteractions();
  }

  ngOnDestroy() {
    this.cg?.destroy();
  }

  selectTool(tool: Tool) {
    this.selectedTool.set(tool);
  }

  private setupBoardInteractions() {
    const el = this.boardContainer().nativeElement;
    
    el.addEventListener('mousedown', (e: MouseEvent) => {
      const tool = this.selectedTool();
      if (!this.cg || tool === 'pointer' || !tool) return;

      const key = this.getKeyAtDomPos(e);
      if (!key) return;

      e.preventDefault();
      e.stopPropagation();

      if (tool === 'trash') {
        this.cg.setPieces(new Map([[key, undefined]]));
      } else {
        this.cg.setPieces(new Map([[key, { role: tool.role, color: tool.color }]]));
      }
      
      this.updateFullFen();
    });
  }

  private getKeyAtDomPos(e: MouseEvent): Key | undefined {
    return (this.cg as any).getKeyAtDomPos?.([e.clientX, e.clientY]); 
  }

  onManualFenInput(fen: string) {
    this.currentFen.set(fen);
    
    try {
      const setup = parseFen(fen).unwrap();
      Chess.fromSetup(setup).unwrap(); 
      
      this.isPositionValid.set(true);
      this.validityChange.emit(true);

      if (this.cg) {
        
        this.parseMetadataFromFen(fen);

        this.cg.set({ fen: fen });
        this.fenChange.emit(fen);
      }

    } catch (e) {
      this.isPositionValid.set(false);
      this.validityChange.emit(false);
    }
  }

  parseMetadataFromFen(fen: string) {
    try {
      const parts = fen.split(' ');
      const setup = parseFen(fen).unwrap();

      this.turnColor.set(setup.turn);
      
      const castlingStr = parts[2] || '-';
      this.castlingRights.set({
        K: castlingStr.includes('K'),
        Q: castlingStr.includes('Q'),
        k: castlingStr.includes('k'),
        q: castlingStr.includes('q')
      });

      this.enPassantSquare.set(parts[3] || '-');
    } catch (e) {
      console.warn("Invalid FEN metadata", e);
    }
  }

  updateFullFen() {
    if (!this.cg) return;
    
    const boardFen = this.cg.getFen().split(' ')[0];
    const turn = this.turnColor()[0];
    
    const rights = this.castlingRights();
    let castling = '';
    if (rights['K']) castling += 'K';
    if (rights['Q']) castling += 'Q';
    if (rights['k']) castling += 'k';
    if (rights['q']) castling += 'q';
    if (castling === '') castling = '-';

    const ep = this.enPassantSquare() || '-';
    
    const fullFen = `${boardFen} ${turn} ${castling} ${ep} 0 1`;
    
    this.validatePosition(fullFen);

    this.currentFen.set(fullFen);
    this.fenChange.emit(fullFen);
  }

  validatePosition(fen: string) {
    try {
        const setup = parseFen(fen).unwrap();
        Chess.fromSetup(setup).unwrap();
        
        if (!this.isPositionValid()) {
            this.isPositionValid.set(true);
            this.validityChange.emit(true);
        }
    } catch (e) {
        if (this.isPositionValid()) {
            this.isPositionValid.set(false);
            this.validityChange.emit(false);
        }
    }
  }

  setTurn(color: Color) {
    this.turnColor.set(color);
    this.updateFullFen();
  }

  toggleCastling(key: string, event: any) {
    const current = this.castlingRights();
    this.castlingRights.set({ ...current, [key]: event.target.checked });
    this.updateFullFen();
  }

  clearBoard() {
    this.cg?.set({ fen: '8/8/8/8/8/8/8/8' });
    this.updateFullFen();
  }

  startPosition() {
    this.cg?.set({ fen: INITIAL_FEN });
    this.parseMetadataFromFen(INITIAL_FEN);
    this.updateFullFen();
  }
  
  flipBoard() {
    this.cg?.toggleOrientation();
  }
}