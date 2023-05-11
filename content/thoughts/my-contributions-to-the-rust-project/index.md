+++
date = 2023-05-11
description = "A quick recap of my contributions to the official Rust project over the span of several years."
title = "My contributions to the Rust project"

[taxonomies]
tags = ["rust", "compiler", "open-source"]

[extra]
image = "/thoughts/my-contributions-to-the-rust-compiler/intro.jpg"
+++

<figure class="image">
  <img src="/thoughts/my-contributions-to-the-rust-compiler/intro.jpg" alt="Introduction">
  <figcaption>Photo by Roman Synkevych on Unsplash</figcaption>
</figure>

All started with [https://github.com/rust-lang/rust/issues/60406#issuecomment-488306461] around ~4 years ago and since then I didn't stop contributing to the Rust compiler as well as other related projects like Clippy in my free time.

Besides the technical skills learned, the things that stood out the most were the concentration of knowledge in the hands of few busy individuals that eventually parted away and a noticeable amount of good contributors passing through sensible financial problems but these are matters for another post.

Without further ado, let's list all my major contributions in chronological order.

<h4 class="is-4 subtitle">1. Attributes in formal function parameter position</h4>

More-or-less like a introduction to the internals of the project, [https://github.com/rust-lang/rust/issues/60406] wasn't very difficult to implement because all necessary pieces were already available for utilization.

```rust
// Snippet extracted from the Juniper project

#[graphql_object]
impl Person {
  fn field(
    &self,
    #[graphql(default)] arg: i32
  ) -> String {
    ...
  }
}
```

<h4 class="is-4 subtitle">2. Easily create arrays with custom elements</h4>

Unfortunately [https://github.com/rust-lang/rust/pull/75644] took one year to be reviewed but at least one subset was stabilized on version 1.63.

```rust
// Snipper extracted from the Arbitrary project

fn size_hint(d: usize) -> (usize, Option<usize>) {
  crate::size_hint::and_all(&array::from_fn::<_, N, _>(|_| {
    <T as Arbitrary>::size_hint(d)
  }))
}
```

<h4 class="is-4 subtitle">3. Formally implement let chains</h4>

The toughest contribution, no doubt about that. [https://github.com/rust-lang/rust/pull/88642] was very challenging both technically and mentally.

```rust
// Snipper extracted from the Clippy project

if let FormatArgsPiece::Placeholder(placeholder) = piece
  && let Ok(index) = placeholder.argument.index
  && let Some(arg) = format_args.arguments.all_args().get(index)
{
  ...
}
```

Hopefully the remaining concerns involving dropping order will be resolved in the near future to allow a possible stabilization.

<h4 class="is-4 subtitle">4. Macro meta-variable expressions</h4>

[https://github.com/rust-lang/rust/issues/83527] is really useful and allows operations that are currently impossible on stable. Despite my attempts, some questions were raised and they need to be addressed before stabilization.

```rust
// Snipper extracted from the Rust project

impl<$($T: PartialEq),+> PartialEq for ($($T,)+)
where
  last_type!($($T,)+): ?Sized
{
  #[inline]
  fn eq(&self, other: &($($T,)+)) -> bool {
    $( ${ignore(T)} self.${index()} == other.${index()} )&&+
  }

  ...
}
```

<h4 class="is-4 subtitle">5. Nicer assert messages</h4>

[https://github.com/rust-lang/rust/issues/44838] depends on work on the constant evaluation front which unfortunately is not my specialty. Hope that I will be able to hack the missing pieces in the next months.

```rust
fn fun(a: Option<i32>, b: Option<i32>, c: Option<i32>) {
  assert!(
    [matches!(a, None), matches!(b, Some(1)] == [true, true] && matches!(c, Some(x) if x == 2)
  );
}

fn main() {
  fun(Some(1), None, Some(2));
}

// Assertion failed: [matches!(a, None), matches!(b, Some(1)] == [true, true] && matches!(c, Some(x) if x == 2)
//
// With captures:
//   a = Some(1)
//   b = None
//   c = Some(2)
```

<h4 class="is-4 subtitle">Final words</h4>

With this brief summary and other non-listed PRs, I think I made a small but positive impact on the ecosystem. Thank you very much for all the reviewers and mentors that helped me along the way with special mentions to [petrochenkov], [Centril] and [matthewjasper].

[https://github.com/rust-lang/rust/issues/60406#issuecomment-488306461]: https://github.com/rust-lang/rust/issues/60406#issuecomment-488306461
[https://github.com/rust-lang/rust/issues/60406]: https://github.com/rust-lang/rust/issues/60406
[https://github.com/rust-lang/rust/pull/75644]: https://github.com/rust-lang/rust/pull/75644
[https://github.com/rust-lang/rust/pull/88642]: https://github.com/rust-lang/rust/pull/88642
[https://github.com/rust-lang/rust/issues/83527]: https://github.com/rust-lang/rust/issues/83527
[https://github.com/rust-lang/rust/issues/44838]: https://github.com/rust-lang/rust/issues/44838
[petrochenkov]: https://github.com/petrochenkov
[Centril]: https://github.com/Centril
[matthewjasper]: https://github.com/matthewjasper