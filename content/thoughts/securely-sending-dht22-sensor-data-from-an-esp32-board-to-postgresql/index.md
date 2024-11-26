+++
date = 2024-12-03
description = "Let's collect data provided by a DHT22 sensor and store it in a PostgreSQL database via WiFi using an encrypted connection."
title = "Securely sending DHT22 sensor data from an ESP32 board to PostgreSQL"

[taxonomies]
tags = ["iot", "rust", "wtx", "esp32", "postgresql", "pgsql", "tls", "ssl", "sensor", "dht22"]

[extra]
image = "/thoughts/securely-sending-dht22-sensor-data-from-an-esp32-board-to-postgresql/intro.jpg"
+++

<figure class="image">
  <img src="/thoughts/securely-sending-dht22-sensor-data-from-an-esp32-board-to-postgresql/intro.jpg" alt="Introduction">
</figure>

Let's collect data provided by a DHT22 sensor and store it asynchronously in a [PostgreSQL] database via WiFi using an encrypted connection. We will start with a brief introduction about the principal technologies, proceed to setting-up the necessary environment and then code our project.

The majority of the applications use Rust in a restricted `no_std` environment. If you are unfamiliar with Rust, take a look at <https://doc.rust-lang.org/book>.

As far as I can tell, there are no resources on the internet that tackles direct encrypted access to [PostgreSQL] with ESP32 or any other embedded device. Although not as powerful as HTTP requests, the approach shown here can be considered novel.

The final product is available at <https://github.com/c410-f3r/blog-posts> in the `esp32-postgresql` directory.

## Technologies

This section won't focus on toolchains, system dependencies or auxiliary CLI tools. Instead, it will provide a brief introduction about the primary softwares/crates alongside the hardware components. If desirable, you can skip to the "Set-up" section

#### WTX

