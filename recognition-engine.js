const $ = id => document.getElementById(id);

let scanFile = null, recognizer = null;
let stockfishWorker = null, stockfishReady = false;
let activeSearch = false, activeMode = 'analysis', activeFen = '';
let queuedRequest = null, stopRequested = false, lastAnalysisFen = '';

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

function setEvalStatus(message) {
    const el = $('evalStatus');
    if (el) el.textContent = message;
}

/* =========================================
   EVALUATION BAR AND BEST-MOVE TOGGLES
========================================= */

function setupAnalysisDisplayToggles() {
    const boardHead = document.querySelector('.board-head');
    const boardWithEval = document.querySelector('.board-with-eval');
    const analysisSummary = document.querySelector('.analysis-summary');

    if (!boardHead || !boardWithEval || !analysisSummary) {
        console.warn('Position Lab: Could not find analysis display elements.');
        return;
    }

    // Create the toggle controls.
    if (!$('analysisDisplayToggles')) {
        const controls = document.createElement('div');

        controls.id = 'analysisDisplayToggles';
        controls.className = 'analysis-display-toggles';

        controls.innerHTML = `
            <label class="display-toggle" for="toggleEvalBar">
                <input type="checkbox" id="toggleEvalBar" checked>
                <span>Evaluation bar</span>
            </label>

            <label class="display-toggle" for="toggleBestMove">
                <input type="checkbox" id="toggleBestMove" checked>
                <span>Best move</span>
            </label>
        `;

        boardHead.insertAdjacentElement('afterend', controls);
    }

    // Add the styles for the controls.
    if (!$('positionLabToggleStyles')) {
        const style = document.createElement('style');

        style.id = 'positionLabToggleStyles';

        style.textContent = `
            .analysis-display-toggles {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                margin: 0 auto 12px;
                width: 100%;
                max-width: 540px;
            }

            .display-toggle {
                display: inline-flex;
                align-items: center;
                gap: 7px;
                padding: 8px 11px;
                border: 1px solid var(--border, #343a40);
                border-radius: 9px;
                background: var(--panel, #171a1f);
                color: var(--text, #f2f2f2);
                font-size: 12px;
                cursor: pointer;
                user-select: none;
            }

            .display-toggle input {
                accent-color: var(--accent, #a6c95b);
                width: 15px;
                height: 15px;
                margin: 0;
                cursor: pointer;
            }

            /* Hide the evaluation bar and reclaim its space. */
            .board-with-eval.eval-hidden {
                grid-template-columns: minmax(0, 1fr) !important;
                gap: 0 !important;
            }

            .board-with-eval.eval-hidden .eval-column {
                display: none !important;
            }

            /* Hide only the best-move recommendation. */
            .analysis-summary.best-move-hidden .best-move-wrap {
                display: none !important;
            }

            .analysis-summary.best-move-hidden {
                justify-content: flex-start;
            }

            @media (max-width: 760px) {
                .analysis-display-toggles {
                    max-width: min(100%, calc(100vw - 34px));
                    gap: 7px;
                }

                .display-toggle {
                    padding: 7px 9px;
                }
            }
        `;

        document.head.appendChild(style);
    }

    const evalToggle = $('toggleEvalBar');
    const bestToggle = $('toggleBestMove');

    // Restore the user's previous choices.
    try {
        evalToggle.checked =
            localStorage.getItem('positionLabShowEvalBar') !== 'false';

        bestToggle.checked =
            localStorage.getItem('positionLabShowBestMove') !== 'false';
    } catch (error) {
        evalToggle.checked = true;
        bestToggle.checked = true;
    }

    function applyDisplaySettings() {
        const showEval = evalToggle.checked;
        const showBest = bestToggle.checked;

        boardWithEval.classList.toggle(
            'eval-hidden',
            !showEval
        );

        analysisSummary.classList.toggle(
            'best-move-hidden',
            !showBest
        );

        // Remember the settings on this device.
        try {
            localStorage.setItem(
                'positionLabShowEvalBar',
                String(showEval)
            );

            localStorage.setItem(
                'positionLabShowBestMove',
                String(showBest)
            );
        } catch (error) {
            // The toggles still work if local storage is unavailable.
        }
    }

    evalToggle.addEventListener('change', applyDisplaySettings);
    bestToggle.addEventListener('change', applyDisplaySettings);

    applyDisplaySettings();
}

/* =========================================
   EVALUATION DISPLAY
========================================= */

