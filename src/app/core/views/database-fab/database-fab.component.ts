import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DbStateService } from '../../services/db-state.service';
import { TauriService } from '../../services/tauri.service';

@Component({
  selector: 'app-database-fab',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './database-fab.component.html',
  styleUrls: ['./database-fab.component.css']
})
export class DatabaseFabComponent implements OnInit {
  public dbService = inject(DbStateService);
  private tauriService = inject(TauriService);
  
  isExpanded = signal(false);
  showBubble = signal(false);
  isCleaning = signal(false);
  
  
  cleanupStatus = signal<{ message: string; isError: boolean } | null>(null);

  ngOnInit() {
    const hasSeenIntro = localStorage.getItem('db_intro_seen');
    if (!hasSeenIntro && !this.dbService.isInstalled()) {
      this.showBubble.set(true);
      localStorage.setItem('db_intro_seen', 'true');
      setTimeout(() => this.showBubble.set(false), 5000);
    }
  }

  
  formatBytes(bytes: number | undefined, decimals = 2): string {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  toggleMenu() {
    this.isExpanded.update(v => !v);
    if (this.showBubble()) this.showBubble.set(false);
  }

  async cleanDb() {
    this.isCleaning.set(true);
    this.cleanupStatus.set(null); 
    
    try {
      const count = await this.tauriService.cleanupUnusedPuzzles();
      
      this.cleanupStatus.set({ 
        message: `Cleanup complete! Removed ${count} puzzles.`, 
        isError: false 
      });
      this.dbService.loadDbStatus();
    } catch (e) {
      this.cleanupStatus.set({ 
        message: `Error: ${e}`, 
        isError: true 
      });
    } finally {
      this.isCleaning.set(false);
      
      setTimeout(() => this.cleanupStatus.set(null), 5000);
    }
  }
}