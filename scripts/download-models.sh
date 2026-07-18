#!/usr/bin/env bash
set -euo pipefail

MODEL_DIR="${READLOCAL_MODEL_DIR:-models}"
SUPERTONIC_REV="3cadd1ee6394adea1bd021217a0e650ede09a323"
SUPERTONIC_URL="https://huggingface.co/Supertone/supertonic-3/resolve/${SUPERTONIC_REV}"

checksum() {
  case "$1" in
    onnx/duration_predictor.onnx) echo c3eb91414d5ff8a7a239b7fe9e34e7e2bf8a8140d8375ffb14718b1c639325db ;;
    onnx/text_encoder.onnx) echo c7befd5ea8c3119769e8a6c1486c4edc6a3bc8365c67621c881bbb774b9902ff ;;
    onnx/vector_estimator.onnx) echo 883ac868ea0275ef0e991524dc64f16b3c0376efd7c320af6b53f5b780d7c61c ;;
    onnx/vocoder.onnx) echo 085de76dd8e8d5836d6ca66826601f615939218f90e519f70ee8a36ed2a4c4ba ;;
    onnx/tts.json) echo 42078d3aef1cd43ab43021f3c54f47d2d75ceb4e75f627f118890128b06a0d09 ;;
    onnx/unicode_indexer.json) echo 9bf7346e43883a81f8645c81224f786d43c5b57f3641f6e7671a7d6c493cb24f ;;
    voice_styles/M1.json) echo e35604687f5d23694b8e91593a93eec0e4eca6c0b02bb8ed69139ab2ea6b0a5b ;;
    voice_styles/M2.json) echo b76cbf62bac707c710cf0ae5aba5e31eea1a6339a9734bfae33ab98499534a50 ;;
    voice_styles/F1.json) echo bbdec6ee00231c2c742ad05483df5334cab3b52fda3ba38e6a07059c4563dbc2 ;;
    voice_styles/F2.json) echo 7c722c6a72707b1a77f035d67f0d1351ba187738e06f7683e8c72b1df3477fc6 ;;
  esac
}

verify() {
  [[ "$(shasum -a 256 "$2" | cut -d ' ' -f 1)" == "$(checksum "$1")" ]]
}

download() {
  local path="$1" target="$MODEL_DIR/supertonic/$1"
  if [[ -f "$target" ]]; then
    verify "$path" "$target" || { echo "Checksum failed: $target" >&2; return 1; }
    return
  fi
  mkdir -p "$(dirname "$target")"
  curl --fail --location --retry 3 "$SUPERTONIC_URL/$path" --output "$target.part"
  verify "$path" "$target.part" || { rm -f "$target.part"; echo "Checksum failed: $path" >&2; return 1; }
  mv "$target.part" "$target"
}

for path in onnx/duration_predictor.onnx onnx/text_encoder.onnx onnx/vector_estimator.onnx onnx/vocoder.onnx onnx/tts.json onnx/unicode_indexer.json voice_styles/M1.json voice_styles/M2.json voice_styles/F1.json voice_styles/F2.json
do download "$path"; done

mkdir -p "$MODEL_DIR/ocr"
cp node_modules/tesseract.js/dist/worker.min.js node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt "$MODEL_DIR/ocr/"
cp node_modules/tesseract.js-core/tesseract-core*.js node_modules/tesseract.js-core/tesseract-core*.wasm "$MODEL_DIR/ocr/"
cp node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz "$MODEL_DIR/ocr/"

echo "Models ready in $MODEL_DIR"