function updateEvaluation(
    scoreText,
    whitePercent,
    bestMove,
    status = 'Analysis updated'
) {
    const score = $('evalScore');
    const fill = $('evalWhiteFill');
    const bar = $('evalBar');

    if (score) {
        score.textContent = scoreText;
    }

    if (fill) {
        fill.style.height =
            Math.max(3, Math.min(97, whitePercent)) + '%';
    }

    if (bar) {
        bar.setAttribute(
            'aria-valuenow',
            String(Math.round(whitePercent - 50) * 2)
        );

        bar.setAttribute('aria-valuetext', scoreText);
    }

    if (bestMove !== undefined) {
        const el = $('bestMove');

        if (el) {
            el.textContent = bestMove || '—';
        }
    }

    setEvalStatus(status);
}

function uciToMove(uci) {
    if (!uci || uci === '(none)' || uci === '0000') {
        return 'No legal move';
    }

    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);

    const promotion = uci[4]
        ? ' = ' + uci[4].toUpperCase()
        : '';

    return from + ' → ' + to + promotion;
}

function parseInfo(line, fen) {
    if (!line.startsWith('info ') || !line.includes(' score ')) {
        return;
    }

    const cp = line.match(/\bscore cp (-?\d+)/);
    const mate = line.match(/\bscore mate (-?\d+)/);

    if (!cp && !mate) return;

    const sideToMove = (fen.split(/\s+/)[1] || 'w');

    let whiteScore;
    let label;

    if (mate) {
        let n = Number(mate[1]);

        if (sideToMove === 'b') {
            n = -n;
        }

        whiteScore = n > 0 ? 10000 : n < 0 ? -10000 : 0;

        label = n === 0
            ? 'M0'
            : n > 0
                ? 'M' + n
                : '−M' + Math.abs(n);
    } else {
        let value = Number(cp[1]) / 100;

        if (sideToMove === 'b') {
            value = -value;
        }

        whiteScore = value;

        label =
            (value > 0 ? '+' : '') +
            value.toFixed(1).replace('-', '−');
    }

    const percent = mate
        ? whiteScore > 0
            ? 97
            : whiteScore < 0
                ? 3
                : 50
        : 50 + 47 * Math.tanh(whiteScore / 4);

    updateEvaluation(
        label,
        percent,
        undefined,
        'Stockfish analysing…'
    );
}

/* =========================================
   SCREENSHOT RECOGNITION
========================================= */

$('imageInput')?.addEventListener('change', e => {
    scanFile = e.target.files?.[0] || null;

    const button = $('recognizeImage');

    if (button) {
        button.disabled = !scanFile;
    }
});

$('recognizeImage')?.addEventListener('click', async () => {
    if (!scanFile) return;

    const btn = $('recognizeImage');

    btn.disabled = true;
    btn.textContent = 'Loading recognizer…';

    imageStatus(
        'Loading the in-browser chessboard recognition model. First use may take a little while…'
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
                'No chessboard was detected. Try a screenshot where the full board is visible and not heavily cropped.'
            );

            return;
        }

        const mod = await import(
            'https://esm.sh/@scoriiu/fenshot'
        );

        const { placement, orientation } =
            mod.resolveOrientation(result.placement);

        const base = mod.placementToFen(
            placement,
            $('imageTurn').value
        );

        const parts = base.split(/\s+/);

        parts[1] = $('imageTurn').value;

        $('imageFen').value = parts.join(' ');

        if (!result.reliable) {
            imageStatus(
                `Board detected, but recognition confidence is low (${Math.round(result.meanConfidence * 100)}% average; ${Math.round(result.minConfidence * 100)}% weakest square). Review the FEN and correct any pieces before loading. Orientation: ${orientation || 'detected'}.`
            );
        } else {
            imageStatus(
                `Board recognized (${Math.round(result.meanConfidence * 100)}% average confidence). The screenshot cannot reveal whose turn it is, castling history, or en-passant rights, so choose the side to move and review special rights in the FEN if needed.`
            );
        }

        $('loadImageFen').click();

    } catch (err) {
        imageStatus(
            'Recognition could not start. This file needs internet access to load the model. Details: ' +
            (err?.message || err)
        );

    } finally {
        btn.disabled = !scanFile;
        btn.textContent = 'Recognize board';
    }
});

/* =========================================
   LOCAL STOCKFISH ENGINE
   Keep the .js and matching .wasm files
   beside index.html.
========================================= */

function launchRequest(req) {
    if (!stockfishWorker || !stockfishReady || !req) {
        return;
    }

    activeMode = req.mode;
    activeFen = req.fen;
    activeSearch = true;
    stopRequested = false;

    if (activeMode === 'analysis') {
        lastAnalysisFen = req.fen;

        updateEvaluation(
            '…',
            50,
            'Thinking…',
            'Stockfish analysing this position…'
        );
    }

    stockfishWorker.postMessage('position fen ' + req.fen);

    stockfishWorker.postMessage(
        'go depth ' + (activeMode === 'play' ? 12 : 14)
    );
}

