+++
date = 2023-08-24
description = "Let's measure the performance of six different WebSocket projects."
title = "The fastest WebSocket implementation"

[taxonomies]
tags = ["rust", "websocket", "benchmark"]

[extra]
image = "/thoughts/the-fastest-websocket-implementation/intro.jpg"
+++

<figure class="image">
  <img src="/thoughts/the-fastest-websocket-implementation/intro.jpg" alt="Introduction">
  <figcaption>Adapted photo of William Warby on Unsplash.</figcaption>
</figure>

This post measures the performance of [wtx](https://github.com/c410-f3r/regular-crates/tree/main/wtx) and other projects to figure out which one is faster. If any metrics or procedures described here are flawed, feel free to point them.

## Metrics

Differently from autobahn, which is the standard automated test suite that verifies client and server implementations, there isn't an easy and comprehensive benchmark suite for the WebSocket Protocol (well at least I couldn't find any) so let's create one.

Enter [ws-bench](https://github.com/c410-f3r/regular-crates/tree/main/ws-bench)! Three parameters that result in reasonable combinations trying to replicate what could possibly happen in a production environment are applied to listening servers by the program.

||Low|Medium|High|
|---|---|---|---|
|Number of connections|1|128|256|
|Number of messages|1|64|128|
|Transfer memory (KiB)|1|64|128|

### Number of connections

Tells how well a server can handle multiple connections concurrently. For example, there are single-thread, concurrent single-thread or multi-thread implementations.

In some cases this metric is also influenced by the underlying mechanism responsible for scheduling the execution of workers/tasks.

### Number of messages

When a payload is very large, it is possible to send it using several sequential frames where each frame holds a portion of the original payload. This frame formed by different smaller frames is called here "message" and the number of "messages" can measure the implementation's ability of handling their encoding or decoding as well as the network latency (round trip time).

### Transfer memory

It is not rare to hear that the cost of a round trip is higher than the cost of allocating memory, which is generally true. Unfortunately, based on this concept some individuals prefer to indiscriminantly call the heap allocator without investigating whether such a thing might incur a negative performance impact.

Frames tend to be small but there are applications using WebSocket to transfer different types of real-time blobs. That said, let's investigate the impact of larger payload sizes. 

## Investigation

|Project|Language|Fork|Application|
|---|---|---|---|
|uWebSockets|C++|<a href="https://github.com/c410-f3r/uWebSockets">https://github.com/c410-f3r/uWebSockets</a>|examples/EchoServer.cpp|
|fastwebsockets|Rust|<a href="https://github.com/c410-f3r/fastwebsockets">https://github.com/c410-f3r/fastwebsockets</a>|examples/echo_server.rs|
|gorilla/websocket|Go|<a href="https://github.com/c410-f3r/websocket">https://github.com/c410-f3r/websocket</a>|examples/echo/server.go|
|tokio-tungstenite|Rust|<a href="https://github.com/c410-f3r/tokio-tungstenite">https://github.com/c410-f3r/tokio-tungstenite</a>|examples/echo-server.rs|
|websockets|Python|<a href="https://github.com/c410-f3r/regular-crates/blob/main/ws-bench/_websockets.py">https://github.com/c410-f3r/regular-crates/blob/main/ws-bench/_websockets.py</a>|_websockets.py|
|wtx|Rust|<a href="https://github.com/c410-f3r/regular-crates/tree/main/wtx">https://github.com/c410-f3r/regular-crates/tree/main/wtx</a>|examples/web_socket_echo_server_raw_tokio.rs|

In order to try to ensure some level of fairness, all six projects had their files modified to remove writes to `stdout`, impose optimized builds where applicable and remove SSL or compression configurations. 

The benchmark procedure is quite simple: servers listen to incoming requests on different ports, `ws-bench` binary is called with all uris and the resulting chart is generated. In fact, everything is declared in [this bash script](https://github.com/c410-f3r/regular-crates/blob/main/.scripts/ws-bench.sh).

<div style="overflow-x: scroll;">

|Chart|Connections|Messages|Memory|fastwebsockets|gorilla/websockets|tokio_tungstenite|uWebsockets|websockets|wtx_hyper|wtx-_raw_async_std|wtx_raw_tokio|
|---|---|---|---|---|---|---|---|---|---|---|---|
|<a href="/thoughts/the-fastest-websocket-implementation/low-mid-high.png">Chart</a>|<font color="#7facde">low</font>|<font color="#a6de95">mid</font>|<font color="#e7af4f">high</font>|104|273|102|88|232|64❗|67|65|
|<a href="/thoughts/the-fastest-websocket-implementation/low-high-low.png">Chart</a>|<font color="#7facde">low</font>|<font color="#e7af4f">high</font>|<font color="#7facde">low</font>|5759|5783|5784|5760|5728❗|5802|5764|5736|
|<a href="/thoughts/the-fastest-websocket-implementation/low-high-mid.png">Chart</a>|<font color="#7facde">low</font>|<font color="#e7af4f">high</font>|<font color="#a6de95">mid</font>|336|546|235|192|526|160|163|159❗|
|<a href="/thoughts/the-fastest-websocket-implementation/low-high-high.png">Chart</a>|<font color="#7facde">low</font>|<font color="#e7af4f">high</font>|<font color="#e7af4f">high</font>|331|960|360|325|725|250|282|249❗|
|<a href="/thoughts/the-fastest-websocket-implementation/mid-low-high.png">Chart</a>|<font color="#a6de95">mid</font>|<font color="#7facde">low</font>|<font color="#e7af4f">high</font>|18|22|18|15|31|14|12❗|13|
|<a href="/thoughts/the-fastest-websocket-implementation/mid-mid-high.png">Chart</a>|<font color="#a6de95">mid</font>|<font color="#a6de95">mid</font>|<font color="#e7af4f">high</font>|4503|5724|3959|4816|9754|3514|3474❗|3498|
|<a href="/thoughts/the-fastest-websocket-implementation/mid-high-low.png">Chart</a>|<font color="#a6de95">mid</font>|<font color="#e7af4f">high</font>|<font color="#7facde">low</font>|5684❗|5800|5721|5687|6681|5689|5764|5684❗|
|<a href="/thoughts/the-fastest-websocket-implementation/mid-high-mid.png">Chart</a>|<font color="#a6de95">mid</font>|<font color="#e7af4f">high</font>|<font color="#a6de95">mid</font>|11020|13735|8365|9072|19874|6937|6895❗|6933|
|<a href="/thoughts/the-fastest-websocket-implementation/mid-high-high.png">Chart</a>|<font color="#a6de95">mid</font>|<font color="#e7af4f">high</font>|<font color="#e7af4f">high</font>|19808|23178|15471|19821|38327|13759|13693❗|13749|
|<a href="/thoughts/the-fastest-websocket-implementation/high-low-low.png">Chart</a>|<font color="#e7af4f">high</font>|<font color="#7facde">low</font>|<font color="#7facde">low</font>|52|71|98|46|1053|52|41❗|88|
|<a href="/thoughts/the-fastest-websocket-implementation/high-low-mid.png">Chart</a>|<font color="#e7af4f">high</font>|<font color="#7facde">low</font>|<font color="#a6de95">mid</font>|84|86|74|51|1043|60|50|48❗|
|<a href="/thoughts/the-fastest-websocket-implementation/high-low-high.png">Chart</a>|<font color="#e7af4f">high</font>|<font color="#7facde">low</font>|<font color="#e7af4f">high</font>|124|82|78|57|1059|55|54❗|58|
|<a href="/thoughts/the-fastest-websocket-implementation/high-mid-low.png">Chart</a>|<font color="#e7af4f">high</font>|<font color="#a6de95">mid</font>|<font color="#7facde">low</font>|2987|3051|3027|2955|5071|2981|3000|2942❗|
|<a href="/thoughts/the-fastest-websocket-implementation/high-mid-mid.png">Chart</a>|<font color="#e7af4f">high</font>|<font color="#a6de95">mid</font>|<font color="#a6de95">mid</font>|20150|21475|14593|18931|41368|11172|10987❗|11268|
|<a href="/thoughts/the-fastest-websocket-implementation/high-mid-high.png">Chart</a>|<font color="#e7af4f">high</font>|<font color="#a6de95">mid</font>|<font color="#e7af4f">high</font>|41846|43514|20706|21779|41091|16118|15555|15524❗|
|<a href="/thoughts/the-fastest-websocket-implementation/high-high-low.png">Chart</a>|<font color="#e7af4f">high</font>|<font color="#e7af4f">high</font>|<font color="#7facde">low</font>|5828|5941|5830|5790|9400|5778❗|5877|5808|
|<a href="/thoughts/the-fastest-websocket-implementation/high-high-mid.png">Chart</a>|<font color="#e7af4f">high</font>|<font color="#e7af4f">high</font>|<font color="#a6de95">mid</font>|53756|55063|44829|47312|107758|36628|34333❗|37000|

</div>

Tested with a notebook composed by i5-1135G7, 256GB SSD and 32GB RAM. Combinations of `low` and `mid` were discarded for showing almost zero values in all instances.

`soketto` and `ws-tools` were initially tested but eventually abandoned at a later stage due to frequent shutdowns. I didn't dive into the root causes but they can return back once the underlying problems are fixed by the authors.

## Result

<figure class="image">
  <img src="/thoughts/the-fastest-websocket-implementation/mid-mid-high.png" alt="Introduction">
</figure>

`wtx` as a whole scored an average amount of 6350.31 ms, followed by `tokio-tungstenite` with 7602.94 ms, `uWebSockets` with 8393.94 ms, `fastwebsockets` with 10140.58 ms, `gorilla/websockets` with 10900.23 ms and finally `websockets` with 17042.41 ms.

`websockets` performed the worst in several tests but it is unknown whether such behavior could be improved. Perhaps some modification to the `_weboskcets.py` file? Let me know if it is the case.

Among the three metrics, the number of messages was the most impactful because the client always verifies the content sent back from a server leading a sequential-like behavior. Perhaps the number of messages is not a good parameter for benchmarking purposes.

To finish, `wtx` was faster in all tests and can indeed be rotulated as the fastest WebSocket implementation at least according to the presented projects and methodology.
