POSITION LAB — SOURCE FILES

Files:
- index.html: page structure
- styles.css: layout and visual styling
- app.js: board rules, moves, FEN handling and UI
- recognition-engine.js: screenshot recognition and Stockfish integration

To run locally, keep all four files in the same folder and open index.html in a modern browser. The recognition model and Stockfish assets are loaded from public CDNs, so those features require an internet connection. Depending on browser security restrictions, some module features may work more reliably when served through a local development server instead of opening index.html directly.

This is a prototype. Screenshot recognition cannot infer whose turn it is, move history, castling rights or en-passant rights from a single image; review those settings when necessary.
