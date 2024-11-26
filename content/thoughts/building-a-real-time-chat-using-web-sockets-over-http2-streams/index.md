+++
date = 2024-11-18
description = "In this post we are going to build a backend using WTX and a frontend with several other tools to enable the real-time communication between multiple web clients."
title = "Building a real-time chat using WebSockets over HTTP/2 streams"

[taxonomies]
tags = ["web", "websocket", "http", "rust", "svelte", "deno", "wtx"]

[extra]
image = "/thoughts/building-a-real-time-chat-using-web-sockets-over-http2-streams/intro.jpg"
+++

<figure class="image is-16by9">
  <iframe
    allowfullscreen
    class="has-ratio"
    frameborder="0"
    height="360"
    src="https://files.catbox.moe/xvweao.webm"
    width="640"
  ></iframe>
</figure>

In this post we are going to build a backend powered by [WTX] and a frontend with [SvelteKit] and several other tools to enable the real-time communication between multiple web clients.

All code is available at <https://github.com/c410-f3r/blog-posts> in the `live-chat` directory.

## Out of scope

Before we dive in, it is important to clarify a couple of things that are out of scope.

- **Production-grade app**: The intention is to mainly demonstrate one of the many capabilities of [WTX], all techniques presented here are not optimized for production environments that require the robust handling of numerous requests. However, you can extract as many information as needed to create your own scalable solution.

- **Decentralized chat**: We are dealing with a classic client-server architecture so if you are looking to build a decentralized chat, take a look at `WebRTC`. For example, in our application a client `C1` must send a message `M` to server `S` to broadcast the same message `M` to client `C2` and vice-versa.

## What is WTX?

