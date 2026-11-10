#!/bin/sh
set -eu
export CARGO_HOME=/cache/cargo
export CARGO_TARGET_DIR=/cache/target
rustc --version --verbose > /work/rust-version.txt
rustup target add wasm32-unknown-unknown
if [ "${FOCUSED_TESTS:-0}" = 1 ]; then
  cargo test --manifest-path /src/Cargo.toml --locked --release -p engine --no-default-features --test raked_convergence > /work/regression-tests.log 2>&1 || { cat /work/regression-tests.log; exit 1; }
  cat /work/regression-tests.log
else
  cargo test --manifest-path /src/Cargo.toml --locked --release -p engine --no-default-features > /work/engine-tests.log 2>&1 || { tail -80 /work/engine-tests.log; exit 1; }
fi
if [ "${FOCUSED_TESTS:-0}" != 1 ]; then tail -12 /work/engine-tests.log; fi
cargo build --manifest-path /src/Cargo.toml --locked --release --target wasm32-unknown-unknown -p solver-wasm
mkdir -p /work/pkg
/cache/bindgen/wasm-bindgen --version > /work/bindgen-version.txt
/cache/bindgen/wasm-bindgen /cache/target/wasm32-unknown-unknown/release/solver_wasm.wasm --target web --out-dir /work/pkg
