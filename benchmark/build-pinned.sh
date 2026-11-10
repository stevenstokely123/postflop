#!/bin/sh
set -eu
export CARGO_HOME=/work/cargo
export CARGO_TARGET_DIR=/work/target
rustc --version --verbose > /work/rust-version.txt
rustup target add wasm32-unknown-unknown
cargo build --manifest-path /src/Cargo.toml --locked --release --target wasm32-unknown-unknown -p solver-wasm
mkdir -p /work/bindgen /work/pkg
curl --fail --location --retry 3 https://github.com/wasm-bindgen/wasm-bindgen/releases/download/0.2.127/wasm-bindgen-0.2.127-x86_64-unknown-linux-musl.tar.gz --output /work/bindgen.tar.gz
printf '%s  %s\n' '61d4a7dc85acfa0d2354ccc0b8361928c7e52a746d17f28ebaa795ed3dc1614a' '/work/bindgen.tar.gz' | sha256sum --check
sha256sum /work/bindgen.tar.gz > /work/bindgen.sha256
tar -xzf /work/bindgen.tar.gz -C /work/bindgen --strip-components=1
/work/bindgen/wasm-bindgen --version > /work/bindgen-version.txt
/work/bindgen/wasm-bindgen /work/target/wasm32-unknown-unknown/release/solver_wasm.wasm --target web --out-dir /work/pkg