[WTX] is, among other things, a [RFC6455](https://datatracker.ietf.org/doc/html/rfc6455), [RFC7541](https://datatracker.ietf.org/doc/html/rfc7541), [RFC7692](https://datatracker.ietf.org/doc/html/rfc7692), [RFC8441](https://datatracker.ietf.org/doc/html/rfc8441) and [RFC9113](https://datatracker.ietf.org/doc/html/rfc9113) implementation written in Rust intended to allow the development of web applications through a built-in server framework, a built-in `PostgreSQL` connector, a built-in `WebSocket` handler and a built-in `gRPC` manager. There is also a built-in API client framework that facilitates the maintainability of large endpoints.

Performance is top-class, here goes a list of related benchmarks: <https://c410-f3r.github.io/wtx-bench/>, <https://github.com/diesel-rs/metrics>, <https://i.imgur.com/Iv2WzJV.jpg>, <https://github.com/LesnyRumcajs/grpc_bench/discussions/475>, <https://i.imgur.com/vf2tYxY.jpg>.

Feel free to point out any misunderstandings, suggestions, or misconfigurations regarding the benchmarks. If you are aware of other benchmark suites, please let me know.

## Deno / Svelte / SvelteKit / Tailwind CSS

These are basically the technologies used in the frontend, such a combination offers a powerful, efficient and an up-to-date web development stack. [Deno] provides a modern runtime with built-in TypeScript support, [Svelte] compiles components to optimized JavaScript code, [SvelteKit] (official framework) presents tools like routing or server-side rendering (SSR) and [Tailwind CSS] streamlines UI development with useful utility classes.

The versions used are: `Deno 2`, `Svelte 5`, `SvelteKit 2`, and `Tailwind CSS 4.0.0-alpha.34`. Despite still being in alpha, the upcoming version of Tailwind CSS introduces significant improvements, making it worth a try.

## WebSockets over HTTP/2 streams

HTTP/2 is the second major version of the Hypertext Transfer Protocol, introduced in 2015 to improve web performance in ***concurrent scenarios***, it addresses some limitations of HTTP/1.1 maintaining backwards compatibility.

While HTTP/2 inherently supports full-duplex communication, web browsers typically don't expose this functionality directly to developers and that is why WebSocket tunneling over HTTP/2 is important.

1. Servers can efficiently handle multiple concurrent streams within a single TCP connection
2. Client applications can continue using existing WebSocket APIs without modification

Specified in <https://datatracker.ietf.org/doc/html/rfc8441>, very few projects support such a feature.

## Futures

Rust `Futures` represent an abstraction for asynchronous programming, enabling developers to write non-blocking code that can perform multiple operations concurrently.

We will be making extensive use of manual `Futures` and related structures to synchronize clients in our system, if you are not already familiar with the topic, it probably worth to take a look at <https://rust-lang.github.io/async-book/> or <https://book.async.rs/concepts/futures>.

## Architecture

There are two phases. In the handshake phase `Client 1` connects to the server and awaits for someone to show-up. Once `Client 2` connects, the server matches both parties and then signals `Client 1` to awake from its idle state. A new chat has been established.

<figure class="image">
  <img src="/thoughts/building-a-real-time-chat-using-web-sockets-over-http2-streams/handshake.jpg" alt="Handshake">
  <figcaption>High-level handshake procedure</figcaption>
</figure>

In the connection phase there are two tasks racing for completion for each client, one receives local messages and the other receives remote messages. When the disconnect button is activated by any user both sessions are dropped.

<figure class="image">
  <img src="/thoughts/building-a-real-time-chat-using-web-sockets-over-http2-streams/connection.jpg" alt="Connection">
  <figcaption>High-level connection procedure</figcaption>
</figure>

Bare in mind that these illustrations are just a tool to help understanding the architecture. They are not sequence diagrams nor the events happen in sequential order.

## Frontend

Deno 2 is a significant update with its native support for npm packages and developers also benefit from built-in tooling, including a linter and formatter. Unfortunately, Svelte support is still under development (<https://github.com/denoland/deno/issues/17248>) so let's just follow the standard SvelteKit installation procedure using the default parameters.

```bash
dpx sv create frontend
cd frontend
deno install
deno run dev
```

UI is quite simple, a top-level text indicates what the user should do and a box where all the messages will be placed is centered in the middle of the screen. As stated before, Tailwind CSS is responsible for the styling so checkout <https://tailwindcss.com> if you are not aware of the classes used in the HTML blocks.

```html
<div class="bg-gray-100 flex flex-col h-screen w-screen">
	<div class="text-center text-gray-500 text-sm py-2">
		<h5 class="font-bold text-blue-900">Real-time chat! Click on connection button and wait for someone else to join.</h5>
	</div>
	<div
		class="bg-white border border-gray-300 flex flex-col grow max-w-4xl mx-auto shadow-lg w-full"
	>
	</div>
</div>
```

`Svelte 5` has a cool feature called `snippet` that allows the creation of reusable chunks of markup inside components, which avoids the writing of duplicated code. In my opinion, such a feature also makes the code more maintainable.

```html
<div class="h-full overflow-y-auto p-4 space-y-2">
  {#each chatHistory as chat}
    {#if chat.type === 'received'}
      {@render receivedMessage(chat.text)}
    {:else}
      {@render sentMessage(chat.text)}
    {/if}
  {/each}
</div>
<div class="bg-gray-50 border-t border-gray-300 p-4">
  <div class="flex flex-row gap-4 hidden items-center">
    {@render connectionButton()}
    {@render messageField()}
    {@render sendButton()}
  </div>
</div>
```

The majority of components and buttons defined in these snippets are controlled by variables in the script section using Svelte's reactive state.

```html
{#snippet connectionButton()}
	<button
		class="{connectionProps.connectionButtonBg} cursor-pointer px-4 py-2 rounded-lg text-white transition sm:w-auto w-full"
		onclick={connection}>{connectionProps.connectionButtonLabel}</button
	>
{/snippet}

{#snippet messageField()}
	<input
		class="border border-gray-300 disabled:cursor-not-allowed grow p-2 rounded-lg w-full"
		disabled={connectionProps.areElementsDisabled}
		onkeydown={(e) => {
			if (e.key === 'Enter') {
				send();
			}
		}}
		placeholder={connectionProps.messageFieldPlaceholder}
		type="text"
		bind:value={messageFieldValue}
	/>
{/snippet}

{#snippet receivedMessage(message: string)}
	<div class="flex justify-start">
		<div class="bg-gray-200 max-w-xs px-4 py-2 rounded-lg text-black">
			{message}
		</div>
	</div>
{/snippet}

{#snippet sendButton()}
	<button
		class="bg-blue-500 enabled:hover:bg-blue-600 disabled:cursor-not-allowed cursor-pointer disabled:opacity-50 px-4 py-2 rounded-lg text-white transition sm:w-auto w-full"
		disabled={connectionProps.areElementsDisabled}
		onclick={send}>Send</button
	>
{/snippet}

{#snippet sentMessage(message: string)}
	<div class="flex justify-end">
		<div class="bg-blue-500 max-w-xs px-4 py-2 rounded-lg text-white">
			{message}
		</div>
	</div>
{/snippet}
```

When an user clicks on the 'Connect' button its background color changes to blue signalling that it is necessary to wait for someone to join. Once a match occurs the server sends an "OK" response and the same button changes to a disconnection device while the remaining elements are activated for interaction.

A sent message creates a new entry of type `sent` in the reactive `chatHistory` array, consequently, the UI is updated to reflect what was recently submitted. Similar procedure happens when a message is received in the WebSocket connection.

When clicked, the disconnection button closes the WebSocket connection and becomes again a connection button.

```html
<script lang="ts">
	interface ConnectionProps {
		areElementsDisabled: boolean;
		connectionButtonBg: string;
		connectionButtonLabel: string;
		messageFieldPlaceholder: string;
	}

	const connect: ConnectionProps = {
		areElementsDisabled: true,
		connectionButtonBg: 'bg-green-500 hover:bg-green-600',
		connectionButtonLabel: 'Connect',
		messageFieldPlaceholder: "Click on 'Connect' to start a conversation"
	};
	const disconect: ConnectionProps = {
		areElementsDisabled: false,
		connectionButtonBg: 'bg-red-500 hover:bg-red-600',
		connectionButtonLabel: 'Disconnect',
		messageFieldPlaceholder: 'Connected! Type your message'
	};
	const waiting: ConnectionProps = {
		areElementsDisabled: true,
		connectionButtonBg: 'bg-blue-700 hover:bg-blue-800',
		connectionButtonLabel: 'Waiting',
		messageFieldPlaceholder: 'Waiting for someone to show up...'
	};

	let chatHistory: { type: 'received' | 'sent'; text: string }[] = $state([]);
	let connectionProps: ConnectionProps = $state(connect);
	let messageFieldValue = $state('');
	let ws: WebSocket | undefined = undefined;

	const connection = () => {
		if (ws === undefined) {
			ws = new WebSocket('wss://localhost:9000/chat');
			ws.addEventListener('close', () => {
				connectionProps = connect;
				ws = undefined;
			});
			ws.addEventListener('message', (event) => {
				if (event.data == 'OK') {
					connectionProps = disconect;
					return;
				}
				chatHistory.push({ type: 'received', text: event.data });
			});
			ws.addEventListener('open', () => {
				connectionProps = waiting;
			});
		} else {
			ws.close();
			connectionProps = connect;
		}
	};

	const send = () => {
		if (ws === undefined || messageFieldValue === '') {
			return;
		}
		ws.send(messageFieldValue);
		chatHistory.push({ type: 'sent', text: messageFieldValue });
		messageFieldValue = '';
	};
</script>
```

Just a quick review, the WebSocket connection is initialized when the user clicks in the "Connect" button. The button's appearance changes as the connection state evolves. Messages are sent and received via WebSocket and displayed in the chat box using Svelte's reactivity. When the WebSocket connection closes, the UI reverts to its default state.

And that is it on the front-end side. Type `deno run dev` to see a preview without backend interactions.

## Backend

Let's start creating the `Cargo.toml` definitions in the `backend` directory.

```toml
[dependencies]
tokio = { default-features = false, features = ["macros", "rt-multi-thread"], version = "1.0" }
tokio-rustls = { default-features = false, features = ["ring"], version = "0.26" }
wtx = { default-features = false, features = ["http-server-framework", "nightly", "tokio", "tokio-rustls", "web-socket"], version = "0.24" }

[package]
edition = "2021"
name = "backend"
version = "0.1.0"
```

[WTX] does not include any features by default so we have to specify the desirable functionality.

* `http-server-framework`: A high-level HTTP server that offers CORS, routing, streams and sessions.
* `nightly`: Necessary because of the [`RTN`](https://github.com/rust-lang/rust/issues/109417) feature.
* `tokio`: A fast runtime. It is also possible to specify other executors.
* `tokio-rustls`: Ensures encrypted connections using `Rustls`
* `web-socket`: Full-duplex communication protocol.

The connection between the client and the backend is encrypted, as such, it is necessary to use certificates.

Production apps use certificates issued by official CA entities like `Let's Encrypt` but since we are in a testing environment, self-made elements are OK. Just don't forget to add the root CA in the browser's store when testing.

```bash
CERTS_DIR="/some/directory/of/your/choice"
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

The server is made of a single `/chat` endpoint, an enabled `enable_connect_protocol` flag, a RNG, the newly created certificates and a maximum header size of 128KiB. More endpoints can be added and more parameters can be modified but the code is purposely small to not further complicate things.

`UserPool` is a lazily evaluated static structure synchronized by a mutex responsible for matching initial clients as well as delivering messages of already established chats.

```rust
static CERT: &[u8] = include_bytes!("/some/directory/of/your/choice/cert.pem");
static KEY: &[u8] = include_bytes!("/some/directory/of/your/choice/key.pem");
static USER_POOL: LazyLock<Mutex<UserPool>> = LazyLock::new(|| {
  Mutex::const_new(UserPool { matching: Deque::new(), messages: HashMap::new() })
});

#[tokio::main]
async fn main() -> wtx::Result<()> {
  let router = Router::paths(wtx::paths!(("/chat", web_socket(chat)),))?;
  ServerFrameworkBuilder::new(router)
    .enable_connect_protocol(true)
    .max_hpack_len((128 * 1024, 128 * 1024))
    .without_aux()
    .tokio_rustls(
      (CERT, KEY),
      "0.0.0.0:9000",
      Xorshift64::from(simple_seed()),
      |error| eprintln!("{error:?}"),
      |_| Ok(()),
    )
    .await
}

#[derive(Debug)]
struct UserPool {
  matching: Deque<(u128, Waker)>,
  messages: HashMap<u128, (u128, String, Waker)>,
}

async fn chat(manual_stream: ManualStream<(), ServerStream, ()>) -> wtx::Result<()> {
  let wos = WebSocketOverStream::new(
    &Headers::new(),
    false,
    Xorshift64::from(simple_seed()),
    manual_stream.stream,
  )
  .await?;
  ws::exchange_messages(wos).await?;
  Ok(())
}
```

When `Client 1` connects, a new `matching` entry is added at the end of the queue and the task enters into a idle state. When `Client 2` connects, the previous `matching` entry is removed and a new chat is established through the insertion of each client ID into the `messages` collection. A new chat also triggers the awakening of the matching client (`Client 1`) finally returning the remote ID.

Remember when you heard that `Futures` are implemented as state machines? In our system the task is repeatedly called in different semantic situations until it returns `Poll::Ready`.

```rust
async fn handshake(
  local_id: u128,
  wos: &mut WebSocketOverStream<ServerStream>,
) -> wtx::Result<u128> {
  let mut user_pin = pin!(USER_POOL.lock());
  let remote_id = poll_fn(|cx| {
    let mut user_guard = ready!(user_pin.as_mut().poll(cx));
    user_pin.set(USER_POOL.lock());
    if let Some((remote_id, _, _)) = user_guard.messages.get(&local_id) {
      return Poll::Ready(Ok(*remote_id));
    }
    if let Some((remote_id, remote_waker)) = user_guard.matching.pop_front() {
      drop(user_guard.messages.insert(local_id, (remote_id, String::new(), NOOP_WAKER.clone())));
      drop(user_guard.messages.insert(remote_id, (local_id, String::new(), NOOP_WAKER.clone())));
      remote_waker.wake();
      Poll::Ready(wtx::Result::Ok(remote_id))
    } else {
      user_guard.matching.push_back((local_id, cx.waker().clone()))?;
      Poll::Pending
    }
  })
  .await?;
  wos.write_frame(&mut Frame::new_fin(OpCode::Text, *b"OK")).await?;
  Ok(remote_id)
}
```

After the initial handshake we have two futures racing for completion in a loop, one is receiving messages from the local client and the other is receiving messages from the remote client. Messages received from the remote client via `USER_POOL` are sent to the local client as WebSocket DATA frames and messages received from the local client are stored in the `USER_POOL` structure. The associated `USER_POOL` future is awakened, closing the circle.

As far as I can tell these futures have cancellation safety. If that is not the case, feel free to contact me for possible adjustments.

```rust
async fn connection(
  (local_id, remote_id): (u128, u128),
  wos: &mut WebSocketOverStream<ServerStream>,
) -> wtx::Result<()> {
  let mut buffer = Vector::new();
  loop {
    buffer.clear();
    let mut user_pin = pin!(USER_POOL.lock());
    let message_fut = poll_fn(|cx| {
      let mut user_guard = ready!(user_pin.as_mut().poll(cx));
      user_pin.set(USER_POOL.lock());
      let Some((_, message, waker)) = user_guard.messages.get_mut(&local_id) else {
        return Poll::Ready(Err(wtx::Error::ClosedConnection));
      };
      if message.is_empty() {
        waker.clone_from(cx.waker());
        return Poll::Pending;
      }
      Poll::Ready(wtx::Result::Ok(mem::take(message)))
    });
    tokio::select! {
      frame_rslt = wos.read_frame(&mut buffer) => {
        let frame = frame_rslt?;
        match frame.op_code() {
          OpCode::Text => {
            let Some(text) = frame.text_payload() else {
              return Err(wtx::web_socket::WebSocketError::UnexpectedFrame.into());
            };
            let mut user_guard = USER_POOL.lock().await;
            let Some((_, message, waker)) = user_guard.messages.get_mut(&remote_id) else {
              return Err(wtx::Error::ClosedConnection);
            };
            message.push_str(text);
            waker.wake_by_ref();
          }
          OpCode::Close => break,
          _ => {}
        }
      }
      message_rslt = message_fut => {
        wos.write_frame(&mut Frame::new_fin(OpCode::Text, message_rslt?.into_bytes())).await?;
      }
    }
  }
  Ok(())
}
```

`exchange_messages` is the final function that glues `handshake` and `connection`. A dropped connection by any party automatically removes any chat reference in the `messages` map.

```rust
pub(crate) async fn exchange_messages(
  mut wos: WebSocketOverStream<ServerStream>,
) -> wtx::Result<()> {
  let local_id = GenericTime::timestamp()?.as_nanos();
  let remote_id = handshake(local_id, &mut wos).await?;
  let rslt = connection((local_id, remote_id), &mut wos).await;
  wos.close().await?;
  let mut user_guard = USER_POOL.lock().await;
  drop(user_guard.messages.remove(&local_id));
  if let Some((_, _, waker)) = user_guard.messages.remove(&remote_id) {
    waker.wake();
  }
  drop(user_guard);
  rslt
}
```

It is time to visualize the final application. Type `cargo run` in the backend folder, open another terminal and type `deno run dev` in the frontend directory. If everything works well, you should be able to create fake interactions using two browser windows like in the attached video of this post. 

## Final words

<figure class="image">
  <img src="/thoughts/building-a-real-time-chat-using-web-sockets-over-http2-streams/example.png" alt="Handshake">
</figure>

While we have built a chat application, WebSocket over HTTP/2 streams is useful for many other scenarios when users are interacting with web browsers. For example, live stock prices, team document editing or video streaming.

Hopefully the steps described here gave you one or two hints about the directions that need to be taken to create real-time communications. Feel free to modify or expand the code to meet your expectations.

On an additional note, [WTX] has built-in support for cookie sessions if you are looking to add an authentication wall.

[Deno]: https://deno.com/
[Svelte]: https://svelte.dev/
[SvelteKit]: https://svelte.dev/docs/kit/introduction
[Tailwind CSS]: https://tailwindcss.com/
[WTX]: https://github.com/c410-f3r/wtx