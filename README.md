
# Ankichess

**Ankichess** is a tool designed to help chess players practice openings and tactical patterns using **Spaced Repetition (SRS)**. 

Unlike traditional puzzle trainers, Ankichess leverages the official **Anki** core to manage your learning schedule, ensuring you review positions at the optimal time for long-term retention.

## How to Use It

1.  **Create a Deck:** Start by creating a new deck to organize your study topics.
2.  **Add Content:** 
    * **Manual Entry:** Use the "Add Card" feature to set up a specific FEN position and record the correct sequence of moves as the solution.
    * **Bulk Import:** Expand your collection by downloading the official Lichess puzzles database. Use the built-in Import tool to filter millions of puzzles by rating, theme, or opening, or simply upload your own custom CSV files.
3.  **Study:** Open a deck to start a study session. Make the moves on the board; if correct, rate the difficulty (1-4) to determine when the SRS algorithm will show you the position again.
4.  **Analyze:** If you miss a move or want to explore variations, toggle the analysis mode to review the position.

## Contributing

### Development

1. **Clone the repository:**
   
```bash
   git clone [https://github.com/your-username/ankichess.git](https://github.com/your-username/ankichess.git)
   cd ankichess

```

2. **Install dependencies:**
```bash
npm install

```


3. **Run in development mode:**
```bash
npm run tauri dev

```


### Testing
If you find any bugs please don't hesitate to open an issue. 


## License

Distributed under the AGPL-3.0 License. See `LICENSE` for more information.