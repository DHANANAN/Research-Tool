#!/bin/sh
# Diagnostics run only inside a disposable builder; no research volume is mounted.
set -u
if [ -f /run/secrets/build_ca ]; then
    export SSL_CERT_FILE=/run/secrets/build_ca CARGO_HTTP_CAINFO=/run/secrets/build_ca
fi
printf '\nRESEARCH DIAGNOSTIC: Linux runtime and free space\n'
uname -m
rustc --version
cargo --version
df -h / /cargo-target /tmp
printf '\nRESEARCH DIAGNOSTIC: compile and execute a small Rust program\n'
printf 'fn main() { println!("RUST_EXECUTION_OK"); }\n' > /tmp/research-diagnostic.rs
rustc --crate-name research_diagnostic /tmp/research-diagnostic.rs -o /tmp/research-diagnostic
compile_status=$?
printf 'Small program compile exit code: %s\n' "$compile_status"
if [ "$compile_status" -eq 0 ]; then
    /tmp/research-diagnostic
    printf 'Small program execution exit code: %s\n' "$?"
    ls -l /tmp/research-diagnostic
    readelf -l /tmp/research-diagnostic | sed -n '/interpreter/p'
    ldd /tmp/research-diagnostic || true
fi
printf '\nRESEARCH DIAGNOSTIC: application compilation (8 minute limit)\n'
timeout 480 cargo build --locked --release
build_status=$?
printf 'Application build exit code: %s\n' "$build_status"
if [ "$build_status" -ne 0 ]; then
    printf '\nRESEARCH DIAGNOSTIC: proc-macro2 build files and loader\n'
    for dir in /cargo-target/release/build/proc-macro2-*; do
        [ -d "$dir" ] || continue
        ls -la "$dir"
        for program in "$dir"/build-script-build "$dir"/build_script_build-*; do
            [ -f "$program" ] || continue
            case "$program" in *.d) continue ;; esac
            printf '\nExecutable inspection: %s\n' "$program"
            readelf -l "$program" | sed -n '/interpreter/p'
            ldd "$program" || true
            # Do not re-run Cargo build scripts outside their Cargo environment.
        done
    done
    printf '\nRESEARCH DIAGNOSTIC: Linux loader files\n'
    ls -l /lib64/ld-linux* /lib/x86_64-linux-gnu/ld-linux* /lib/ld-linux* 2>/dev/null || true
fi
printf '\nRESEARCH DIAGNOSTIC COMPLETE (application build exit code %s)\n' "$build_status"
# Completing the diagnostic image successfully preserves the full report even
# when the application fails. The explicit application exit code is authoritative.
