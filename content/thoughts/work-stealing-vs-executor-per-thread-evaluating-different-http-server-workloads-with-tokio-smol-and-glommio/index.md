+++
date = 2026-07-01
description = "Measures the impact that the number of threads has on each execution model across multiple balanced and unbalanced scenarios."
title = "Work Stealing vs. Executor-Per-Thread: Evaluating different HTTP server workloads with Tokio, Smol and Glommio"

[taxonomies]
tags = ["http", "rust", "wtx"]

[extra]
image = "/thoughts/work-stealing-vs-executor-per-thread-evaluating-different-http-server-workloads-with-tokio-smol-and-glommio/intro.avif"
+++

<figure class="image">
  <img src="/thoughts/work-stealing-vs-executor-per-thread-evaluating-different-http-server-workloads-with-tokio-smol-and-glommio/intro.avif" alt="Introduction" loading="lazy">
  <figcaption>Image by Andreas from Pixabay</figcaption>
</figure>

90 scenarios based on different balanced and unbalanced workloads were tested against four runtimes<sup>1</sup> to evaluate the performance differences between Executor-Per-Thread<sup>2</sup> and Work-Stealing architectures.

All tests are based on Rust-written software and Rust-based technologies, although some information can also be applied to other programming languages or similar environments.

All files are available at <a href="/thoughts/work-stealing-vs-executor-per-thread-evaluating-different-http-server-workloads-with-tokio-smol-and-glommio/wtx-bench.tar.xz">data.tar.xz</a>. Feel free to reach out if you spot any misunderstandings or misconfigurations.

## Motivation

The motivation to test Work-Stealing against Executor-Per-Thread originated from my early attempts to submit the <a href="https://github.com/c410-f3r/wtx">WTX</a><sup>3</sup> project to <a href="https://www.http-arena.com">HttpArena</a> using the default `#[tokio::main(flavor = "multi_thread")]` macro.

To my surprise, the initial PRs showed a score ~8x lower than the best position in the WebSocket benchmark, which was highly unusual. I was left wondering: *Is there a bug in the library or did I do something wrong?*

After manually scrolling through other projects in HttpArena as well as in the now-abandoned TechEmpower, it became clear that all Tokio-based libraries were spawning threads where each one had its own WebSocket server instance with a generous backlog, sharing the same address through `SO_REUSEADDR`.

Another surprise occurred when the same trick was applied to WTX: It became number one in the `echo` test case. As you might have guessed, the culprit is balanced workloads.

## Executor-Per-Thread vs. Work-Stealing

In the **Executor-Per-Thread** model, the system associates a runtime's executor with a specific thread. All asynchronous work must be contained within that thread, adopting a share-nothing approach. It is often labeled as "Thread-Per-Core".

This approach improves tail latencies by maximizing local CPU cache hits. For Rust specifically it is a big deal because of creeping `Send`<sup>4</sup> bounds that often yield confusing, incomplete and untraceable compile errors.

In **Work-Stealing**, there is only a single runtime in the whole program that usually orchestrates all the available threads in the system, allowing idle workers to "steal" tasks from the queues of busy workers.

It acts, roughly speaking, as an internal load balancer. Idle workers can pull tasks from the queues of busy workers, though this incurs overhead due to thread synchronization.

The choice between the two usually comes down to the average workload of your specific business or project.

## HTTP server

The HTTP servers expose three endpoints based on real-world scenarios:

* `create_order`: Validates user-provided data, creates an order in the database and then signals a gateway payment. Has two awaiting points<sup>5</sup>.
* `index_page`: Represents a chunk of sequential code without external IO calls where the thread is occupied in its entirety. Another analogy could be the processing of in-memory JSON content.
* `read_order`: Fetches an order from the database and then processes the returned data into an user-friendly format. Has a single awaiting point.

To isolate runtime performance, all IO calls are simulated using asynchronous sleeps (yielding timers) in microseconds and sequential processing is simulated using busy-wait loops.

```txt
CREATE_ORDER_DATABASE_LATENCY = 2000us
CREATE_ORDER_GATEWAY_LATENCY = 10000us
CREATE_ORDER_PROCESSING = 2us
INDEX_PAGE_PROCESSING = 2us
READ_ORDER_DATABASE_LATENCY = 1000us
READ_ORDER_PROCESSING = 2us
```

Unlike HTTP/1.1, where a single connection typically involves several network trips, the web servers in these tests are based on HTTP/2 that can handle long-lived, bi-directional streams, avoiding the need for frequent handshakes and streams also help exercise the system's ability to handle concurrent workloads.

<figure class="image">
  <img src="/thoughts/work-stealing-vs-executor-per-thread-evaluating-different-http-server-workloads-with-tokio-smol-and-glommio/http2.avif" alt="HTTP/2 streams" loading="lazy">
  <figcaption>HTTP/2 streams</figcaption>
</figure>

## Workloads

The tests utilized three thread counts, two distribution ratios, three connection scales and five environment types, totaling 90 configurations. Each set was applied to a runtime, resulting in a grand total of 360 performed evaluations.

`tokio-ws` is the only runtime configured with Work-Stealing (`ws` suffix), while the remaining runtimes spawn multiple threads in a share-nothing Executor-Per-Thread approach (`ept` suffix).

* `tokio-ept`: Based on `epoll` via `mio`; a `LocalRuntime` is created on each thread.
* `tokio-ws`: Based on `epoll` via `mio`; a single multi-thread `Runtime` is created in the main thread.
* `glommio-ept`: Based on `io_uring` via built-in `syscalls`; a `LocalExecutor` is created on each thread.
* `smol-ept`: Based on `epoll` via `polling`; a `LocalExecutor<'static>` is created on each thread.

All runtime instances have an associated HTTP/2 server that shares the same port through `SO_REUSEPORT`.

