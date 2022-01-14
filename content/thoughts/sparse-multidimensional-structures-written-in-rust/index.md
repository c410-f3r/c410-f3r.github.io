+++
date = 2019-03-09
description = "Announcing ndsparse, a project that provides structures to store and retrieve N-dimensional sparse data. Currently supports a generalization of the Compressed Sparse Column (CSC), Compressed Sparse Row (CSR) and Coordinate (COO) formats."
title = "Sparse multidimensional structures written in Rust"

[taxonomies]
tags = ["sparse", "data-structure", "multidimensional", "rust"]

[extra]
image = "/thoughts/sparse-multidimensional-structures-written-in-rust/intro.jpg"
+++

<figure class="image">
  <img src="/thoughts/sparse-multidimensional-structures-written-in-rust/intro.jpg" alt="Introduction">
  <figcaption>Photo by Patrick Fore on Unsplash</figcaption>
</figure>

Sparse structures is an exciting studying field that enables you to build, store, modify and retrieve scattered data in a fast and efficient way. Along with algebraic operations, its usage ranges from several Artificial Intelligence areas, Operations Research, simulations and many others places where, e.g., a dense (non-sparse) matrix-vector multiplication (MxV) is too costly or even pointless for very sparse problems.

In this post, I am going to talk about [ndsparse], a batteries-included library written in [Rust] that is intended to provide different types of multidimensional sparse structures where you can choose the format that best suits you.

<h4 class="is-4 title">For the hopeful</h4>

Before anything else, [ndsparse] isn't a multidimensional sparse algebra/arithmetic library (disappointment face) because of its self-contained responsibility and complexity. Futhermore, a really good implementation of such library would require a titanic amount of research, work and free time that I don't have.

This intended limitation restricts the usage of this project by a lot but it is still useful for store, transform and retrieve use-cases. One can also be a hero and use some of the supported structures as a building foundation for higher level libraries.

Checkout [sprs] for an awesome "rustic" sparse linear algebra library.

<h4 class="is-4 title">Supported formats</h4>

There are a bunch of different 2D sparse structures that determinate the space-usage and the asymptotic limit of a given operation, some are generic and others are more problem specific. E.g.: BSR, COO, CSC, CSR, DIA, DOK, ELL, JDS and LIL.

Two (or three, depending on your POV) widely known formats were picked for adaptation, namely, COO and CSC/CSR.

<h6 class="is-6 subtitle">COO (Coordinate)</h6>

Probably the most intuitive format, fits gracefully for N-dimensions. Just need a set of indices and its corresponding non-zero elements.

```rust
use ndsparse::coo::CooArray;
// As odd as it may seem, this illustration is just a guide to get a grasp of
// a 5D structure.
//
// The order is up to the caller. In this case, the dimensions [a, b, c, d, e] were
// arranged as follows:
//
// a: top to bottom
// b: left to right
// c: front to back
// d: top to bottom
// e: left to right
//
//          ___ ___ ___            ___ ___ ___            ___ ___ ___
//        /   /   /   /\         / 3 /   /   /\         /   /   /   /\
//       /___/___/___/ /\       /_3_/___/___/ /\       /___/___/___/ /\
//      /   /   /   /\/ /\     /   /   /   /\/ /\     /   / 4 /   /\/ /\
//     /___/___/___/ /\/ /    /___/___/___/ /\/ /    /___/_4_/___/ /\/ /
//    /   /   /   /\/ /\/    /   /   /   /\/ /\/    /   /   /   /\/ /\/
//   /___/___/___/ /\/ /    /___/___/___/ /\/ /    /___/___/___/ /\/ /
//  /   /   /   /\/1/\/    /   /   /   /\/ /\/    /   /   /   /\/ /\/
// /___/___/___/ /\/ /    /___/___/___/ /\/ /    /___/___/___/ /\/ /
// \___\___\___\/ /\/     \___\___\___\/ /\/     \___\___\___\/ /\/
//  \___\___\___\/ /       \___\_2_\___\/ /       \___\___\___\/ /
//   \___\___\___\/         \___\___\___\/         \___\___\___\/
//
//          ___ ___ ___            ___ ___ ___            ___ ___ ___
//        /   /   /   /\         /   /   /   /\         /   /   / 6 /\
//       /___/___/___/ /\       /___/___/___/ /\       /___/___/_6_/6/\
//      /   /   /   /\/ /\     /   /   /   /\/ /\     /   /   /   /\/ /\
//     /___/___/___/ /\/ /    /___/___/___/ /\/ /    /___/___/___/ /\/7/
//    /   /   /   /\/ /\/    /   /   /   /\/ /\/    /   /   /   /\/ /\/
//   /___/___/___/ /\/ /    /___/___/___/ /\/ /    /___/___/___/ /\/ /
//  /   /   /   /\/ /\/    /   /   /   /\/ /\/    /   /   /   /\/ /\/
// /___/___/___/ /\/ /    /___/___/___/ /\/ /    /___/___/___/ /\/ /
// \___\___\___\/ /\/     \___\___\___\/ /\/     \___\___\___\/ /\/
//  \___\___\___\/ /       \___\___\___\/ /       \___\___\___\/ /
//   \___\___\___\/         \___\_5_\___\/         \___\___\___\/
let _coo_array_5 = CooArray::new(
    [2, 3, 4, 3, 3],
    [
        ([0, 0, 1, 1, 2].into(), 1),
        ([0, 1, 0, 1, 1].into(), 2),
        ([0, 1, 3, 0, 0].into(), 3),
        ([0, 2, 2, 0, 1].into(), 4),
        ([1, 1, 0, 2, 1].into(), 5),
        ([1, 2, 3, 0, 2].into(), 6),
        ([1, 2, 3, 2, 2].into(), 7),
    ],
);
```