[WTX] is, among other things, a [RFC6455](https://datatracker.ietf.org/doc/html/rfc6455), [RFC7541](https://datatracker.ietf.org/doc/html/rfc7541), [RFC7692](https://datatracker.ietf.org/doc/html/rfc7692), [RFC8441](https://datatracker.ietf.org/doc/html/rfc8441) and [RFC9113](https://datatracker.ietf.org/doc/html/rfc9113) implementation intended to allow the development of web applications through a built-in server framework, a built-in `PostgreSQL` connector, a built-in `WebSocket` handler and a built-in `gRPC` manager. There is also a built-in API client framework that facilitates the maintainability of large endpoints.

Every feature is optional and must be set at compile time. We are only going to use [PostgreSQL] but [WTX] is flexible enough to even serve `gRPC` requests on ESP32 devices.

Some query benchmarks are available at <https://github.com/diesel-rs/metrics>.

#### ESP32-WROVER-E

ESP32 is a series of low-cost, low-power system-on-chip microcontrollers created and developed by Espressif Systems, a Chinese company based in Shanghai.

Specifically, the `ESP32-WROVER-E` is a 32-bit dual-core development board with WiFi, 448 KiB of ROM, 520 KiB of RAM, Bluetooth, 4 MiB of Flash, built-in PCB antenna, 40 different pins, a camera and several other features. Quite affordable considering the place where I live.

#### Embedded-TLS

Pure Rust implementation of the TLS 1.3 protocol designed for embedded systems, this crate provides synchronous and asynchronous interfaces as well as integration with `embassy` or `tokio`. The authors currently state that development is still in progress but [Embedded-TLS] was capable of successfully establishing an encrypted connection with [PostgreSQL].

If you are curious, `rustls` with its "raw buffered" interface couldn't be used because `alloc::sync::Arc` is hard-coded in the interface and the tested board doesn't provide native support for such primitive structure.

#### ESP32 crates

The embedded world is generally dominated by C toolchains but thankfully, we are now witnessing a growing shift towards Rust-based alternatives. Espressif Systems, for example, provides ***official*** libraries, documentation and tools that can help creating, compiling, debugging and deploying binaries.

Some [Embassy] crates will also be used to provide other synergic functionalities like a runtime executor or a TCP connector.

#### DHT22

A low-cost sensor used for measuring temperature and humidity approximately once every 2 seconds. Temperatures vary from -40°C to 80°C with an average accuracy of 0.5°C and humidity varies from 0% to 100% with an average accuracy of 2%.

There are versions with built-in resistors, which isn't the case for 4-pins variants that require an external resistor ranging from 4.7kΩ to 10kΩ.

Local tests unfortunately reported intermittent reads and halts. It is unclear whether these issues resulted from pre-existing manufacturing defects.

## Set-up

Setting up a development environment for non-mainstream architectures often takes a surprising amount of time. A missing compiler flag can completely break your build and finding help for these niche setups can be difficult due to the usual lack of online resources.

It wasn't so difficult for ESP32 but there are a bunch of things that need to be taken into consideration, let's get to work.

#### Schematic

The following image illustrates all necessary connections powered by a 3.3V line.

<figure class="image">
  <img src="/thoughts/securely-sending-dht22-sensor-data-from-an-esp32-board-to-postgresql/schematic.webp" alt="Schematic">
  <figcaption>Photo retrieved from https://capsistema.com.br</figcaption>
</figure>

#### Local tools

ESP32 processors are increasingly entering in the `LLVM` main branch and consequently in `rustc`. For example, the Xtensa architecture was merged as a tier 3 target a few months ago (<https://github.com/rust-lang/rust/pull/126380>).

There is still work to do until a fully feature-complete toolchain is natively available for users. In the meanwhile we will have to use custom toolchains provided by `espup`.

```bash
cargo install espup
cargo install espflash
espup install
```

`espflash` is responsible for flashing/deploying the final binary to the physical hardware and it is automatically called when running `cargo run`.

The setting up of environment variables is another important development aspect. Take a look at <https://docs.esp-rs.org/book/installation/riscv-and-xtensa.html> to see the best approach for you.

#### Cargo

Mentioning what someone once said: "Cargo is a gift sent by god."

Exaggerations aside, `Cargo` is indeed a very handy tool especially if you come from the C/C++ world where the building of applications isn't always very trivial.

Starting with the file tree of our application.

```txt
/esp32-postgresql
├── .cargo
│   └── config.toml
├── src
│   └── main.rs
├── build.rs
├── Cargo.toml
└── rust-toolchain
```

Use the toolchain installed by `espup`.

```toml
# rust-toolchain

[toolchain]
channel = "esp"
```

Set the custom linking script.

```rust
// build.rs

fn main() {
  println!("cargo:rustc-link-arg-bins=-Tlinkall.x");
}
```

Instruct `rustc` to build for the `xtensa-esp32-none-elf` target alongside other additional parameters that can't be proxied with `Cargo`.

```toml
# config.toml

[target.xtensa-esp32-none-elf]
runner = "espflash flash --monitor"

[build]
rustflags = ["-C", "link-arg=-nostartfiles", "-C", "link-arg=-Trom_functions.x"]

target = "xtensa-esp32-none-elf"

[unstable]
build-std = ["alloc", "core"]
```

Declare the necessary dependencies. The list is big but necessary. 

```toml
# Cargo.toml

[dependencies]
# Schedules asynchronous tasks for completion
embassy-executor = { default-features = false, features = ["task-arena-size-32768"], version = "0.6" }

# Plain TCP connection
embassy-net = { default-features = false, features = ["tcp", "dhcpv4-hostname"], version = "0.4" }

# Reads DHT22 data
embedded-dht-rs = { default-features = false, features = ["dht22"], version = "0.3" }

# Enables TLS 1.3 connection
embedded-tls = { default-features = false, git = "https://github.com/drogue-iot/embedded-tls" }

# Allocates heap memory
esp-alloc = { default-features = false, version = "0.5" }

# For example, useful to print the stack call of a raised error
esp-backtrace = { default-features = false, features = ["esp32", "panic-handler", "println"], version = "0.14" }

# Contains the main features and structures
esp-hal = { default-features = false, features = ["esp32"], version = "0.21" }

# Glue between Embassy and ESP
esp-hal-embassy = { default-features = false, features = ["esp32", "executors", "integrated-timers"], version = "0.4" }

# Among other things, prints messages into the screen
esp-println = { default-features = false, features = ["auto", "esp32"], version = "0.12" }

# WiFi connectivity 
esp-wifi = { default-features = false, features = ["async", "dhcpv4", "embassy-net", "esp32", "esp-alloc", "ipv4", "tcp", "wifi"], version = "0.10" }

# Randomness generator
rand = { default-features = false, features = ["std_rng"], version = "0.8" }

# Parses certificate files
rustls-pemfile = { default-features = false, version = "2.0" }

# Pins values in static memory
static_cell = { default-features = false, version = "2.0" }

# PostgreSQL client
wtx = { default-features = false, features = ["embassy-net", "embedded-tls", "portable-atomic-util", "postgres"], git = "https://github.com/c410-f3r/wtx" }

[package]
edition = "2021"
name = "esp32-postgres"
version = "0.1.0"
```

To finish, tweak parameters that drive the final binary size. The following snippet provides some suggestions but you can change them as much as you like.

```toml
# Cargo.toml

[profile.release]
codegen-units = 1
debug = false
debug-assertions = false
incremental = false
lto = true
opt-level = 'z'
overflow-checks = false
panic = 'abort'
rpath = false
strip = "symbols"
```

On an additional note, further size surplus can be cut using `cargo run -Z build-std-features="panic_immediate_abort" --release`.

#### PostgreSQL server

At least for me, it is impressive to see an open-source project with almost ~30 years of existence still kicking in green field projects with no signs of stopping. That was one of the many reasons I chose [PostgreSQL] as the first database implementation within [WTX].

As many others have done, we will use `openssl` to generate our RSA-based certificates for the TLS session. If you prefer, there are other tools with more user-friendly interfaces that do the same thing.

```bash
set -euxo pipefail

CERTS_DIR="/tmp"
openssl req -newkey rsa:2048 -nodes -subj "/C=FI/CN=vahid" -keyout $CERTS_DIR/key.pem -out $CERTS_DIR/key.csr
openssl x509 -signkey $CERTS_DIR/key.pem -in $CERTS_DIR/key.csr -req -days 365 -out $CERTS_DIR/cert.pem
openssl req -x509 -sha256 -nodes -subj "/C=FI/CN=vahid" -days 365 -newkey rsa:2048 -keyout $CERTS_DIR/root-ca.key -out $CERTS_DIR/root-ca.crt
cat <<'EOF' >> $CERTS_DIR/localhost.ext
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
subjectAltName = @alt_names
[alt_names]
DNS.1 = localhost
IP.1 = 127.0.0.1
EOF
openssl x509 -req -CA $CERTS_DIR/root-ca.crt -CAkey $CERTS_DIR/root-ca.key -in $CERTS_DIR/key.csr -out $CERTS_DIR/cert.pem -days 365 -CAcreateserial -extfile $CERTS_DIR/localhost.ext
rm $CERTS_DIR/key.csr
rm $CERTS_DIR/localhost.ext
rm $CERTS_DIR/root-ca.srl
```

With the root authority, server certificate and private key, it is time to create step-by-step a bash script that will be injected in the database at start-up time.

Again, if you prefer, there are other ways to achieve what we are going to do. See <https://www.postgresql.org/docs/current/ssl-tcp.html>.

Create a file named "postgres.sh" and copy the contents of `root-ca.crt`.

```bash
echo "-----BEGIN CERTIFICATE-----
MIIDGzCCAgOgAwIBAgIUNyNgj7AfQAqRUjCB/O1cEa9lLa8wDQYJKoZIhvcNAQEL
BQAwHTELMAkGA1UEBhMCRkkxDjAMBgNVBAMMBXZhaGlkMB4XDTI0MDUxNDEzMjEz
MVoXDTI1MDUxNDEzMjEzMVowHTELMAkGA1UEBhMCRkkxDjAMBgNVBAMMBXZhaGlk
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxv/ZvnUxusA2OK8cIkBJ
mwb6AmZJno2e7hRmrF5392xunAduQ124r4D/tkPDbUaRR+QoIJLLk3Jw2J3HRhXe
yFdEBw1eFNu6YsvRx/kB1PDw5uCalSAqvsD6Psbf2FwvL+fCvLtKP0ZxK0WrE41K
XqgoN0C9CpkBntOkV9C75raAldwfXQu5qK9ceJxVli1+UhYGKUBT4uhXnBhLFpaS
J32jq9KXrTRBQdcNmmBfzn66BkOaT40bc+e278AIJFJl+zhVRLNHmNuTJqOibe3i
5/UZv7I7ARu5/DjKVCp4P6xWvs1dgQXR/MdLuE/vBI2GxHyYB0mkTxb7Zeo2jKTL
mQIDAQABo1MwUTAdBgNVHQ4EFgQUfhKIY70FG/SrFsSFoC3RUfL/x6EwHwYDVR0j
BBgwFoAUfhKIY70FG/SrFsSFoC3RUfL/x6EwDwYDVR0TAQH/BAUwAwEB/zANBgkq
hkiG9w0BAQsFAAOCAQEAbiHGCVEdBAql37HYj+4yXo6wHS++jJnGB0QdhS9AFS5R
9hPvsDPJNnE7xg/FBuSOJocgGALqf0rv4yC8xQrd+3Xu/r+7RwpaQDvUklC8JuDD
giGPfT0qQVnL75im3AweLEWYTdUdogN++TlylJemqYxSFhe/eabWw+Gqp3VNlWOs
bdcdYFlf2K9UP2P+fKP+OZcX+RCddiujZ/Uh78PqZQDyl2r5yBRkS14LkgnB6mIy
oV56YBqDV8gL2cIGHcpmEeOLjcTUQs4IaB1HZIgWJTALOchTcaGcey8fS8wcdcFV
MImfF1qweImlnjrzlZaMLMjuGOL4bhbmmJSGmC9E/g==
-----END CERTIFICATE-----" > $PGDATA/root-ca.crt
```

At start-up time the contents of the certificate will be inserted into the `$PGDATA/root-ca.crt` file. Do the same thing with `cert.pem` and `key.pem`.

```bash
echo "-----BEGIN CERTIFICATE-----
MIIDMTCCAhmgAwIBAgIUCIvHpCaXTC3T1KFpBPyNv9zA4YswDQYJKoZIhvcNAQEL
BQAwHTELMAkGA1UEBhMCRkkxDjAMBgNVBAMMBXZhaGlkMB4XDTI0MDUxNDEzMjEz
MVoXDTI1MDUxNDEzMjEzMVowHTELMAkGA1UEBhMCRkkxDjAMBgNVBAMMBXZhaGlk
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA8sHwVGIM6+UbxzqEK3Er
kJTmy0B7K7GId311GWUxiOXZNYzBku18Lr83VU+S/BebcYG8ehki5+clSTVRZ3K3
7893RUswRGf41Kyt2ZG+kq2s9RcN9FIy+4wOWb0TdHEjbrzpcT+IjkH8OpKyuQDw
/SqcNqTdkHwpZePEJMnM/EOmZvkaRH0qyKPua7BEdvI4q53y0ehGwmkSCdRGZV/w
Y4X/Scti5mHIzi12Tm09coCs7pFtwiQyELWwI89bem8qiHvQjMYPjt92xRap7IpY
sZlw5E+CZzJFE9HZG5oN8Diy0SlHcr+hFZD9ExOD6PowHI0Vuq4twA7Ad3B7u1SZ
uQIDAQABo2kwZzAfBgNVHSMEGDAWgBR+EohjvQUb9KsWxIWgLdFR8v/HoTAJBgNV
HRMEAjAAMBoGA1UdEQQTMBGCCWxvY2FsaG9zdIcEfwAAATAdBgNVHQ4EFgQUGrcs
/+p6jkHr/+ahxKWlqetgOpkwDQYJKoZIhvcNAQELBQADggEBABGzp6eeHf85bQNl
UvVAKh8vosrIsN5oFMjnTEMAJQBCoFzWFeRF70kEs2tVBG3A7NpbSs7va4fFb2gC
oplsP8NwZ8x7xGoKXmdb+3U9Toun5xkld8bUePNu4X8njQ8JH+LJ19Up3t5S/Ilm
+ZMbqQD5IMbSndqJBSGtmaoF5ijW1VA069UmMKUZdoiTwN51NuoFEqdqHfROhXhM
jo2qd4OgilcqJbaLX+A1WNuM0J/Jq1psX4xHjOnKDBiW376q7R8d9l2iv/sRs4tb
UdYdltMX2sG1EHGtNaSUZD9QK7VFrQ/A//js/75sKkyHDDyW6Ca8ZDIvweilPZFH
x5GYJig=
-----END CERTIFICATE-----" > $PGDATA/cert.pem
echo "-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDywfBUYgzr5RvH
OoQrcSuQlObLQHsrsYh3fXUZZTGI5dk1jMGS7XwuvzdVT5L8F5txgbx6GSLn5yVJ
NVFncrfvz3dFSzBEZ/jUrK3Zkb6Sraz1Fw30UjL7jA5ZvRN0cSNuvOlxP4iOQfw6
krK5APD9Kpw2pN2QfCll48Qkycz8Q6Zm+RpEfSrIo+5rsER28jirnfLR6EbCaRIJ
1EZlX/Bjhf9Jy2LmYcjOLXZObT1ygKzukW3CJDIQtbAjz1t6byqIe9CMxg+O33bF
FqnsilixmXDkT4JnMkUT0dkbmg3wOLLRKUdyv6EVkP0TE4Po+jAcjRW6ri3ADsB3
cHu7VJm5AgMBAAECggEARBVxfnEbd6ODlW5LeFWepsekLRgSE3CQuhaFG5C+gksY
jsTB25/ghsnZToNpUWubjIua3VGkcQ7qbaxW/uD1RnxU0qniSSUx7A/cGFuga8nq
6rhDESVmqBchRTjatnsuuVWhUUJE3cUS5SiUmH9zl0V2l3rIq0evYqStM7YnWA5j
TPcfTPD3BB24LmF6rCwSfYDZLhqtnI7EYaSjVOianiRDqVwtdjdIRqmAVgmG2itg
HquMK2eEpjNz9GbMOgw9qNW+oVR4VCatOPSHvDmOTWgBwO8elQsF0/YNwVrJN0MF
/XEFBoUCV6aXplRslOsOXI7VxbAaafl4C+MrLH7hIwKBgQD5sprhCCvmoA68wfg2
sJ0AeJKHNSmKxES7RlqUT2an4gKF5SLFdUlR6dwY3Tsij9fOhNfQeMMxz9vlt9Fx
FvAP8FPfIyQmmo7/M30zkKMeAOKiDSE0p/6IqpsGk/ECXRJ41X4OGTaL+2Pssrtl
U+el424wWxExAoJQRVJ/hUI3WwKBgQD44n217GOYiDNqqwakBNEK2ztn8y7X2+by
LaA4ZeDjaFOn47JGw3mhwWWffobLaR2Q2voGmG419LS9luLPbvzFhbP5QMDCArHY
VljZPiuX7/2itgxjpy6gU2ekrk1tWOnxhjAMBzNmh2fetDPWuVhwjz9baxPaSfaf
oQAWm+zTewKBgDGp54o4oNq3HRdIEUF3cVLFqIdB+KhED1OcU6nJ/SYJGu1cvMS/
ZjznocJERl3CdG78Fxy82D4RFLClFgBDSq4w482u5KLU/PofWJin/PmbvXfz2pXp
kAPIwxrU1AvfTSxBclgFhcbj0mUiy4kE3j8tdB4kDtBLqnWixBze+WOfAoGAPR9q
niYa45f3gKfV7qwcJp1mvoWzqGGiGzHnWlJy44Z4nQ/HdaeGFJqpeX0aX5RGJZAR
vVLsJiYdyT3oH+dy/pNyerFTZZJB2Q6DrX6eOCdBVBd/fW3OfqNdHc2MyGEAu0co
P5v5HKH+eWwqGv7T4Hjdp3bpnj9x6QwiOGs8w0cCgYEAllUcbP3C/ny2+wb1zE2Y
NoDhvas2dzuv/w3fb7xWxJCja+cjWuedvyn88g3n7d3ZwJoY6MbcNG42xdcDbFef
DfFDNISAIHpOuWdc9wJIXFuTZpCUGDTm3/qsl8ddjSnF3GLkj2nrbjdbnXX+EkKR
fKjjEhrpWlFz+k/9DZecURI=
-----END PRIVATE KEY-----" > $PGDATA/key.pem
```

OK, now it is time to instruct [PostgreSQL] to make use of these certificates.

```bash
chmod 0600 $PGDATA/key.pem
cat >> "$PGDATA/postgresql.conf" <<-EOF
ssl = on
ssl_ca_file = 'root-ca.crt'
ssl_cert_file = 'cert.pem'
ssl_key_file = 'key.pem'
EOF
```

That is it! That is all you need to establish encrypted connections.

Since this script will be executed only once during start-up, we will use it to add the database user and its associated credentials. Additionally, the table that stores the readings from the DHT22 sensor will also be created.

```bash
cat > "$PGDATA/pg_hba.conf" <<-EOF
host    all esp32   0.0.0.0/0   scram-sha-256
host    all esp32       ::0/0   scram-sha-256
EOF

psql -v ON_ERROR_STOP=1 --username $POSTGRES_USER <<-EOF
  SET password_encryption TO 'scram-sha-256';
  CREATE ROLE esp32 PASSWORD 'esp32' LOGIN;
  GRANT ALL ON DATABASE esp32 TO esp32;
  ALTER DATABASE esp32 OWNER TO esp32;
  \c esp32 esp32
  CREATE TABLE sensor (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    humidity FLOAT4 NOT NULL,
    temperature FLOAT4 NOT NULL
  );
EOF
```

SCRAM-SHA-256 is a much more secure authentication method if compared with md5 because the actual password is not transmitting over the network. It works through a challenge-response mechanism where the client and server exchange password-related values created by cryptographic algorithms.

## Coding

The DHT22 sensor sends the `humidity` and `temperature` values to the ESP32 board, after that, we retrieve these values with the help of the official ESP32 crates and then everything is finally securely pushed to the remote [PostgreSQL] instance through the interacting of the [WTX] client.

It is recommended that you follow this section with the code available in the repository (<https://github.com/c410-f3r/blog-posts>).

<figure class="image">
  <img src="/thoughts/securely-sending-dht22-sensor-data-from-an-esp32-board-to-postgresql/flow.jpg" alt="Flow">
</figure>

Personally I am not proud but `unwrap()` was shamelessly used to accelerate development. However, you can create your own `Error` enum to centralize all the other third-party error types.

#### Initialization

It is necessary to first configure some parameters that will be used across the entire program execution cycle.

```rust
// PostgreSQL URI like `postgres://esp32:esp32@127.0.0.1:5432/esp32?channel_binding=disable`
let uri_str = env!("URI");
// WiFi password
let wifi_pw = env!("WIFI_PW");
// WiFi identifier
let wifi_ssid = env!("WIFI_SSID");

// Halts execution for certain durations
let delay = Delay::new();
// For example, GPIO, timers, etc...
let peripherals = esp_hal::init(esp_hal::Config::default());
// Random number generator provided by the board
let rng = Rng::new(peripherals.RNG);
// will be discussed in the next section
let (rand_seed, stack_seed, xorshift64_seed) = seeds(rng);

// Reserves a portion of the memory to allow heap allocations
esp_alloc::heap_allocator!(64 * 1024);
// Initializes embassy
esp_hal_embassy::init(TimerGroup::new(peripherals.TIMG0).timer0);

/// TCP buffer used to receive data
let mut rx_buffer_plain = [0; 2048];
/// TLS buffer used to receive data
let mut rx_buffer_tls = [0; 8192];
/// TCP buffer used to send data
let mut tx_buffer_plain = [0; 2048];
/// TLS buffer used to send data
let mut tx_buffer_tls = [0; 8192];
```

Not that complicated, right? Just a couple of static variables defined at compile-time alongside some mandatory elements.

What is complicated is the fact that [Embassy], [Embedded-TLS] and [WTX] need different sources of seeds to generate random numbers. There are many ways to accomplish that and I will use the most straightforward method.

```rust
fn seeds(mut rng: Rng) -> ([u8; 32], u64, u64) {
  let rand_seed = {
    let [_0, _1, _2, _3] = rng.random().to_ne_bytes();
    let [_4, _5, _6, _7] = rng.random().to_ne_bytes();
    let [_8, _9, _10, _11] = rng.random().to_ne_bytes();
    let [_12, _13, _14, _15] = rng.random().to_ne_bytes();
    let [_16, _17, _18, _19] = rng.random().to_ne_bytes();
    let [_20, _21, _22, _23] = rng.random().to_ne_bytes();
    let [_24, _25, _26, _27] = rng.random().to_ne_bytes();
    let [_28, _29, _30, _31] = rng.random().to_ne_bytes();
    [
      _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18, _19,
      _20, _21, _22, _23, _24, _25, _26, _27, _28, _29, _30, _31,
    ]
  };
  let stack_seed = {
    let [_0, _1, _2, _3] = rng.random().to_ne_bytes();
    let [_4, _5, _6, _7] = rng.random().to_ne_bytes();
    u64::from_ne_bytes([_0, _1, _2, _3, _4, _5, _6, _7])
  };
  let xorshift64_seed = {
    let [_0, _1, _2, _3] = rng.random().to_ne_bytes();
    let [_4, _5, _6, _7] = rng.random().to_ne_bytes();
    u64::from_ne_bytes([_0, _1, _2, _3, _4, _5, _6, _7])
  };
  (rand_seed, stack_seed, xorshift64_seed)
}
```

The seeds are manually constructed using the RNG generator provided by the board, which is a bit laborious but does the job.

In regards to the array buffers, you can set any desired length, just be careful to not extrapolate the memory of your device.

#### WiFi device

The next step is to connect to the WiFi network with an IP using `esp_wifi`.

Please note that dropped connections are intentionally not handled because they are out of scope. If necessary, you will need to implement your own reconnection strategy.

```rust
async fn wifi_device(
  delay: Delay,
  pw: &str,
  radio_clk: RADIO_CLK,
  rng: Rng,
  ssid: &str,
  timg1: TIMG1,
  wifi: WIFI,
) -> WifiDevice {
  let timer0 = TimerGroup::new(timg1).timer0;
  // Initializes WiFi instance
  let init = esp_wifi::init(EspWifiInitFor::Wifi, timer0, rng, radio_clk).unwrap();
  let config = wifi::ClientConfiguration {
    // Uses AES
    auth_method: AuthMethod::WPA2Personal,
    // MAC address
    bssid: None,
    // No Channel
    channel: None,
    // Password retrieved from the environment variable
    password: pw.try_into().unwrap(),
    // Identifier retrieved from the environment variable
    ssid: ssid.try_into().unwrap(),
  };
  let (rslt, mut controller) = wifi::new_with_config::<WifiStaDevice>(&init, wifi, config).unwrap();
  // Starts the WiFi controller.
  controller.start().await.unwrap();
  // Waits 1 second
  delay.delay(1000.millis());
  // Connects the WiFi controller to a network
  controller.connect().await.unwrap();
  rslt
}
```

After the successful establishment of the WiFi connection, [Embassy] (embassy-net) steps-in to request an IP address managed by DHCP.

```rust
async fn wifi_device_configuration(
  spawner: Spawner,
  stack_seed: u64,
  wifi_device: WifiDevice,
) -> &'static Stack<WifiDevice> {
  // Network stack handle
  let wifi_device_stack = &*STACK.init(Stack::new(
    wifi_device,
    // DHCP configuration
    embassy_net::Config::dhcpv4({
      let mut config = DhcpConfig::default();
      config.hostname = Some("esp32-postgres".try_into().unwrap());
      config
    }),
    RESOURCES.init(StackResources::<4>::new()),
    stack_seed,
  ));
  // Background task that handles WiFi packets
  spawner.spawn(wifi_runner(wifi_device_stack)).unwrap();
  // Waits for the network stack to obtain a valid IP configuration.
  wifi_device_stack.wait_config_up().await;
  // Gets the current IPv4 configuration.
  wifi_device_stack.config_v4().unwrap();
  wifi_device_stack
}

#[embassy_executor::task]
async fn wifi_runner(wifi_device: &'static Stack<WifiDevice>) -> ! {
  wifi_device.run().await
}
```

#### PostgreSQL Client (WTX)

[WTX] is not hard-coded into a particular IO technology so we need to explicitly pass the [Embassy] TCP socket as well as the [Embedded-TLS] connector.

Thankfully the `rustls_pemfile` crate recently received `no_std` support to allow the parsing of the certificate authority (CA) file we generated in the setting-up block. Otherwise such a thing would probably have to be done manually.

```rust
async fn executor<'plain, 'tls, 'wifi>(
  rand_seed: [u8; 32],
  rx_buffer_plain: &'plain mut [u8; 2048],
  rx_buffer_tls: &'tls mut [u8; 8192],
  tx_buffer_plain: &'plain mut [u8; 2048],
  tx_buffer_tls: &'tls mut [u8; 8192],
  uri_str: &str,
  xorshift64_seed: u64,
  wifi_device_stack: &'wifi Stack<WifiDevice>,
) -> Executor<wtx::Error, ExecutorBuffer, TlsConnection<'tls, TcpSocket<'plain>, Aes128GcmSha256>>
where
  'plain: 'tls,
  'wifi: 'plain,
{
  // Parses CA file
  let Some((Item::X509Certificate(ca), _)) = rustls_pemfile::read_one_from_slice(CA).unwrap()
  else {
    panic!();
  };
  // Parsed URI
  let uri = Uri::new(uri_str);
  // TCP socket instance
  let mut socket = TcpSocket::new(wifi_device_stack, rx_buffer_plain, tx_buffer_plain);
  // Workaround due to the lack of `core::net::Ipv4Address` support within embassy
  let ipv4_addr: Ipv4Addr = uri.hostname().parse().unwrap();
  let [a, b, c, d] = ipv4_addr.octets();
  // Opens a TCP session
  socket.connect((Ipv4Address::new(a, b, c, d), uri.port().unwrap())).await.unwrap();
  // Xorshift64 is a simple random number generator used by WTX
  let mut xorshift64 = Xorshift64::from(xorshift64_seed);
  Executor::<wtx::Error, _, _>::connect_encrypted(
    // PostgreSQL configuration retrieved from the URI
    &wtx::database::client::postgres::Config::from_uri(&uri).unwrap(),
    // Specific internal buffer that can be re-utilized across instances
    ExecutorBuffer::new(usize::MAX, &mut xorshift64),
    // Used to initialize hash maps
    &mut xorshift64,
    // Allows the initial exchange of unencrypted data.
    socket,
    // After the initial handshake, WTX tries a TLS session
    |stream| async {
      // Pushes the certificate authority that was constructed using RSA algorithms
      let config = TlsConfig::new().with_ca(Certificate::X509(ca.as_ref())).enable_rsa_signatures();
      // TLS instance
      let mut tls = TlsConnection::new(stream, rx_buffer_tls, tx_buffer_tls);
      // Starts the TLS handshake with the `Aes128GcmSha256` schema.
      tls
        .open(TlsContext::new(
          &config,
          UnsecureProvider::new::<Aes128GcmSha256>(StdRng::from_seed(rand_seed)),
        ))
        .await
        .unwrap();
      // Returns the successful TLS instance
      Ok(tls)
    },
  )
  .await
  .unwrap()
}
```

[PostgreSQL] defines a set of interaction protocols and for some reason is necessary to first send the `80877103` number in an unencrypted TCP connection, thus the raison-d'être of the Executor's closure.

#### Sending DHT22 data in a loop

This is the final step, congratulations if you made this far.

The DHT22 sensor defines a sequence of high, low and waiting operations specified in the datasheet to read data. Luckily, you and I don't have to code and manually test such methods thanks to the [dht-embedded-rs] crate.

```rust
// Initializes the sensor telling that communication should be performed through the GPIO pin
// number 32. Don't forget to change this value if you are using a different pin!
fn dht22(delay: Delay, gpio: GPIO, io_mux: IO_MUX) -> Dht22<OutputOpenDrain<'static>, Delay> {
  Dht22::new(OutputOpenDrain::new(Io::new(gpio, io_mux).pins.gpio32, Level::High, Pull::None), delay)
}
```

Since the DHT22 sensor requires a 2-second interval between readings, we finalize our code with an infinite loop where in each iteration the program waits for the required interval, reads data, and then stores the humidity and temperature values in the PostgreSQL database.

```rust
loop {
  delay.delay(2000.millis());
  let sensor_reading = dht22.read().unwrap();
  let _ = executor
    .execute_with_stmt(
      "INSERT INTO sensor (humidity, temperature) VALUES ($1, $2)",
      (sensor_reading.humidity, sensor_reading.temperature),
    )
    .await
    .unwrap();
}
```

Here goes a script for your convenience. Don't forget to insert the credentials of the WiFi.

```bash
#!/usr/bin/env bash