|Threads|Balance|Scale|Workload|
|---|---|---|---|
|4, 8, 12|even, uneven|low, medium, high|cpu_heavy, io_heavy, mixed, pure_io, pure_cpu|

##### Threads

The system has 24 threads with simultaneous multithreading (SMT) enabled, so each party (client and server) has up to 12 threads delimited by `taskset` as well as built-in mechanisms like `tokio::runtime::Builder`.

In "[Measuring Software Performance: Why Your Benchmarks Are Probably Lying](https://kakkoyun.me/posts/fosdem-2026-measuring-software-performance/)", it is stated that SMT can introduce noise in CPU-bound benchmarks. However, it was kept enabled to figure out if a higher number of workers could cause degradation, as observed in "[Throughput doesn't increase with cores/threads count](https://github.com/grpc/grpc-rust/issues/1405)".

##### Balance

In an even balance distribution, all requests made by clients are evenly distributed. In the uneven distribution, 10% of the clients generate 90% of the traffic, simulating a "Noisy Neighbor" effect.

This is where the difference between Work-Stealing and Executor-Per-Thread should theoretically be the most noticeable.

##### Scale

In a `low` environment, 500 clients maintain a frequency of `4000 * 2` requests per second; in a `medium` environment, 4000 clients maintain a frequency of `15000 * 2` requests per second; and in a `high` environment, 15000 clients maintain `45000 * 2` requests per second. Requests per second are multiplied by 2 because of concurrent HTTP/2 streams that are called batches in k6 nomenclature.

These ratios are purposefully kept high to ensure most of the tests run under heavy load across all clients.

##### Workload

Starting from `pure_cpu` and progressing toward `pure_io`, the workloads consist of an increasing percentage of IO-bound tasks.

||create_order|index_page|read_order|
|---|---|---|---|
|**pure_cpu**|0%|100%|0%|
|**cpu_heavy**|10%|70%|20%|
|**mixed**|33%|33%|34%|
|**io_heavy**|50%|20%|30%|
|**pure_io**|100%|0%|0%|

Work-Stealing should theoretically benefit more from IO-intensive tasks.

## Results