You might be wondering what are these `Array` and `into()` things. Well, we will get there in a minute.

<h6 class="is-6 subtitle">CSL (Compressed Sparse Line)</h6>

A generalization of the Compressed Sparse Column (CSC) and Compressed Sparse Row (CSR) formats for N-dimensions. Since all data is compressed line-by-line, this nomenclature came naturally.

Basically, three indexed storage are needed, one for the data itself, one for the line index of each data and one to indicate the number of non-zero elements of each line. Here, each line can also be interpreted as the innermost dimension or the right most dimension.

```rust
use ndsparse::csl::CslArray;
// Two cuboids illustrating a [2, 3, 4, 5] 4D in a [w, y, z, x] order, i.e., each "line"
// or 1D representation is a left to right row and each "matrix" or 2D representation
// is filled in a top-down manner.
//
//  w: left to right
//  y: top to bottom
//  z: front to back
//  x: left to right
// 
//          ___ ___ ___ ___ ___            ___ ___ ___ ___ ___
//        /   /   /   / 4 / 5 /\         /   /   /   /   /   /\
//       /___/___/___/_4_/_5_/5/\       /___/___/___/___/___/ /\
//      /   /   /   /   /   /\/ /\     /   /   / 9 /   /   /\/ /\
//     /___/___/___/___/___/ /\/ /    /___/___/_9_/___/___/ /\/ /
//    /   / 3 /   /   /   /\/ /\/    /   /   /   /   /   /\/ /\/
//   /___/_3_/___/___/___/ /\/ /    /___/_ _/___/___/___/ /\/ /
//  / 1 /   /   / 2 /   /\/ /\/    /   /   /   /   /   /\/ /\/
// /_1_/___/___/_2_/___/ /\/8/    /___/___/___/___/___/ /\/ /
// \_1_\___\___\_2_\___\/ /\/     \___\___\___\___\___\/ /\/
//  \___\___\_6_\___\___\/ /       \___\___\___\___\___\/ /
//   \___\___\_7_\___\___\/         \___\___\___\___\___\/
let _csl_array_4_ = CslArray::new(
  [2, 3, 4, 5],
  [1, 2, 3, 4, 5, 6, 7, 8, 9],
  [0, 3, 1, 3, 4, 2, 2, 4, 2],
  [0, 2, 3, 3, 5, 6, 6, 6, 6, 7, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9],
);
```

Yes, each additional dimension significantly raises the number of line offsets. The good thing is the possibility of slicing sub-dimensions views and the bad thing is obviously the increased space usage.

If you are still confused or don't want to manually create instances, it is easier to construct a valid CSL by using [CslLineConstructor].

<h4 class="is-4 title">Rust-ish features</h4>

<figure class="image">
  <img src="/thoughts/sparse-multidimensional-structures-written-in-rust/rust.jpg" alt="Rust">
  <figcaption>Photo by David Boca on Unsplash</figcaption>
