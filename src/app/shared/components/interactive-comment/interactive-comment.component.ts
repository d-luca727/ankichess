import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { parseUci, makeUci } from 'chessops/util';
import { Color } from 'chessops/types';

interface TextToken {
  type: 'text' | 'move';
  content: string;
  uci?: string;
  fullSequence?: string[];
  isValid: boolean;
}

@Component({
  selector: 'app-interactive-comment',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="comment-container">
      @for (token of tokens(); track $index) {
        @if (token.type === 'move' && token.isValid) {
          <span 
            class="move-chip" 
            (click)="onMoveClick(token)" 
            title="Play variation">
            {{ token.content }}
          </span>
        } @else {
          <span class="text-content">{{ token.content }}</span>
        }
      }
    </div>
  `,
  styles: [`
    .comment-container { 
      font-size: 0.95rem; 
      line-height: 1.6; 
      color: #333; 
      word-wrap: break-word; 
      white-space: pre-wrap; 
    }
    .move-chip {
      background-color: #e3f2fd; 
      color: #1565c0; 
      padding: 1px 4px; 
      border-radius: 4px;
      cursor: pointer; 
      font-weight: 600; 
      border: 1px solid #bbdefb;
      display: inline-block; 
      transition: all 0.2s;
    }
    .move-chip:hover { 
      background-color: #1565c0; 
      color: white; 
      border-color: #1565c0; 
    }
  `]
})
export class InteractiveCommentComponent implements OnChanges {
  @Input({ required: true }) text: string = '';
  @Input({ required: true }) rootFen: string = '';
  @Input() solution: string[] = [];
  
  @Output() variationSelected = new EventEmitter<string[]>();

  tokens = signal<TextToken[]>([]);

  ngOnChanges(changes: SimpleChanges) {
    if (changes['text'] || changes['rootFen'] || changes['solution']) {
      this.parseText();
    }
  }

  private parseText() {
    if (!this.text) {
      this.tokens.set([]);
      return;
    }

    const tokens: TextToken[] = [];
    let currentPos: Chess;
    let currentSequence: string[] = [];

    try {
      const setup = parseFen(this.rootFen).unwrap();
      currentPos = Chess.fromSetup(setup).unwrap();
    } catch (e) {
      this.tokens.set([{ type: 'text', content: this.text, isValid: true }]);
      return;
    }

    
    const moveNumberRegex = /^(\d+)(\.+)(.*)$/;

    const rawWords = this.text.split(/(\s+)/);

    for (const word of rawWords) {
      
      if (!word.trim()) {
        tokens.push({ type: 'text', content: word, isValid: true });
        continue;
      }

      
      const numberMatch = word.match(moveNumberRegex);
      
      if (!numberMatch) {
        
        tokens.push({ type: 'text', content: word, isValid: true });
        continue;
      }

      
      const moveNum = parseInt(numberMatch[1], 10);
      const dots = numberMatch[2]; 
      const rawSan = numberMatch[3];
      const cleanSan = rawSan.replace(/[?!.,;)]+$/, '').replace(/^\(/, '');
      
      
      const targetColor: Color = dots.length > 1 ? 'black' : 'white';

      let move = null;
      let foundInContext = false;
      let targetResult: { position: Chess, sequence: string[], move: any } | null = null;

      
      
      if (currentPos.fullmoves === moveNum && currentPos.turn === targetColor) {
         move = parseSan(currentPos, cleanSan);
      }

      
      if (!move && this.solution.length > 0) {
        targetResult = this.findMoveAtSpecificTurn(moveNum, targetColor, cleanSan);
        if (targetResult) {
          foundInContext = true;
        }
      }

      
      if (foundInContext && targetResult) {
        
        currentPos = targetResult.position;
        currentSequence = targetResult.sequence;
        move = targetResult.move;
      }

      if (move) {
        const uci = makeUci(move);
        
        currentPos.play(move);
        currentSequence.push(uci);
        
        tokens.push({
          type: 'move',
          content: word,
          uci: uci,
          fullSequence: [...currentSequence],
          isValid: true
        });
      } else {
        
        tokens.push({ type: 'text', content: word, isValid: true });
      }
    }

    this.tokens.set(tokens);
  }

  
  private findMoveAtSpecificTurn(targetFullmove: number, targetTurn: Color, san: string): { position: Chess, sequence: string[], move: any } | null {
    try {
      const setup = parseFen(this.rootFen).unwrap();
      const tempPos = Chess.fromSetup(setup).unwrap();
      const tempSequence: string[] = [];

      
      if (tempPos.fullmoves === targetFullmove && tempPos.turn === targetTurn) {
         const move = parseSan(tempPos, san);
         if (move) return { position: tempPos.clone(), sequence: [], move };
      }

      for (const solutionUci of this.solution) {
        
        if (tempPos.fullmoves === targetFullmove && tempPos.turn === targetTurn) {
           const move = parseSan(tempPos, san);
           if (move) {
             return {
               position: tempPos.clone(),
               sequence: [...tempSequence],
               move
             };
           }
           return null; 
        }

        const solMove = parseUci(solutionUci);
        if (!solMove) break;
        tempPos.play(solMove);
        tempSequence.push(solutionUci);
      }
      
      
      if (tempPos.fullmoves === targetFullmove && tempPos.turn === targetTurn) {
        const move = parseSan(tempPos, san);
        if (move) return { position: tempPos.clone(), sequence: [...tempSequence], move };
      }

    } catch (e) { console.error(e); }
    return null;
  }

  onMoveClick(token: TextToken) {
    if (token.fullSequence) {
      this.variationSelected.emit(token.fullSequence);
    }
  }
}