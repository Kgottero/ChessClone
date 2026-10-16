const $ = id => document.getElementById(id);

let scanFile = null;
let recognizer = null;
let stockfishWorker = null;
let stockfishReady = false;
let pendingBestMove = false;

// ==========================================
// STATUS HELPERS
// ==========================================

function imageStatus(message) {
    const el = $('imageMessage');
    if (el) el.textContent = message;
}

function engineStatus(message) {
    const el = $('engineStatus');
    if (el) el.textContent = message;
}

function setCapability(message) {
    const el = $('capabilityStatus');
    if (el) el.textContent = message;
}

// ==========================================
// CHESSBOARD IMAGE RECOGNITION
// ==========================================

$('imageInput')?.addEventListener('change', e => {
    scanFile = e.target.files?.[0] || null;

    if ($('recognizeImage')) {
        $('recognizeImage').disabled = !scanFile;
    }
});

$('recognizeImage')?.addEventListener('click', async () => {
    if (!scanFile) return;

    const btn = $('recognizeImage');

    btn.disabled = true;
    btn.textContent = 'Loading recognizer…';

    imageStatus(
        'Loading the chessboard recognition model. First use may take a little while…'
    );

    try {
        if (!recognizer) {
            const mod = await import(
                'https://esm.sh/@scoriiu/fenshot'
            );

            recognizer = mod.createRecognizer({
                modelUrl:
                    'https://cdn.jsdelivr.net/npm/@scoriiu/fenshot/model/chess-tiles-v2.onnx',
                wasmPaths:
                    'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/'
            });
        }

        imageStatus('Scanning the screenshot locally…');

        const result = await recognizer.recognize(scanFile);

        if (!result) {
            imageStatus(
                'No chessboard detected. Try an image showing the entire board.'
            );
            return;
        }

        const mod = await import(
            'https://esm.sh/@scoriiu/fenshot'
        );

        const {
            placement,
            orientation
        } = mod.resolveOrientation(result.placement);

        const base = mod.placementToFen(
            placement,
            $('imageTurn').value
        );

        const parts = base.split(/\s+/);
        parts[1] = $('imageTurn').value;

        $('imageFen').value = parts.join(' ');

        if (!result.reliable) {
            imageStatus(
                `Board detected, but confidence is low. ` +
                `Average confidence: ${Math.round(result.meanConfidence * 100)}%. ` +
                `Weakest square: ${Math.round(result.minConfidence * 100)}%. ` +
                `Please review the position. Orientation: ${orientation || 'detected'}.`
            );
        } else {
            imageStatus(
                `Board recognized with ${Math.round(result.meanConfidence * 100)}% average confidence. ` +
                `Please verify whose turn it is and review the position.`
            );
        }

        $('loadImageFen').click();

    } catch (err) {
        imageStatus(
            'Recognition could not start. Internet access is required to download ' +
            'the recognition model. Try running the website through a web server. ' +
            'Details: ' + (err?.message || err)
        );

    } finally {
        btn.disabled = !scanFile;
        btn.textContent = 'Recognize board';
    }
});

// ==========================================
// STOCKFISH 19 LITE — LOCAL ENGINE
// ==========================================
//
// Required files in your project root:
//
// stockfish-19-lite-single.js
// stockfish-19-lite-single.wasm
//
// Both files must be served from the same directory
// as index.html.
//
// ==========================================

function initStockfish() {
    if (stockfishWorker) return;

    try {
        const engineUrl = new URL(
            './stockfish-19-lite-single.js',
            import.meta.url
        );

        stockfishWorker = new Worker(engineUrl);

        stockfishWorker.onmessage = event => {
            const line =
                typeof event.data === 'string'
                    ? event.data
                    : String(event.data || '');

            // Stockfish has started.
            if (line.includes('uciok')) {
                stockfishWorker.postMessage('isready');
                return;
            }

            // Stockfish is ready to analyse positions.
            if (line.includes('readyok')) {
                stockfishReady = true;

                engineStatus('Stockfish 19 is ready.');

                setCapability(
                    'Local Stockfish 19 Lite engine connected successfully.'
                );

                return;
            }

            // Stockfish has selected its move.
            if (line.startsWith('bestmove')) {
                pendingBestMove = false;

                const uci = line.trim().split(/\s+/)[1];

                if (
                    uci &&
                    uci !== '(none)' &&
                    window.positionLabApplyUci
                ) {
                    window.positionLabApplyUci(uci);
                }
            }
        };

        stockfishWorker.onerror = event => {
            stockfishReady = false;
            pendingBestMove = false;

            engineStatus(
                'Stockfish failed to load. Check the engine JS and WASM files.'
            );

            setCapability(
                'Stockfish could not load. The built-in fallback may be used.'
            );

            console.error(
                'Stockfish worker error:',
                event.message || event
            );

            try {
                stockfishWorker.terminate();
            } catch (_) {}

            stockfishWorker = null;
        };

        engineStatus('Loading local Stockfish engine…');

        setCapability(
            'Starting Stockfish 19 Lite…'
        );

        stockfishWorker.postMessage('uci');

    } catch (err) {
        stockfishReady = false;
        stockfishWorker = null;

        engineStatus(
            'Stockfish is unavailable. Using the built-in fallback engine.'
        );

        setCapability(
            'Stockfish could not start: ' + err.message
        );

        console.error(
            'Could not start Stockfish:',
            err
        );
    }
}

// ==========================================
// POSITION LAB ENGINE CONNECTION
// ==========================================

window.positionLabRequestStockfish = function (fen) {
    initStockfish();

    if (!stockfishReady || !stockfishWorker) {
        return false;
    }

    pendingBestMove = true;

    stockfishWorker.postMessage(
        'position fen ' + fen
    );

    stockfishWorker.postMessage(
        'go depth 12'
    );

    return true;
};

window.positionLabStockfishReady = function () {
    return stockfishReady;
};

window.positionLabPendingBestMove = function () {
    return pendingBestMove;
};

// ==========================================
// STARTUP
// ==========================================

setCapability(
    'Screenshot recognition and Stockfish are configured. ' +
    'Internet access is required for the screenshot recognition model.'
);

initStockfish();