import { Component, Input, ViewEncapsulation, viewChild, ElementRef, OnChanges, SimpleChanges, OnDestroy, NgZone, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chessground } from '@lichess-org/chessground';
import { Api } from '@lichess-org/chessground/api';
import { Config } from '@lichess-org/chessground/config';
import { Color, Key } from '@lichess-org/chessground/types';

@Component({
  selector: 'app-chess-thumbnail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chess-thumbnail.html',
  styleUrls: ['./chess-thumbnail.css'],
  encapsulation: ViewEncapsulation.None
})
export class ChessThumbnail implements AfterViewInit, OnChanges, OnDestroy {
  
  boardEl = viewChild.required<ElementRef<HTMLDivElement>>('board');

  @Input({ required: true }) fen!: string;
  @Input() orientation: Color = 'white';
  @Input() solution: string = ''; 

  private cg: Api | null = null; 
  private observer: IntersectionObserver | null = null;
  private animationTimeout: any;
  private isHovering = false;

  constructor(private ngZone: NgZone) {}

  ngAfterViewInit(): void {
    
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          
          if (!this.cg) this.initBoard();
        } else {
          
          if (this.cg) this.destroyBoard();
        }
      });
    }, {
      rootMargin: '50px' 
    });

    this.observer.observe(this.boardEl().nativeElement);
  }

  ngOnChanges(changes: SimpleChanges): void {
    
    if (this.cg) {
      if (changes['fen']) {
        this.stopAnimation();
        this.cg.set({ fen: this.fen });
      }
      if (changes['orientation']) {
        this.cg.set({ orientation: this.orientation });
      }
    }
  }

  private initBoard() {
    this.ngZone.runOutsideAngular(() => {
      const config: Config = {
        fen: this.fen,
        orientation: this.orientation,
        viewOnly: true, 
        coordinates: false, 
        movable: { color: undefined, dests: new Map() },
        highlight: { lastMove: true, check: true },
        drawable: { enabled: false, visible: false },
        animation: { enabled: true, duration: 250 } 
      };
      
      if (this.boardEl()) {
        this.cg = Chessground(this.boardEl().nativeElement, config);
      }
    });
  }

  private destroyBoard() {
    this.stopAnimation();
    if (this.cg) {
      this.cg.destroy();
      this.cg = null;
    }
  }

  onMouseEnter() {
    this.isHovering = true;
    
    if (!this.cg) this.initBoard();
    
    this.playSolution();
  }

  onMouseLeave() {
    this.isHovering = false;
    this.stopAnimation();
    
    
    if (this.cg) {
      this.cg.set({ fen: this.fen, lastMove: undefined });
    }
  }

  private playSolution() {
    if (!this.cg || !this.solution || !this.solution.trim()) return;
    
    const moves = this.solution.split(' ');
    let moveIndex = 0;

    const playNext = () => {
      
      if (!this.isHovering || !this.cg) return;

      if (moveIndex >= moves.length) {
        
        this.animationTimeout = setTimeout(() => {
            if (this.isHovering && this.cg) {
                this.cg.set({ fen: this.fen, lastMove: undefined }); 
                moveIndex = 0;
                this.animationTimeout = setTimeout(playNext, 600); 
            }
        }, 1500); 
        return;
      }

      const move = moves[moveIndex];
      if (move && move.length >= 4) {
          const from = move.substring(0, 2) as Key;
          const to = move.substring(2, 4) as Key;
          this.cg.move(from, to);
      }
      moveIndex++;
      this.animationTimeout = setTimeout(playNext, 800);
    };

    this.ngZone.runOutsideAngular(() => {
      this.animationTimeout = setTimeout(playNext, 300);
    });
  }

  private stopAnimation() {
    if (this.animationTimeout) { 
      clearTimeout(this.animationTimeout); 
      this.animationTimeout = null; 
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.destroyBoard();
  }
}