The [k6](https://k6.io) load generator was used to perform the requests, with its configurations stored in the `k6.js` file and invoked by the `run.py` application.

The `--release` flag was the only optimization parameter used when compiling. CSV data, as well as all generated graphs, were produced though the calling of the `run.sh` script.

|Category|Specifications|
|---|---|
|**Hardware**|`AMD Ryzen 9 5900X (12-Core)`, `32GB DDR4`, `Corsair Force MP510`|
|**System**|`kernel 7.0.11-200.fc44.x86_64`, `gcc 13.3.0`, `glibc 2.39`|
|**Crates**|`tokio 1.53.1`, `smol 2.0.2`, `glommio 0.9.0`|

##### CSV values

```csv
Binary,Threads,Balance,Scale,Workload,RPS,P95_Create,P95_Index,P95_Read
glommio-ept,4,even,low,cpu_heavy,70950.02,14.44,2.92,3.91
glommio-ept,4,even,low,io_heavy,66821.48,17.08,3.96,4.46
glommio-ept,4,even,low,mixed,68987.87,16.60,3.87,4.32
glommio-ept,4,even,low,pure_io,62941.99,17.54,0.00,0.00
glommio-ept,4,even,low,pure_cpu,73303.35,0.00,1.29,0.00
glommio-ept,4,even,medium,cpu_heavy,34317.94,157.22,146.19,152.28
glommio-ept,4,even,medium,io_heavy,34621.78,261.22,261.59,261.41
glommio-ept,4,even,medium,mixed,36063.77,170.28,164.42,168.74
glommio-ept,4,even,medium,pure_io,32095.13,214.64,0.00,0.00
glommio-ept,4,even,medium,pure_cpu,37068.00,0.00,152.60,0.00
glommio-ept,4,even,high,cpu_heavy,12080.71,815.87,807.06,809.14
glommio-ept,4,even,high,io_heavy,12230.40,708.96,708.73,710.01
glommio-ept,4,even,high,mixed,11248.34,1060.25,1058.83,1059.69
glommio-ept,4,even,high,pure_io,12466.15,704.77,0.00,0.00
glommio-ept,4,even,high,pure_cpu,12598.66,0.00,714.59,0.00
glommio-ept,4,uneven,low,cpu_heavy,40716.79,12.57,0.29,1.41
glommio-ept,4,uneven,low,io_heavy,17621.28,17.76,1.89,2.64
glommio-ept,4,uneven,low,mixed,20517.02,18.26,1.01,2.17
glommio-ept,4,uneven,low,pure_io,15549.74,13.42,0.00,0.00
glommio-ept,4,uneven,low,pure_cpu,71967.04,0.00,0.37,0.00
glommio-ept,4,uneven,medium,cpu_heavy,37346.67,215.54,213.13,223.82
glommio-ept,4,uneven,medium,io_heavy,34401.98,226.70,220.42,223.64
glommio-ept,4,uneven,medium,mixed,35966.26,233.12,224.24,235.61
glommio-ept,4,uneven,medium,pure_io,32429.13,142.57,0.00,0.00
glommio-ept,4,uneven,medium,pure_cpu,36002.73,0.00,226.46,0.00
glommio-ept,4,uneven,high,cpu_heavy,15661.04,1029.01,1011.40,1032.76
glommio-ept,4,uneven,high,io_heavy,16466.26,814.47,803.06,806.29
glommio-ept,4,uneven,high,mixed,15851.59,823.77,813.68,822.35
glommio-ept,4,uneven,high,pure_io,16289.70,986.86,0.00,0.00
glommio-ept,4,uneven,high,pure_cpu,15973.12,0.00,910.24,0.00
glommio-ept,8,even,low,cpu_heavy,71950.60,14.23,3.17,3.88
glommio-ept,8,even,low,io_heavy,65896.46,17.73,4.75,5.08
glommio-ept,8,even,low,mixed,68458.91,17.32,4.00,4.52
glommio-ept,8,even,low,pure_io,60858.55,17.36,0.00,0.00
glommio-ept,8,even,low,pure_cpu,72125.61,0.00,1.55,0.00
glommio-ept,8,even,medium,cpu_heavy,31140.98,225.01,187.14,202.35
glommio-ept,8,even,medium,io_heavy,33339.11,167.93,152.83,158.55
glommio-ept,8,even,medium,mixed,34856.04,234.42,217.63,225.06
glommio-ept,8,even,medium,pure_io,36150.47,174.83,0.00,0.00
glommio-ept,8,even,medium,pure_cpu,33056.89,0.00,145.69,0.00
glommio-ept,8,even,high,cpu_heavy,11437.37,754.59,745.82,746.81
glommio-ept,8,even,high,io_heavy,11633.71,881.14,794.15,832.49
glommio-ept,8,even,high,mixed,12230.06,701.89,678.54,694.37
glommio-ept,8,even,high,pure_io,11636.94,864.48,0.00,0.00
glommio-ept,8,even,high,pure_cpu,12655.48,0.00,671.77,0.00
glommio-ept,8,uneven,low,cpu_heavy,38763.24,12.36,0.21,1.31
glommio-ept,8,uneven,low,io_heavy,17675.83,12.53,0.85,1.56
glommio-ept,8,uneven,low,mixed,20799.25,12.58,0.39,1.51
glommio-ept,8,uneven,low,pure_io,15516.45,12.61,0.00,0.00
glommio-ept,8,uneven,low,pure_cpu,71681.61,0.00,0.42,0.00
glommio-ept,8,uneven,medium,cpu_heavy,36437.57,231.34,204.07,219.03
glommio-ept,8,uneven,medium,io_heavy,38109.79,175.49,165.38,164.13
glommio-ept,8,uneven,medium,mixed,33172.56,250.00,228.64,244.04
glommio-ept,8,uneven,medium,pure_io,33236.31,175.32,0.00,0.00
glommio-ept,8,uneven,medium,pure_cpu,38542.36,0.00,171.73,0.00
glommio-ept,8,uneven,high,cpu_heavy,16256.96,779.10,778.88,780.61
glommio-ept,8,uneven,high,io_heavy,16315.86,908.22,802.93,806.80
glommio-ept,8,uneven,high,mixed,15809.32,801.38,788.13,790.64
glommio-ept,8,uneven,high,pure_io,16466.18,819.18,0.00,0.00
glommio-ept,8,uneven,high,pure_cpu,14772.67,0.00,849.48,0.00
glommio-ept,12,even,low,cpu_heavy,71114.24,14.81,3.44,4.19
glommio-ept,12,even,low,io_heavy,65826.35,18.14,4.92,5.13
glommio-ept,12,even,low,mixed,68527.94,16.94,4.32,4.94
glommio-ept,12,even,low,pure_io,61709.51,17.42,0.00,0.00
glommio-ept,12,even,low,pure_cpu,72700.36,0.00,2.13,0.00
glommio-ept,12,even,medium,cpu_heavy,34386.01,159.92,148.27,150.93
glommio-ept,12,even,medium,io_heavy,30297.96,212.27,185.34,183.56
glommio-ept,12,even,medium,mixed,33068.20,176.75,146.94,151.84
glommio-ept,12,even,medium,pure_io,31475.24,176.21,0.00,0.00
glommio-ept,12,even,medium,pure_cpu,34385.63,0.00,208.75,0.00
glommio-ept,12,even,high,cpu_heavy,11228.15,1096.34,1077.98,1089.09
glommio-ept,12,even,high,io_heavy,11170.10,872.90,858.75,867.49
glommio-ept,12,even,high,mixed,12169.23,712.12,694.28,705.07
glommio-ept,12,even,high,pure_io,11780.65,929.03,0.00,0.00
glommio-ept,12,even,high,pure_cpu,11376.30,0.00,699.29,0.00
glommio-ept,12,uneven,low,cpu_heavy,40153.06,12.33,0.19,1.25
glommio-ept,12,uneven,low,io_heavy,17733.70,12.86,0.61,1.63
glommio-ept,12,uneven,low,mixed,20921.84,12.89,0.45,1.39
glommio-ept,12,uneven,low,pure_io,15603.06,12.75,0.00,0.00
glommio-ept,12,uneven,low,pure_cpu,72796.50,0.00,0.37,0.00
glommio-ept,12,uneven,medium,cpu_heavy,39516.53,169.97,155.03,161.14
glommio-ept,12,uneven,medium,io_heavy,35135.04,231.08,215.53,216.59
glommio-ept,12,uneven,medium,mixed,37980.37,176.40,171.09,173.31
glommio-ept,12,uneven,medium,pure_io,32296.85,192.70,0.00,0.00
glommio-ept,12,uneven,medium,pure_cpu,38115.72,0.00,162.20,0.00
glommio-ept,12,uneven,high,cpu_heavy,16033.62,822.94,804.84,807.80
glommio-ept,12,uneven,high,io_heavy,16887.30,818.66,810.93,811.40
glommio-ept,12,uneven,high,mixed,17967.54,836.94,826.93,829.99
glommio-ept,12,uneven,high,pure_io,14781.96,882.14,0.00,0.00
glommio-ept,12,uneven,high,pure_cpu,17592.51,0.00,786.87,0.00
smol-ept,4,even,low,cpu_heavy,71315.16,15.15,3.04,3.80
smol-ept,4,even,low,io_heavy,66746.62,17.76,4.34,4.56
smol-ept,4,even,low,mixed,68278.28,17.58,4.79,5.25
smol-ept,4,even,low,pure_io,61322.55,17.53,0.00,0.00
smol-ept,4,even,low,pure_cpu,72334.01,0.00,1.92,0.00
smol-ept,4,even,medium,cpu_heavy,33641.55,266.04,265.47,265.77
smol-ept,4,even,medium,io_heavy,34547.18,176.84,171.86,173.95
smol-ept,4,even,medium,mixed,28858.76,222.82,226.81,226.46
smol-ept,4,even,medium,pure_io,33137.43,178.68,0.00,0.00
smol-ept,4,even,medium,pure_cpu,30870.55,0.00,266.28,0.00
smol-ept,4,even,high,cpu_heavy,11258.83,1059.81,1056.81,1056.45
smol-ept,4,even,high,io_heavy,12434.34,723.76,723.25,723.01
smol-ept,4,even,high,mixed,11568.83,939.57,926.07,931.58
smol-ept,4,even,high,pure_io,12296.52,721.41,0.00,0.00
smol-ept,4,even,high,pure_cpu,12273.93,0.00,736.72,0.00
smol-ept,4,uneven,low,cpu_heavy,40162.98,13.13,0.36,1.59
smol-ept,4,uneven,low,io_heavy,17527.78,21.88,0.97,2.66
smol-ept,4,uneven,low,mixed,20498.06,15.98,1.41,3.14
smol-ept,4,uneven,low,pure_io,15603.80,14.46,0.00,0.00
smol-ept,4,uneven,low,pure_cpu,72693.78,0.00,0.41,0.00
smol-ept,4,uneven,medium,cpu_heavy,34860.17,229.38,225.15,221.82
smol-ept,4,uneven,medium,io_heavy,33783.99,260.16,253.86,258.02
smol-ept,4,uneven,medium,mixed,35110.69,227.66,211.14,223.06
smol-ept,4,uneven,medium,pure_io,29250.74,240.32,0.00,0.00
smol-ept,4,uneven,medium,pure_cpu,41154.31,0.00,167.16,0.00
smol-ept,4,uneven,high,cpu_heavy,15341.58,957.24,954.93,949.82
smol-ept,4,uneven,high,io_heavy,17319.11,806.87,798.32,802.80
smol-ept,4,uneven,high,mixed,15619.90,1027.53,1029.14,1027.20
smol-ept,4,uneven,high,pure_io,16002.24,887.65,0.00,0.00
smol-ept,4,uneven,high,pure_cpu,14749.62,0.00,850.74,0.00
smol-ept,8,even,low,cpu_heavy,70700.85,14.14,3.27,3.88
smol-ept,8,even,low,io_heavy,66120.87,17.61,4.50,5.04
smol-ept,8,even,low,mixed,69488.07,16.90,4.16,4.85
smol-ept,8,even,low,pure_io,60993.38,17.59,0.00,0.00
smol-ept,8,even,low,pure_cpu,72597.50,0.00,2.36,0.00
smol-ept,8,even,medium,cpu_heavy,34505.96,181.14,172.08,174.49
smol-ept,8,even,medium,io_heavy,32400.98,173.67,155.12,167.11
smol-ept,8,even,medium,mixed,34886.01,164.37,147.88,150.83
smol-ept,8,even,medium,pure_io,32302.54,151.09,0.00,0.00
smol-ept,8,even,medium,pure_cpu,33456.99,0.00,258.62,0.00
smol-ept,8,even,high,cpu_heavy,12754.10,726.60,710.96,715.83
smol-ept,8,even,high,io_heavy,11193.55,1090.23,1087.06,1088.78
smol-ept,8,even,high,mixed,11876.70,962.07,951.70,956.61
smol-ept,8,even,high,pure_io,11340.48,1045.43,0.00,0.00
smol-ept,8,even,high,pure_cpu,12355.55,0.00,690.53,0.00
smol-ept,8,uneven,low,cpu_heavy,40422.48,12.67,0.21,1.36
smol-ept,8,uneven,low,io_heavy,17741.09,14.43,0.55,1.86
smol-ept,8,uneven,low,mixed,20796.36,13.60,0.58,1.71
smol-ept,8,uneven,low,pure_io,15481.32,13.39,0.00,0.00
smol-ept,8,uneven,low,pure_cpu,73191.28,0.00,0.47,0.00
smol-ept,8,uneven,medium,cpu_heavy,35625.13,185.02,170.95,172.62
smol-ept,8,uneven,medium,io_heavy,36002.00,224.09,203.74,205.64
smol-ept,8,uneven,medium,mixed,42757.68,170.75,148.07,151.29
smol-ept,8,uneven,medium,pure_io,32421.37,186.59,0.00,0.00
smol-ept,8,uneven,medium,pure_cpu,36408.46,0.00,207.68,0.00
smol-ept,8,uneven,high,cpu_heavy,17307.11,787.38,785.41,787.39
smol-ept,8,uneven,high,io_heavy,16751.14,746.20,737.04,731.17
smol-ept,8,uneven,high,mixed,14224.69,972.73,962.12,963.12
smol-ept,8,uneven,high,pure_io,16975.27,842.08,0.00,0.00
smol-ept,8,uneven,high,pure_cpu,15051.67,0.00,967.49,0.00
smol-ept,12,even,low,cpu_heavy,71442.44,14.66,3.27,4.05
smol-ept,12,even,low,io_heavy,65755.49,17.19,4.18,4.63
smol-ept,12,even,low,mixed,68688.70,18.11,4.82,5.24
smol-ept,12,even,low,pure_io,61038.63,16.39,0.00,0.00
smol-ept,12,even,low,pure_cpu,73054.99,0.00,1.36,0.00
smol-ept,12,even,medium,cpu_heavy,31482.62,202.43,162.21,166.49
smol-ept,12,even,medium,io_heavy,36859.49,171.54,139.78,152.92
smol-ept,12,even,medium,mixed,34805.12,182.24,171.81,177.50
smol-ept,12,even,medium,pure_io,34207.15,222.12,0.00,0.00
smol-ept,12,even,medium,pure_cpu,32058.80,0.00,145.79,0.00
smol-ept,12,even,high,cpu_heavy,12638.26,714.36,691.11,699.23
smol-ept,12,even,high,io_heavy,12337.69,715.70,688.74,696.46
smol-ept,12,even,high,mixed,12334.73,709.01,688.96,697.51
smol-ept,12,even,high,pure_io,12599.62,696.10,0.00,0.00
smol-ept,12,even,high,pure_cpu,11132.37,0.00,1057.74,0.00
smol-ept,12,uneven,low,cpu_heavy,40630.41,12.37,0.20,1.32
smol-ept,12,uneven,low,io_heavy,17812.38,12.66,0.32,1.41
smol-ept,12,uneven,low,mixed,21150.40,13.30,0.35,1.43
smol-ept,12,uneven,low,pure_io,15629.15,13.46,0.00,0.00
smol-ept,12,uneven,low,pure_cpu,71366.03,0.00,0.44,0.00
smol-ept,12,uneven,medium,cpu_heavy,38968.66,228.45,214.29,216.92
smol-ept,12,uneven,medium,io_heavy,38961.22,168.05,143.92,149.69
smol-ept,12,uneven,medium,mixed,38701.58,175.50,156.00,171.47
smol-ept,12,uneven,medium,pure_io,35397.88,178.61,0.00,0.00
smol-ept,12,uneven,medium,pure_cpu,37474.36,0.00,165.36,0.00
smol-ept,12,uneven,high,cpu_heavy,16201.79,838.87,837.76,833.17
smol-ept,12,uneven,high,io_heavy,14781.16,944.93,926.83,932.26
smol-ept,12,uneven,high,mixed,15541.74,854.03,854.15,856.42
smol-ept,12,uneven,high,pure_io,16700.73,695.79,0.00,0.00
smol-ept,12,uneven,high,pure_cpu,16234.85,0.00,661.57,0.00
tokio-ept,4,even,low,cpu_heavy,71455.49,16.33,2.98,4.17
tokio-ept,4,even,low,io_heavy,64623.22,18.87,3.22,4.83
tokio-ept,4,even,low,mixed,68161.81,18.48,3.63,4.77
tokio-ept,4,even,low,pure_io,54922.24,18.70,0.00,0.00
tokio-ept,4,even,low,pure_cpu,72389.09,0.00,2.40,0.00
tokio-ept,4,even,medium,cpu_heavy,34760.63,263.48,263.59,262.31
tokio-ept,4,even,medium,io_heavy,34372.18,230.41,230.20,229.58
tokio-ept,4,even,medium,mixed,35043.86,172.08,164.24,168.94
tokio-ept,4,even,medium,pure_io,35396.84,158.72,0.00,0.00
tokio-ept,4,even,medium,pure_cpu,32408.81,0.00,264.54,0.00
tokio-ept,4,even,high,cpu_heavy,11170.83,956.00,956.87,954.50
tokio-ept,4,even,high,io_heavy,12207.68,727.04,726.71,726.87
tokio-ept,4,even,high,mixed,11134.30,1061.66,1060.61,1058.47
tokio-ept,4,even,high,pure_io,11099.13,1052.40,0.00,0.00
tokio-ept,4,even,high,pure_cpu,12261.33,0.00,723.07,0.00
tokio-ept,4,uneven,low,cpu_heavy,34089.44,15.22,0.25,2.98
tokio-ept,4,uneven,low,io_heavy,16160.10,15.70,0.75,3.60
tokio-ept,4,uneven,low,mixed,18137.20,23.18,1.19,3.99
tokio-ept,4,uneven,low,pure_io,14282.07,16.67,0.00,0.00
tokio-ept,4,uneven,low,pure_cpu,70513.17,0.00,0.40,0.00
tokio-ept,4,uneven,medium,cpu_heavy,39223.89,210.82,207.49,207.74
tokio-ept,4,uneven,medium,io_heavy,32686.75,236.03,231.35,234.63
tokio-ept,4,uneven,medium,mixed,35484.46,180.21,176.40,177.79
tokio-ept,4,uneven,medium,pure_io,34275.42,178.89,0.00,0.00
tokio-ept,4,uneven,medium,pure_cpu,41443.32,0.00,161.04,0.00
tokio-ept,4,uneven,high,cpu_heavy,16920.80,822.38,820.01,821.39
tokio-ept,4,uneven,high,io_heavy,16933.58,900.33,850.10,871.91
tokio-ept,4,uneven,high,mixed,14060.48,1218.14,817.38,1189.83
tokio-ept,4,uneven,high,pure_io,15433.60,1010.74,0.00,0.00
tokio-ept,4,uneven,high,pure_cpu,16894.83,0.00,801.54,0.00
tokio-ept,8,even,low,cpu_heavy,72125.79,16.74,3.14,4.46
tokio-ept,8,even,low,io_heavy,64795.83,18.94,3.60,5.20
tokio-ept,8,even,low,mixed,67371.74,18.72,3.96,5.16
tokio-ept,8,even,low,pure_io,55497.58,18.24,0.00,0.00
tokio-ept,8,even,low,pure_cpu,72665.86,0.00,2.97,0.00
tokio-ept,8,even,medium,cpu_heavy,33282.26,173.78,146.68,158.03
tokio-ept,8,even,medium,io_heavy,31578.40,216.04,202.94,210.26
tokio-ept,8,even,medium,mixed,33646.20,165.76,149.14,153.62
tokio-ept,8,even,medium,pure_io,34269.48,166.21,0.00,0.00
tokio-ept,8,even,medium,pure_cpu,32993.98,0.00,167.30,0.00
tokio-ept,8,even,high,cpu_heavy,11098.07,786.87,777.14,782.02
tokio-ept,8,even,high,io_heavy,12188.72,701.80,670.87,692.25
tokio-ept,8,even,high,mixed,11741.39,832.85,779.28,815.87
tokio-ept,8,even,high,pure_io,12475.58,706.31,0.00,0.00
tokio-ept,8,even,high,pure_cpu,11297.58,0.00,811.07,0.00
tokio-ept,8,uneven,low,cpu_heavy,33267.02,15.32,0.28,2.84
tokio-ept,8,uneven,low,io_heavy,16311.98,15.49,0.55,2.89
tokio-ept,8,uneven,low,mixed,18560.86,23.33,1.10,3.08
tokio-ept,8,uneven,low,pure_io,14496.14,15.55,0.00,0.00
tokio-ept,8,uneven,low,pure_cpu,71391.12,0.00,0.39,0.00
tokio-ept,8,uneven,medium,cpu_heavy,39214.25,178.83,151.50,159.76
tokio-ept,8,uneven,medium,io_heavy,35872.96,181.34,164.77,172.30
tokio-ept,8,uneven,medium,mixed,37205.66,186.54,162.59,174.59
tokio-ept,8,uneven,medium,pure_io,31205.11,231.24,0.00,0.00
tokio-ept,8,uneven,medium,pure_cpu,36956.25,0.00,201.29,0.00
tokio-ept,8,uneven,high,cpu_heavy,16585.61,846.34,830.81,835.08
tokio-ept,8,uneven,high,io_heavy,14893.14,958.02,857.73,945.39
tokio-ept,8,uneven,high,mixed,15097.25,896.04,852.38,873.61
tokio-ept,8,uneven,high,pure_io,16282.23,879.08,0.00,0.00
tokio-ept,8,uneven,high,pure_cpu,14668.29,0.00,998.38,0.00
tokio-ept,12,even,low,cpu_heavy,71605.68,16.55,3.01,4.40
tokio-ept,12,even,low,io_heavy,64145.45,19.09,3.39,4.78
tokio-ept,12,even,low,mixed,65917.21,19.41,4.88,5.57
tokio-ept,12,even,low,pure_io,54577.21,17.71,0.00,0.00
tokio-ept,12,even,low,pure_cpu,72489.71,0.00,1.60,0.00
tokio-ept,12,even,medium,cpu_heavy,33830.69,196.84,150.44,153.61
tokio-ept,12,even,medium,io_heavy,32083.10,259.60,242.97,250.62
tokio-ept,12,even,medium,mixed,29612.31,204.25,159.68,178.00
tokio-ept,12,even,medium,pure_io,33996.61,169.65,0.00,0.00
tokio-ept,12,even,medium,pure_cpu,30181.45,0.00,168.39,0.00
tokio-ept,12,even,high,cpu_heavy,11228.86,919.81,905.45,911.80
tokio-ept,12,even,high,io_heavy,11434.96,889.16,831.95,849.00
tokio-ept,12,even,high,mixed,12188.33,724.82,706.45,715.31
tokio-ept,12,even,high,pure_io,12073.17,728.26,0.00,0.00
tokio-ept,12,even,high,pure_cpu,12374.91,0.00,710.64,0.00
tokio-ept,12,uneven,low,cpu_heavy,33720.01,15.40,0.31,2.88
tokio-ept,12,uneven,low,io_heavy,16291.45,15.96,0.68,2.95
tokio-ept,12,uneven,low,mixed,18602.65,15.24,0.53,2.89
tokio-ept,12,uneven,low,pure_io,14393.69,18.25,0.00,0.00
tokio-ept,12,uneven,low,pure_cpu,71238.12,0.00,0.39,0.00
tokio-ept,12,uneven,medium,cpu_heavy,35839.56,142.86,122.26,133.82
tokio-ept,12,uneven,medium,io_heavy,36573.86,183.26,166.40,170.45
tokio-ept,12,uneven,medium,mixed,34711.55,246.99,213.51,217.36
tokio-ept,12,uneven,medium,pure_io,30012.28,231.03,0.00,0.00
tokio-ept,12,uneven,medium,pure_cpu,38509.43,0.00,153.57,0.00
tokio-ept,12,uneven,high,cpu_heavy,17061.39,820.20,817.60,818.82
tokio-ept,12,uneven,high,io_heavy,16173.19,769.28,764.99,766.67
tokio-ept,12,uneven,high,mixed,15933.74,807.02,805.36,805.21
tokio-ept,12,uneven,high,pure_io,15582.23,898.16,0.00,0.00
tokio-ept,12,uneven,high,pure_cpu,17455.20,0.00,668.38,0.00
tokio-ws,4,even,low,cpu_heavy,71978.27,17.34,3.31,4.81
tokio-ws,4,even,low,io_heavy,63853.68,18.29,2.90,5.01
tokio-ws,4,even,low,mixed,67594.17,18.54,3.55,4.70
tokio-ws,4,even,low,pure_io,53857.29,18.00,0.00,0.00
tokio-ws,4,even,low,pure_cpu,73248.76,0.00,1.69,0.00
tokio-ws,4,even,medium,cpu_heavy,29705.87,230.72,217.21,229.58
tokio-ws,4,even,medium,io_heavy,33217.17,179.89,176.85,179.59
tokio-ws,4,even,medium,mixed,35589.97,171.80,154.96,158.27
tokio-ws,4,even,medium,pure_io,30689.74,255.06,0.00,0.00
tokio-ws,4,even,medium,pure_cpu,32106.65,0.00,187.08,0.00
tokio-ws,4,even,high,cpu_heavy,12251.71,713.89,706.25,711.72
tokio-ws,4,even,high,io_heavy,12314.94,726.12,726.99,725.99
tokio-ws,4,even,high,mixed,967.34,686.01,674.20,679.92
tokio-ws,4,even,high,pure_io,11154.68,1023.93,0.00,0.00
tokio-ws,4,even,high,pure_cpu,12436.71,0.00,711.31,0.00
tokio-ws,4,uneven,low,cpu_heavy,34454.69,14.98,0.28,2.89
tokio-ws,4,uneven,low,io_heavy,16270.33,15.63,0.40,3.00
tokio-ws,4,uneven,low,mixed,19039.99,15.32,0.35,3.04
tokio-ws,4,uneven,low,pure_io,14661.21,15.08,0.00,0.00
tokio-ws,4,uneven,low,pure_cpu,74126.29,0.00,0.41,0.00
tokio-ws,4,uneven,medium,cpu_heavy,1219.00,235.84,234.02,240.45
tokio-ws,4,uneven,medium,io_heavy,34927.43,179.41,170.14,172.20
tokio-ws,4,uneven,medium,mixed,1074.27,248.52,240.34,241.57
tokio-ws,4,uneven,medium,pure_io,32180.93,251.15,0.00,0.00
tokio-ws,4,uneven,medium,pure_cpu,36606.98,0.00,225.42,0.00
tokio-ws,4,uneven,high,cpu_heavy,1355.18,854.52,887.70,849.50
tokio-ws,4,uneven,high,io_heavy,16181.88,831.93,794.46,804.15
tokio-ws,4,uneven,high,mixed,14095.76,1065.08,1041.95,1051.58
tokio-ws,4,uneven,high,pure_io,15906.61,704.02,0.00,0.00
tokio-ws,4,uneven,high,pure_cpu,17533.71,0.00,754.33,0.00
tokio-ws,8,even,low,cpu_heavy,71311.57,16.44,2.82,4.24
tokio-ws,8,even,low,io_heavy,62947.70,18.41,2.74,4.69
tokio-ws,8,even,low,mixed,68693.44,18.59,4.06,5.50
tokio-ws,8,even,low,pure_io,53573.83,17.99,0.00,0.00
tokio-ws,8,even,low,pure_cpu,71755.70,0.00,2.18,0.00
tokio-ws,8,even,medium,cpu_heavy,34113.21,171.59,150.27,155.44
tokio-ws,8,even,medium,io_heavy,33774.20,172.81,148.08,157.19
tokio-ws,8,even,medium,mixed,30887.24,178.28,152.44,164.07
tokio-ws,8,even,medium,pure_io,32550.49,168.31,0.00,0.00
tokio-ws,8,even,medium,pure_cpu,1221.40,0.00,228.88,0.00
tokio-ws,8,even,high,cpu_heavy,967.35,761.73,679.84,734.77
tokio-ws,8,even,high,io_heavy,967.47,711.13,689.53,700.32
tokio-ws,8,even,high,mixed,967.32,705.96,679.47,695.72
tokio-ws,8,even,high,pure_io,967.32,706.04,0.00,0.00
tokio-ws,8,even,high,pure_cpu,967.36,0.00,1016.30,0.00
tokio-ws,8,uneven,low,cpu_heavy,33763.66,15.11,0.25,2.77
tokio-ws,8,uneven,low,io_heavy,16448.63,15.46,0.23,2.93
tokio-ws,8,uneven,low,mixed,18750.06,15.09,0.24,2.99
tokio-ws,8,uneven,low,pure_io,14510.73,15.34,0.00,0.00
tokio-ws,8,uneven,low,pure_cpu,75001.74,0.00,0.36,0.00
tokio-ws,8,uneven,medium,cpu_heavy,1370.15,176.21,153.47,159.32
tokio-ws,8,uneven,medium,io_heavy,38771.43,174.45,160.67,171.13
tokio-ws,8,uneven,medium,mixed,1349.33,171.43,159.08,162.89
tokio-ws,8,uneven,medium,pure_io,36184.73,179.17,0.00,0.00
tokio-ws,8,uneven,medium,pure_cpu,41371.41,0.00,169.77,0.00
tokio-ws,8,uneven,high,cpu_heavy,1204.60,793.16,792.48,794.46
tokio-ws,8,uneven,high,io_heavy,1387.45,833.21,804.87,806.87
tokio-ws,8,uneven,high,mixed,1301.86,827.64,825.78,824.77
tokio-ws,8,uneven,high,pure_io,1462.10,939.63,0.00,0.00
tokio-ws,8,uneven,high,pure_cpu,1302.80,0.00,924.64,0.00
tokio-ws,12,even,low,cpu_heavy,71936.64,16.51,2.89,4.33
tokio-ws,12,even,low,io_heavy,64234.63,18.51,2.61,4.93
tokio-ws,12,even,low,mixed,2246.81,18.62,3.59,5.22
tokio-ws,12,even,low,pure_io,55683.13,17.90,0.00,0.00
tokio-ws,12,even,low,pure_cpu,72693.87,0.00,1.79,0.00
tokio-ws,12,even,medium,cpu_heavy,34469.45,169.19,144.01,153.11
tokio-ws,12,even,medium,io_heavy,1183.79,163.68,127.70,141.78
tokio-ws,12,even,medium,mixed,33623.26,191.25,153.49,171.35
tokio-ws,12,even,medium,pure_io,1086.39,197.17,0.00,0.00
tokio-ws,12,even,medium,pure_cpu,37987.21,0.00,138.43,0.00
tokio-ws,12,even,high,cpu_heavy,967.42,611.99,599.63,605.09
tokio-ws,12,even,high,io_heavy,12774.84,689.52,675.38,682.14
tokio-ws,12,even,high,mixed,967.23,408.53,352.11,375.24
tokio-ws,12,even,high,pure_io,11370.73,996.67,0.00,0.00
tokio-ws,12,even,high,pure_cpu,967.41,0.00,744.86,0.00
tokio-ws,12,uneven,low,cpu_heavy,35213.23,15.05,0.27,2.81
tokio-ws,12,uneven,low,io_heavy,16416.07,15.54,0.64,3.02
tokio-ws,12,uneven,low,mixed,18932.86,15.07,0.25,3.04
tokio-ws,12,uneven,low,pure_io,480.44,15.32,0.00,0.00
tokio-ws,12,uneven,low,pure_cpu,75444.89,0.00,0.39,0.00
tokio-ws,12,uneven,medium,cpu_heavy,1442.01,222.22,204.25,207.21
tokio-ws,12,uneven,medium,io_heavy,1297.76,173.07,164.19,165.76
tokio-ws,12,uneven,medium,mixed,34781.88,215.48,190.98,200.13
tokio-ws,12,uneven,medium,pure_io,1127.22,181.86,0.00,0.00
tokio-ws,12,uneven,medium,pure_cpu,41261.35,0.00,161.42,0.00
tokio-ws,12,uneven,high,cpu_heavy,1199.92,879.61,830.52,838.10
tokio-ws,12,uneven,high,io_heavy,1253.56,701.33,686.11,694.75
tokio-ws,12,uneven,high,mixed,1281.12,279.83,269.34,272.04
tokio-ws,12,uneven,high,pure_io,1305.29,820.38,0.00,0.00
tokio-ws,12,uneven,high,pure_cpu,1253.18,0.00,808.22,0.00
```

##### Pure CPU

<img src="/thoughts/work-stealing-vs-executor-per-thread-evaluating-different-http-server-workloads-with-tokio-smol-and-glommio/pure_cpu_even.svg" alt="Pure CPU - Even" loading="lazy">
<img src="/thoughts/work-stealing-vs-executor-per-thread-evaluating-different-http-server-workloads-with-tokio-smol-and-glommio/pure_cpu_uneven.svg" alt="Pure CPU - Uneven" loading="lazy">

##### CPU heavy

<img src="/thoughts/work-stealing-vs-executor-per-thread-evaluating-different-http-server-workloads-with-tokio-smol-and-glommio/cpu_heavy_even.svg" alt="CPU heavy - Even" loading="lazy">
<img src="/thoughts/work-stealing-vs-executor-per-thread-evaluating-different-http-server-workloads-with-tokio-smol-and-glommio/cpu_heavy_uneven.svg" alt="CPU heavy - Uneven" loading="lazy">

##### Mixed

<img src="/thoughts/work-stealing-vs-executor-per-thread-evaluating-different-http-server-workloads-with-tokio-smol-and-glommio/mixed_even.svg" alt="Mixed - Even" loading="lazy">
<img src="/thoughts/work-stealing-vs-executor-per-thread-evaluating-different-http-server-workloads-with-tokio-smol-and-glommio/mixed_uneven.svg" alt="Mixed - Uneven" loading="lazy">

##### IO heavy

<img src="/thoughts/work-stealing-vs-executor-per-thread-evaluating-different-http-server-workloads-with-tokio-smol-and-glommio/io_heavy_even.svg" alt="IO heavy - Even" loading="lazy">
<img src="/thoughts/work-stealing-vs-executor-per-thread-evaluating-different-http-server-workloads-with-tokio-smol-and-glommio/io_heavy_uneven.svg" alt="IO heavy - Uneven" loading="lazy">

##### Pure IO

<img src="/thoughts/work-stealing-vs-executor-per-thread-evaluating-different-http-server-workloads-with-tokio-smol-and-glommio/pure_io_even.svg" alt="Pure IO - Even" loading="lazy">
<img src="/thoughts/work-stealing-vs-executor-per-thread-evaluating-different-http-server-workloads-with-tokio-smol-and-glommio/pure_io_uneven.svg" alt="Pure IO - Uneven" loading="lazy">

## Final words

Tokio configured with the multi-thread Work-Stealing showed anomalies when running with 8 or 12 threads and even after performing other runs with different timings, TCP kernel parameters or number of clients, the behavior did not change. Neither the server nor k6 showed any errors in the logs so it is unknown whether the root cause was an accidental misconfiguration or an issue within Tokio itself.

The most surprising takeaway is that `io_uring` (via Glommio) did not strictly outperform `epoll` variants because scores remained similar across the board even in unbalanced scenarios where 10% of the clients made 90% of the requests.

Generally speaking, the benchmarks aren't conclusive. The choice between Executor-Per-Thread and Work-Stealing doesn't seem like a simple matter of "which is faster" but rather which architecture best aligns with your specific application logic.

---

**Notes:**

1. In Rust a runtime is responsible for scheduling tasks (units of async work) in user-space.
2. An executor, like tokio or glommio, is responsible for creating runtimes and its associated tools.
3. WTX is a collection of web technologies written in Rust.
4. `Send` indicates that a type can be shared across threads. See [Send and Sync](https://doc.rust-lang.org/nomicon/send-and-sync.html).
5. Awaiting points are state machines created by the compiler where execution is halted or resumed according to external wakes.

---

**References:**

* [Apache Iggy's migration journey to thread-per-core architecture powered by io_uring](https://iggy.apache.org/blogs/2026/02/27/thread-per-core-io_uring)
* [Measuring Software Performance: Why Your Benchmarks Are Probably Lying](https://kakkoyun.me/posts/fosdem-2026-measuring-software-performance/)
* [Morsel-Driven Parallelism: A NUMA-Aware Query Evaluation Framework for the Many-Core Age](https://db.in.tum.de/~leis/papers/morsels.pdf)
* [Scalable server design in Rust with Tokio](https://medium.com/@fujita.tomonori/scalable-server-design-in-rust-with-tokio-4c81a5f350a3)
* [The Death of Thread Per Core](https://buttondown.com/jaffray/archive/the-death-of-thread-per-core)
* [The Impact of Thread-Per-Core Architecture on Application Tail Latency](https://penberg.org/papers/tpc-ancs19.pdf)
* [Thread-per-core](https://without.boats/blog/thread-per-core)
* [Throughput doesn't increase with cores/threads count](https://github.com/grpc/grpc-rust/issues/1405)
