const $ = id => document.getElementById(id);
let scanFile = null, recognizer = null, stockfishWorker = null, stockfishReady = false, pendingBestMove = false;
function imageStatus(message){ const el=$('imageMessage'); if(el) el.textContent=message; }
function engineStatus(message){ const el=$('engineStatus'); if(el) el.textContent=message; }
function setCapability(message){ const el=$('capabilityStatus'); if(el) el.textContent=message; }
$('imageInput')?.addEventListener('change', e => { scanFile=e.target.files?.[0]||null; $('recognizeImage').disabled=!scanFile; });
$('recognizeImage')?.addEventListener('click', async () => {
 if(!scanFile) return;
 const btn=$('recognizeImage'); btn.disabled=true; btn.textContent='Loading recognizer…';
 imageStatus('Loading the in-browser chessboard recognition model. First use may take a little while…');
 try {
   if(!recognizer){
     const mod=await import('https://esm.sh/@scoriiu/fenshot');
     recognizer=mod.createRecognizer({modelUrl:'https://cdn.jsdelivr.net/npm/@scoriiu/fenshot/model/chess-tiles-v2.onnx',wasmPaths:'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/'});
   }
   imageStatus('Scanning the screenshot locally…');
   const result=await recognizer.recognize(scanFile);
   if(!result){ imageStatus('No chessboard was detected. Try a screenshot where the full board is visible and not heavily cropped.'); return; }
   const {placement,orientation}= (await import('https://esm.sh/@scoriiu/fenshot')).resolveOrientation(result.placement);
   const {placementToFen}=await import('https://esm.sh/@scoriiu/fenshot');
   const base=placementToFen(placement,$('imageTurn').value);
   // Preserve the recognition result, but the screenshot alone cannot reveal move history.
   const parts=base.split(/\s+/); parts[1]=$('imageTurn').value;
   if(!result.reliable){
     $('imageFen').value=parts.join(' ');
     imageStatus(`Board detected, but recognition confidence is low (${Math.round(result.meanConfidence*100)}% average; ${Math.round(result.minConfidence*100)}% weakest square). Review the FEN and correct any pieces before loading. Orientation: ${orientation||'detected'}.`);
   } else {
     $('imageFen').value=parts.join(' ');
     imageStatus(`Board recognized (${Math.round(result.meanConfidence*100)}% average confidence). The screenshot cannot reveal whose turn it is, castling history, or en-passant rights, so choose the side to move and review special rights in the FEN if needed.`);
   }
   $('loadImageFen').click();
 } catch(err) {
   imageStatus('Recognition could not start. This file needs internet access to load the model, and some browsers restrict model loading from file://. Try opening it through a local web server. Details: '+(err?.message||err));
 } finally { btn.disabled=!scanFile; btn.textContent='Recognize board'; }
});
// Stockfish UCI adapter. Use the small single-threaded WASM engine and fall back safely if blocked.
function initStockfish(){
 if(stockfishWorker) return;
 try{
  const source=`self.Module={locateFile:function(path){return 'https://cdn.jsdelivr.net/npm/stockfish@17.1.0/src/'+path;}}; importScripts('https://cdn.jsdelivr.net/npm/stockfish@17.1.0/src/stockfish-17.1-lite-single-03e3232.js');`;
  const blob=new Blob([source],{type:'text/javascript'}); stockfishWorker=new Worker(URL.createObjectURL(blob));
  stockfishWorker.onmessage=e=>{
   const line=typeof e.data==='string'?e.data:String(e.data||'');
   if(line.includes('uciok')){stockfishWorker.postMessage('isready');return;}
   if(line.includes('readyok')){stockfishReady=true;engineStatus('Stockfish is ready.');setCapability('Stockfish engine connected. Screenshot recognition runs locally; external model files are downloaded on first scan.');return;}
   if(line.startsWith('bestmove')){
    pendingBestMove=false; const uci=line.split(/\s+/)[1];
    if(uci&&uci!=='(none)'&&window.positionLabApplyUci){window.positionLabApplyUci(uci);}
   }
  };
  stockfishWorker.onerror=()=>{stockfishReady=false;engineStatus('Stockfish could not load in this browser; using the built-in fallback engine.');};
  stockfishWorker.postMessage('uci');
 }catch(e){stockfishReady=false;engineStatus('Stockfish is unavailable here; using the built-in fallback engine.');}
}
window.positionLabRequestStockfish = fen => {
 initStockfish();
 if(stockfishReady && stockfishWorker){pendingBestMove=true;stockfishWorker.postMessage('position fen '+fen);stockfishWorker.postMessage('go depth 12');return true;}
 return false;
};
window.positionLabStockfishReady = () => stockfishReady;
window.positionLabPendingBestMove = () => pendingBestMove;
setCapability('Automatic screenshot recognition and Stockfish are wired in. Both download their public model/engine assets on demand and need internet access.');
initStockfish();