export ESP_LOG="INFO"
export URI="postgres://esp32:esp32@127.0.0.1:5432/esp32?channel_binding=disable"
export WIFI_PW=""
export WIFI_SSID=""

podman rm -f esp32
podman run \
    -d \
    --name esp32 \
    -e POSTGRES_DB=esp32 \
    -e POSTGRES_PASSWORD=esp32 \
    -p 5432:5432 \
    -v .scripts/postgres.sh:/docker-entrypoint-initdb.d/setup.sh \
    docker.io/library/postgres:17

cargo run --release
```

## Final words

<figure class="image">
  <img src="/thoughts/securely-sending-dht22-sensor-data-from-an-esp32-board-to-postgresql/esp32.jpg" alt="ESP32">
</figure>

That is it! You just established a remote [PostgreSQL] connection via WiFi using `SCRAM-SHA-256` without channel binding over a TLS 1.3 session encrypted with the `Aes128GcmSha256` cipher schema.

Although not as flexible, you no longer need to set-up an intermediary HTTP server on a x86-64 platform to proxy data storage.

To make good use of the camera that came with my development board, I will demonstrate (with enough time and motivation) how to implement real-time image streaming over `gRPC` in an upcoming post.

[dht-embedded-rs]: https://github.com/kelnos/dht-embedded-rs
[Embassy]: https://embassy.dev/
[Embedded-TLS]: https://github.com/drogue-iot/embedded-tls
[PostgreSQL]: https://www.postgresql.org
[WTX]: https://github.com/c410-f3r/wtx