function requestEngine(mode, fen) {
    initStockfish();

    if (!stockfishReady || !stockfishWorker) {
        return false;
    }

    const req = { mode, fen };

    if (activeSearch) {
        queuedRequest = req;

        if (!stopRequested) {
            stopRequested = true;
            stockfishWorker.postMessage('stop');
        }
    } else {
        launchRequest(req);
    }

    return true;
}

function initStockfish() {
    if (stockfishWorker) return;

    try {
        const engineUrl = new URL(
            './stockfish-19-lite-single.js',
            import.meta.url
        );

        stockfishWorker = new Worker(engineUrl);

        stockfishWorker.onmessage = e => {
            const line =
                typeof e.data === 'string'
                    ? e.data
                    : String(e.data || '');

            if (line.includes('uciok')) {
                stockfishWorker.postMessage('isready');
                return;
            }

            if (line.includes('readyok')) {
                stockfishReady = true;

                engineStatus('Stockfish is ready.');

                setCapability(
                    'Local Stockfish 19 Lite engine connected.'
                );

                const current = window.positionLabGetFen
                    ? window.positionLabGetFen()
                    : null;

                if (current) {
                    requestEngine('analysis', current);
                }

                return;
            }

            if (
                line.startsWith('info ') &&
                activeMode === 'analysis'
            ) {
                parseInfo(line, activeFen);
            }

            if (line.startsWith('bestmove')) {
                const uci = line.trim().split(/\s+/)[1];

                if (stopRequested) {
                    activeSearch = false;
                    stopRequested = false;

                    const next = queuedRequest;
                    queuedRequest = null;

                    if (next) {
                        launchRequest(next);
                    }

                    return;
                }

                activeSearch = false;

                if (activeMode === 'play') {
                    if (
                        uci &&
                        uci !== '(none)' &&
                        window.positionLabApplyUci
                    ) {
                        window.positionLabApplyUci(uci);
                    }
                } else {
                    const currentScore =
                        $('evalScore')?.textContent || '0.0';

                    const currentPercent =
                        parseFloat(
                            $('evalBar')?.getAttribute('aria-valuenow') || '0'
                        ) / 2 + 50;

                    updateEvaluation(
                        currentScore,
                        currentPercent,
                        uciToMove(uci),
                        uci === '(none)'
                            ? 'No legal moves in this position.'
                            : 'Best move found'
                    );
                }

                if (queuedRequest) {
                    const next = queuedRequest;
                    queuedRequest = null;
                    launchRequest(next);
                }
            }
        };

        stockfishWorker.onerror = e => {
            stockfishReady = false;
            activeSearch = false;
            queuedRequest = null;
            stopRequested = false;

            engineStatus(
                'Stockfish failed to load. Check that both stockfish-19-lite-single.js and stockfish-19-lite-single.wasm are in the project root.'
            );

            setCapability(
                'Stockfish could not load; computer play may use the built-in fallback engine.'
            );

            setEvalStatus('Stockfish could not load.');

            console.error(
                'Stockfish worker error:',
                e.message || e
            );

            try {
                stockfishWorker.terminate();
            } catch (_) {}

            stockfishWorker = null;
        };

        engineStatus('Loading local Stockfish engine…');

        stockfishWorker.postMessage('uci');

    } catch (e) {
        stockfishReady = false;
        stockfishWorker = null;

        engineStatus(
            'Stockfish is unavailable; using the built-in fallback engine.'
        );

        setCapability('Stockfish could not start.');
        setEvalStatus('Stockfish could not start.');

        console.error('Could not start Stockfish:', e);
    }
}

/* =========================================
   CONNECTIONS TO THE MAIN APP
========================================= */

window.positionLabRequestStockfish = fen =>
    requestEngine('play', fen);

window.positionLabAnalyzePosition = fen => {
    if (!fen || !stockfishReady) {
        initStockfish();
        return false;
    }

    if (
        fen === lastAnalysisFen &&
        activeMode === 'analysis' &&
        !queuedRequest &&
        !stopRequested
    ) {
        return true;
    }

    return requestEngine('analysis', fen);
};

window.positionLabGetFen = () =>
    $('fen')?.value || null;

window.positionLabStockfishReady = () =>
    stockfishReady;

/* =========================================
   STARTUP
========================================= */

setCapability(
    'Screenshot recognition and local Stockfish are loading. Internet access is needed on first load.'
);

setupAnalysisDisplayToggles();
initStockfish();