</figure>

Have you ever heard of Rust? If not, you should probably start getting used to it. Currently, several companies are using it [[1]](https://www.rust-lang.org/production/users) and several programs are being written or rewritten in Rust like Firefox, ripgrep and librsvg. The reasons for such success are numerous: It is very fast, includes high-level facilities, the ownership rules prevent many memory management pitfalls (as well as thread safety), has an incredible community and many other cool things.

Unfortunately, for truly N-dimensional structures, the nightly constant generics feature is a hard requirement and even with it, there are no std implementations for arrays greater than 32 elements [[2]](https://github.com/rust-lang/rust/issues/61415) [[3]](https://github.com/rust-lang/rust/pull/62435), which leads to the creation of the [ArrayWrapper] alternative that is used heavily internally, thus, the `Into::into()` method conversion from `[T; N]` to `ArrayWrapper<T, N>`.

Putting all that aside, [ndsparse] has a lot of [optional features](https://github.com/c410-f3r/ndsparse/#optional-features). Initially, considering a `#[no_std]` and "no `alloc`" environment, none of them are used by default, giving the user the freedom to choose whatever is required.

```toml
[dependencies]
ndsparse = { features = ["alloc", "with_arrayvec", "with_rand", "with_rayon", "with_serde", "with_smallvec", "with_staticvec"], version = "0.2" }
```

<h6 class="is-6 subtitle">Different backends for storage</h6>

Owned structures can use static arrays, heap-allocated vectors or even third-party dependencies like [ArrayVec] to store the underlying data.

```rust
use ndsparse::{
  coo::{CooRef, CooStaticVec},
  csl::{CslRef, CslSmallVec, CslStaticVec}
};

// CSL

let mut csl_small_vec = CslSmallVec::<i32, 2, 5, 26>::default();
let mut csl_static_vec = CslStaticVec::<i32, 2, 5, 26>::default();
csl_small_vec.constructor().next_outermost_dim(5).push_line(&[1, 2], &[0, 3]);
csl_static_vec.constructor().next_outermost_dim(5).push_line(&[1, 2], &[0, 3]);
assert!(
  csl_small_vec.line([0, 0]) == Some(CslRef::new([5], &[1, 2][..], &[0, 3][..], &[0, 2][..]))
);
assert!(csl_small_vec.line([0, 0]) == csl_static_vec.line([0, 0]));

// COO

let coo_ref_data = [([0, 0, 0].into(), 1)];
let coo_ref = CooRef::new([9, 9, 9], &coo_ref_data[..]);
let coo_static_vec = CooStaticVec::new([9, 9, 9], [([0, 0, 0].into(), 1)]);
assert!(coo_ref.value([0, 0, 0]) == Some(&1));
assert!(coo_ref.value([0, 0, 0]) == coo_static_vec.value([0, 0, 0]));
```

<h6 class="is-6 subtitle">Iterators and parallel iterators</h6>

Outermost iterators (first or left most dimension) for CSL can be retrieved in parallel using [rayon]. Pretty useful for very large structures.

```rust
use rayon::prelude::*;
let are_equal = some_csl
  .outermost_rayon_iter()
  .enumerate()
  .all(|(idx, csl_ref)| csl_ref == some_csl.outermost_iter().nth(idx).unwrap());
assert!(are_equal, true);
```

COO is more straightforward. For example, one can use `some_coo.data().par_iter().for_each(|_| {})`.

<h4 class="is-4 title">Future</h4>

Slicing isn't great for CSL, COO should receive more love, there isn't any agnostic transformation like `resize` or `transpose` and more formats could be added. All of these TODO's might be added at some point in the future with enough free time and willingness.

Last but not the least, I *think* that I invented a new sparse structured that is space-efficient and enables a fine-grained control over sparsity. More on this in a later post.

[arrayvec]: https://github.com/bluss/arrayvec
[CslLineConstructor]: https://docs.rs/ndsparse/0.2.1/ndsparse/csl/struct.CslLineConstructor.html
[ndsparse]: https://github.com/c410-f3r/ndsparse/
[rayon]: https://github.com/rayon-rs/rayon
[Rust]: https://www.rust-lang.org/
[sprs]: https://github.com/vbarrielle/sprs
[ArrayWrapper]: https://docs.rs/ndsparse/0.2.1/ndsparse/struct.ArrayWrapper.html