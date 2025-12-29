import { Component, inject, signal } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { CommonModule } from "@angular/common";
import { DbStateService } from "./core/services/db-state.service";
import { TauriService } from "./core/services/tauri.service";
import { DatabaseFabComponent } from "./core/views/database-fab/database-fab.component";

@Component({
  selector: "app-root",
  standalone: true, 
  imports: [
    CommonModule, 
    RouterOutlet,
    DatabaseFabComponent
  ],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",
})
export class AppComponent {
  
  public dbStateService = inject(DbStateService);
  private tauriService = inject(TauriService);
  isCleaning = signal(false);

  
  formatBytes(bytes: number | undefined, decimals = 2): string {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  formatDate(timestamp: number | null | undefined): string {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString(); 
  }

  getDownloadPercentage(): number {
    const progress = this.dbStateService.downloadProgress();
    if (!progress || progress.total === 0) return 0;
    return (progress.downloaded / progress.total) * 100;
  }

  async cleanDatabase() {

    this.isCleaning.set(true);
    try {
      const count = await this.tauriService.cleanupUnusedPuzzles();
      alert(`Cleanup complete! Removed ${count} unused puzzles.`);
      
      this.dbStateService.loadDbStatus();
    } catch (e) {
      console.error(e);
      alert(`Error cleaning database: ${e}`);
    } finally {
      this.isCleaning.set(false);
    }
  }
}