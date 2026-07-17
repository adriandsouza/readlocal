#!/usr/bin/env bash
set -euo pipefail

MODEL_DIR="${READLOCAL_MODEL_DIR:-models}"
SUPERTONIC_REV="3cadd1ee6394adea1bd021217a0e650ede09a323"
SUPERTONIC_URL="https://huggingface.co/Supertone/supertonic-3/resolve/${SUPERTONIC_REV}"

download() {
  local path="$1" target="$MODEL_DIR/supertonic/$1"
  [[ -f "$target" ]] && return
  mkdir -p "$(dirname "$target")"
  curl --fail --location --retry 3 "$SUPERTONIC_URL/$path" --output "$target"
}

for path in onnx/duration_predictor.onnx onnx/text_encoder.onnx onnx/vector_estimator.onnx onnx/vocoder.onnx onnx/tts.json onnx/unicode_indexer.json voice_styles/M1.json voice_styles/M2.json voice_styles/F1.json voice_styles/F2.json
do download "$path"; done

mkdir -p "$MODEL_DIR/ocr"
cp node_modules/tesseract.js/dist/worker.min.js node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt "$MODEL_DIR/ocr/"
cp node_modules/tesseract.js-core/tesseract-core*.js node_modules/tesseract.js-core/tesseract-core*.wasm "$MODEL_DIR/ocr/"
for language in eng ara hin fra spa deu ita por jpn kor chi_sim
do cp "node_modules/@tesseract.js-data/$language/4.0.0/$language.traineddata.gz" "$MODEL_DIR/ocr/"; done

echo "Models ready in $MODEL_DIR"
