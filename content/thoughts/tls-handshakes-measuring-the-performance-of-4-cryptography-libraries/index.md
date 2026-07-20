+++
date = 2026-06-12
description = "Evaluates the combination of three key agreements, five signing algorithms and three cipher suites in different crypto projects."
title = "TLS Handshakes: Measuring the Performance of 4 Cryptography Libraries"

[taxonomies]
tags = ["rust", "tls", "wtx"]

[extra]
image = "/thoughts/tls-handshakes-measuring-the-performance-of-4-cryptography-libraries/intro.avif"
+++

<figure class="image">
  <img src="/thoughts/tls-handshakes-measuring-the-performance-of-4-cryptography-libraries/intro.avif" alt="Introduction">
  <figcaption>Photo by FlyD on Unsplash</a></figcaption>
</figure>

This blog post assumes that readers are familiar with the mentioned technologies. In other words, there won't be introductory explanations.

Combinations of four cryptography libraries (`aws-lc-rs`, `Graviola`, `ring`, `OpenSSL`), three key agreements (`Secp256r1`, `Secp384r1`, `X25519`), five signing algorithms (`EcdsaSecp256r1Sha256`, `EcdsaSecp384r1Sha384`, `Ed25519`, `RsaPssRsaeSha256`, `RsaPssRsaeSha384`) and three cipher suites (`Aes128GcmSha256`, `Aes256GcmSha384`, `Chacha20Poly1305Sha256`) were tested in the [WTX](https://github.com/c410-f3r/wtx) project to evaluate the impact they have on TLS handshakes.

The TLS handshake may seem trivial but it is a dense process that involves everything from hashing and key agreements to encryptions, thus the push for stuff like 0-RTT, raw public keys, PSK, signatureless certificates, etc.

All certificates and applications are available at <a href="/thoughts/tls-handshakes-measuring-the-performance-of-4-cryptography-libraries/wtx-bench.tar.xz">wtx-bench.tar.xz</a> where you can run everything in your own machine through the execution of the `assets/bench.sh` script.

Post-quantum algorithms were excluded as they are not yet supported by [WTX](https://github.com/c410-f3r/wtx). Feedback and corrections are welcome.

## Methodology

Applications start the decoding of 3 PEM file contents (public key, secret key, root ca) that are later added to the main TLS configuration structures. A TCP server listens to connections in the main thread while a TCP client initiates the sending of a `ClientHello` with the intended algorithms in another thread. Once each party finishes the TLS handshake via the processing of the `Finished` record, the application immediately closes itself without exchanging application data frames.

While the decoding of PEM data and the use of TCP add overhead to the evaluated numbers in the sense that they hide the "true" performance cost of each algorithm, such features are tolerated in the name of convenience :)

After all 36 (4 x 3 x 3) builds are finished, each one of them are sequentially measured with the help of the `hyperfine` binary that finally outputs all results into a `CSV` file.

## Hardware

* `Kernel`: Linux fedora 7.0.11-200.fc44.x86_64 #1 SMP PREEMPT_DYNAMIC
* `Processor`: AMD Ryzen 9 5900X 12-Core Processor
* `Disk`: Corsair Force MP510
* `Memory`: 32GB DDR4

## Aes128GcmSha256

Execution time in seconds. Lower is better.

<figure class="image">
  <img src="/thoughts/tls-handshakes-measuring-the-performance-of-4-cryptography-libraries/aes128gcmsha256.svg" alt="Aes128GcmSha256">
</figure>

## Aes256GcmSha384

Execution time in seconds. Lower is better.

<figure class="image">
  <img src="/thoughts/tls-handshakes-measuring-the-performance-of-4-cryptography-libraries/aes256gcmsha384.svg" alt="Aes256GcmSha384">
</figure>

## Chacha20Poly1305Sha256

Execution time in seconds. Lower is better.

<figure class="image">
  <img src="/thoughts/tls-handshakes-measuring-the-performance-of-4-cryptography-libraries/chacha20poly1305sha256.svg" alt="Chacha20Poly1305Sha256">
</figure>

## Findings

* `OpenSSL` is the slower library. It is unknown if the root cause is a missing compile flag, an internal misconfiguration, the `openssl-sys` crate or `OpenSSL` itself.

* `Aes128GcmSha256`, `Aes256GcmSha384` and `Chacha20Poly1305Sha256` showed nearly identical values across all scenarios.

* There seems to be room for optimization in `scep384r1` (Key Agreement) for both `OpenSSL` and `ring`.

* `Graviola` is a promising new cryptography library.

* Looks like `aws-lc-rs` is not as fast as `ring` or `Graviola` when dealing with `RSA-PSS`.
