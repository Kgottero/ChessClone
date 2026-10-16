POSITION LAB — SOURCE CODE

Files
- index.html: complete page markup
- styles.css: complete styling, board themes, and responsive mobile sizing
- app.js: chessboard, move handling, FEN, setup mode, and computer-play logic
- recognition-engine.js: screenshot recognition and Stockfish integration

Run locally
1. Keep all files in the same folder.
2. Open the folder in VS Code.
3. Recommended: use the Live Server extension and open index.html with Live Server.

Notes
- Screenshot recognition and Stockfish require an internet connection to load their browser assets.
- The mobile CSS uses the board's own width to scale the piece glyphs. Test on your target phone after publishing.
- This is a browser-based prototype. Review and test chess rules and engine behaviour before relying on it for competitive analysis.

Custom move sounds:
1. Create a folder named sounds beside index.html and app.js.
2. Put your four audio files inside it with these exact filenames:
   - Move Sound.mp3
   - Capture Sound.mp3
   - Check Sound.mp3
   - Checkmate Sound.mp3
3. Keep the spaces and spelling exactly as shown. If your files are WAV/OGG or use another extension, change the matching paths near the top of app.js.
4. Run the app with VS Code Live Server, then make a move to test each sound. If a sound does not play, check the filename/extension and browser volume.

Custom SVG chess pieces:
1. Create a folder named pieces beside index.html and app.js.
2. Put all 12 SVG files inside it using these exact filenames:
   - pawn-b.svg, knight-b.svg, bishop-b.svg, rook-b.svg, queen-b.svg, king-b.svg
   - pawn-w.svg, knight-w.svg, bishop-w.svg, rook-w.svg, queen-w.svg, king-w.svg
3. The app loads the SVGs automatically. The -b suffix is black and -w is white.
4. If an SVG is missing or has a filename mismatch, the app falls back to its built-in chess symbol.
