import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'chessFont',
  standalone: true
})
export class ChessFontPipe implements PipeTransform {

  private readonly PIECE_MAP: Record<string, string> = {
    '¦': '♜',  
    '¢': '♚',  
    '£': '♛',  
    '¥': '♝',  
    '¤': '♞',  
    'à': '♝',  
    '†': '+',  
    '': '✓' , 
  };

  transform(value: string | null | undefined): string {
    if (!value) return '';
    
    return value.split('').map(char => this.PIECE_MAP[char] || char).join('');
  }
}

@Pipe({ name: 'truncate' })
export class TruncatePipe implements PipeTransform {
  transform(value: string, limit: number = 20): string {
    return value.length > limit ? value.substring(0, limit) + '...' : value;
  }
}