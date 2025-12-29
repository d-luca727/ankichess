import { Injectable, signal, computed, inject, OnDestroy } from '@angular/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { TauriService } from './tauri.service';
import type { DbStatus, DownloadProgress, IndexingProgress } from '../models/db.models';

@Injectable({
  providedIn: 'root',
})
export class DbStateService implements OnDestroy {
  private apiService = inject(TauriService);

  
  dbStatus = signal<DbStatus | null>(null);
  isDownloadingDb = signal(false);
  isIndexingDb = signal(false);
  downloadProgress = signal<DownloadProgress | null>(null);
  indexingProgress = signal<string>('');
  dbError = signal<string | null>(null);

  
  isUpdateAvailable = signal<boolean>(false);
  isCheckingUpdate = signal<boolean>(false);

  
  isInstalled = computed(() => (this.dbStatus()?.puzzleCount ?? 0) > 0);
  isUpdating = computed(() => this.isDownloadingDb() || this.isIndexingDb());

  private unlistenFns: UnlistenFn[] = [];

  constructor() {
    this.loadDbStatus();
    this.registerEventListeners();
  }

  async loadDbStatus() {
    try {
      const status = await this.apiService.getPuzzleDbStatus();
      this.dbStatus.set(status);
      
      
      if (status.dbExists) {
        await this.checkRemoteUpdate();
      } else {
        
        this.isUpdateAvailable.set(true);
      }
    } catch (e: any) {
      this.dbError.set(e?.message || 'Error loading DB status');
    }
  }

  async checkRemoteUpdate() {
    if (this.isCheckingUpdate()) return;
    
    this.isCheckingUpdate.set(true);
    try {
      const hasUpdate = await this.apiService.checkForUpdate();
      this.isUpdateAvailable.set(hasUpdate);
    } catch (e) {
      console.warn('Update check failed (likely offline):', e);
      
    } finally {
      this.isCheckingUpdate.set(false);
    }
  }

  async startDatabaseDownloadAndIndex() {
    this.isDownloadingDb.set(true);
    this.dbError.set(null);
    try {
      await this.apiService.startDatabaseDownloadAndIndex();
    } catch (e: any) {
      this.isDownloadingDb.set(false);
      this.dbError.set(e?.message || 'Error starting download');
    }
  }

  private async registerEventListeners() {
    this.unlistenFns = [
      await listen('DOWNLOAD_PROGRESS', (e) => {
        this.isDownloadingDb.set(true);
        this.downloadProgress.set(e.payload as DownloadProgress);
      }),
      await listen('INDEXING_PROGRESS', (e) => {
        this.isDownloadingDb.set(false);
        this.isIndexingDb.set(true);
        const p = e.payload as IndexingProgress;
        this.indexingProgress.set(
          p.status === 'starting' ? 'Preparing...' : `Indexing: ${p.processedCount.toLocaleString()}`
        );
      }),
      await listen('DATABASE_READY', (e) => {
        this.isDownloadingDb.set(false);
        this.isIndexingDb.set(false);
        this.dbStatus.set(e.payload as DbStatus);
        
        this.isUpdateAvailable.set(false);
      }),
      await listen('DATABASE_ERROR', (e) => {
        this.isDownloadingDb.set(false);
        this.isIndexingDb.set(false);
        this.dbError.set(e.payload as string);
      })
    ];
  }

  isDbBusy(): boolean { 
    return this.isUpdating() || this.isCheckingUpdate(); 
  }

  ngOnDestroy() { 
    this.unlistenFns.forEach(fn => fn()); 
  }
}