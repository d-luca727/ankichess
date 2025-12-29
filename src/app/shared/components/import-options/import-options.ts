import { Component, Input, Output, EventEmitter, signal, inject, NgZone, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TauriService } from '../../../core/services/tauri.service';
import { AppBootstrapData, ImportOptions, Opening, Theme } from '../../../core/models/db.models';
import { invoke } from '@tauri-apps/api/core';

@Component({
  selector: 'app-import-options',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './import-options.html',
  styleUrls: ['./import-options.css']
})
export class ImportOptionsComponent implements OnInit {
  private apiService = inject(TauriService);
  private ngZone = inject(NgZone);

  @Input({ required: true }) deckId!: number;
  @Input() deckName: string = 'Selected Deck';

  @Output() closeModal = new EventEmitter<void>();
  @Output() importStarted = new EventEmitter<string>();
  @Output() importTriggered = new EventEmitter<ImportOptions>();

  activeTab = signal<'db' | 'csv'>('db');
  isImporting = signal<boolean>(false);

  
  minRating = signal<string>('');
  maxRating = signal<string>('');
  minPopularity = signal<string>('');
  maxPopularity = signal<string>('');
  limit = signal<string>('1000');

  availableThemes = signal<Theme[]>([]);
  availableOpenings = signal<Opening[]>([]);

  
  selectedThemes = signal<Theme[]>([]);
  showThemePicker = signal(false);
  themeSearchText = signal('');

  filteredThemes = computed(() => {
    const term = this.themeSearchText().toLowerCase().trim();
    let list = this.availableThemes().sort((a, b) => a.label.localeCompare(b.label));
    if (term) return list.filter(t => t.label.toLowerCase().includes(term)).slice(0, 50);
    return list.slice(0, 50);
  });

  
  selectedOpenings = signal<Opening[]>([]);
  showOpeningPicker = signal(false);
  openingSearchText = signal('');

  filteredOpenings = computed(() => {
    const term = this.openingSearchText().toLowerCase().trim();
    let list = this.availableOpenings();
    if (term) {
      list = list.filter(o => 
        o.eco.toLowerCase().includes(term) || 
        o.name.toLowerCase().includes(term)
      );
    }
    return list.slice(0, 50); 
  });

  
  csvContent = signal<string | null>(null);
  selectedFileName = signal<string | null>(null);
  csvError = signal<string | null>(null); 

  async ngOnInit() {
    try {
      const data = await invoke<AppBootstrapData>('get_bootstrap_data');
      this.availableThemes.set(data.themes);
      
      let uniqueOpenings = data.openings.filter((val, i, arr) => 
        arr.findIndex(o => o.eco === val.eco && o.name === val.name) === i
      );

      uniqueOpenings = uniqueOpenings.map(op => ({
        ...op,
        name: this.formatNameForUi(op.name)
      }));

      this.availableOpenings.set(uniqueOpenings);
    } catch (error) {
      console.error('Failed to load bootstrap data:', error);
    }
  }

  
  private formatNameForUi(name: string): string {
    let label = name.replace(/_/g, ' '); 
    if (label.includes('Other variations') && !label.includes('(')) {
       label = label.replace('Other variations', '').trim() + ' (Other variations)';
    }
    return label;
  }

  private formatNameForBackend(name: string): string {
    let tag = name;
    tag = tag.replace(/'/g, ''); 
    if (tag.endsWith(' (Other variations)')) {
      tag = tag.replace(' (Other variations)', '_Other_variations');
    }
    tag = tag.replace(/ /g, '_');
    return tag;
  }

  setActiveTab(tab: 'db' | 'csv') { 
    this.activeTab.set(tab); 
    this.csvError.set(null); 
  }

  
  toggleThemePicker() {
    this.showThemePicker.update(v => !v);
    if (this.showThemePicker()) { this.showOpeningPicker.set(false); this.themeSearchText.set(''); }
  }

  toggleTheme(theme: Theme) {
    this.selectedThemes.update(current => {
      const exists = current.find(t => t.id === theme.id);
      return exists ? current.filter(t => t.id !== theme.id) : [...current, theme];
    });
  }

  isThemeSelected(theme: Theme): boolean {
    return this.selectedThemes().some(t => t.id === theme.id);
  }

  toggleOpeningPicker() {
    this.showOpeningPicker.update(v => !v);
    if (this.showOpeningPicker()) { this.showThemePicker.set(false); this.openingSearchText.set(''); }
  }

  toggleOpening(op: Opening) {
    this.selectedOpenings.update(current => {
      const exists = current.find(o => o.eco === op.eco && o.name === op.name);
      return exists ? current.filter(o => o.eco !== op.eco || o.name !== op.name) : [...current, op];
    });
  }

  isOpeningSelected(op: Opening): boolean {
    return this.selectedOpenings().some(o => o.eco === op.eco && o.name === op.name);
  }

  
  onFileSelected(event: any) {
    const file = event.target.files[0];
    
    
    this.csvError.set(null);
    this.selectedFileName.set(null);
    this.csvContent.set(null);

    if (file) {
      
      if (!file.name.toLowerCase().endsWith('.csv')) {
        this.csvError.set("Invalid file format. Please select a .csv file.");
        
        event.target.value = ''; 
        return;
      }

      this.selectedFileName.set(file.name);
      const reader = new FileReader();
      
      reader.onload = (e) => {
        this.ngZone.run(() => {
          this.csvContent.set(e.target?.result as string); 
        });
      };
      
      reader.onerror = () => {
        this.ngZone.run(() => {
           this.csvError.set("Error reading file.");
        });
      };

      reader.readAsText(file);
    }
  }

  async startCsvImport() {
    const content = this.csvContent();
    if (!content) return;
    this.isImporting.set(true);
    this.importStarted.emit(`Importing CSV...`);
    try {
      await this.apiService.importPuzzlesFromCsv(this.deckId, content);
      this.closeModal.emit();
    } catch(e) { 
      this.isImporting.set(false);
      this.csvError.set("Import failed. Check file format.");
      console.error(e); 
    }
  }

  startDbImport() {
    this.isImporting.set(true);
    this.importStarted.emit(`Importing from DB...`);
    
    const parseNum = (val: string) => { const n = parseInt(val, 10); return isNaN(n) ? undefined : n; };

    const options: ImportOptions = {
      deck_id: this.deckId,
      min_rating: parseNum(this.minRating()),
      max_rating: parseNum(this.maxRating()),
      min_popularity: parseNum(this.minPopularity()),
      max_popularity: parseNum(this.maxPopularity()),
      limit: parseNum(this.limit()),
      themes: this.selectedThemes().map(t => t.id),
      opening_tags: this.selectedOpenings().map(o => this.formatNameForBackend(o.name)),
    };

    this.importTriggered.emit(options);
    this.isImporting.set(false);
  }

  close() {
    if (!this.isImporting()) this.closeModal.emit();
  }
}