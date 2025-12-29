import { Routes } from '@angular/router';


import { DeckListComponent } from './features/deck-list/app-deck-list';
import { StudyComponent } from './features/deck-study/app-study';

import { AppBrowseCards } from './features/deck-browse/app-browse-cards';
import { DeckSettingsComponent } from './features/deck-settings/app-deck-settings';
import { CardFormComponent } from './features/card-form/card-form.component';

export const routes: Routes = [
  {
    path: '',
    component: DeckListComponent,
    title: 'Your Decks',
  },
  {
    path: 'browse/:deckId',
    component: AppBrowseCards,
    title: 'Browse Cards'
  },
  {
    path: 'study/:deckId',
    component: StudyComponent,
    title: 'Study Session',
  },
  {
    path: 'deck/:deckId/add-card',
    component: CardFormComponent,
    title: 'Add Card',
  },
  {
    path: 'deck/:deckId/edit-card/:cardId', 
    component: CardFormComponent,
    title: 'Edit Card',
  },
  {
    path: 'settings/:deckId',
    component: DeckSettingsComponent,
    title: 'Deck Settings'
  },
  {
    path: '**',
    redirectTo: '',
  },
];