import { Component, OnInit, inject, signal, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TauriService } from '../../core/services/tauri.service';
import { DeckLimitsPayload, DeckInfo } from '../../core/models/deck.models';
import { DbStateService } from '../../core/services/db-state.service';

@Component({
  selector: 'app-deck-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app-deck-settings.html',
  styleUrl: './app-deck-settings.css' 
})
export class DeckSettingsComponent implements OnInit {
  private apiService = inject(TauriService);

  deckId = input.required<number>();
  deckName = input.required<string>();

  closeModal = output<void>();
  settingsSaved = output<void>();

  isLoading = signal<boolean>(true);
  errorMessage = signal<string>('');
  successMessage = signal<string>('');

  newCardsPerDay = signal<number>(20);
  reviewsPerDay = signal<number>(200);


  ngOnInit() {
    this.loadSettings();
  }

  async loadSettings() {
    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      const limits = await this.apiService.getDeckLimits(this.deckId());
      this.newCardsPerDay.set(limits.newCardsPerDay);
      this.reviewsPerDay.set(limits.reviewsPerDay);
    } catch (error) {
      console.error('Error loading deck settings:', error);
      this.errorMessage.set(`Error loading deck settings: ${error}`);
    } finally {
      this.isLoading.set(false);
    }
  }

  async saveSettings() {
    this.errorMessage.set('');
    this.successMessage.set('');
    
    const currentLimits: DeckLimitsPayload = {
      newCardsPerDay: this.newCardsPerDay(),
      reviewsPerDay: this.reviewsPerDay()
    };

    if (currentLimits.newCardsPerDay < 1 || currentLimits.reviewsPerDay < 1) {
        this.errorMessage.set("Limits can't be less than one.");
        return;
    }

    try {
      await this.apiService.setDeckLimits(this.deckId(), currentLimits);
      this.successMessage.set('Settings saved!');
      setTimeout(() => this.settingsSaved.emit(), 500); 
    } catch (error) {
      console.error('Error saving deck settings:', error);
      this.errorMessage.set(`Error saving deck settings: ${error}`);
    }
  }
}