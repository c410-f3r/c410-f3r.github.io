const $navbarBurgers = Array.prototype.slice.call(document.querySelectorAll('.navbar-burger'), 0);

if ($navbarBurgers.length > 0) {
  $navbarBurgers.forEach( el => {
    el.addEventListener('click', () => {
      const target = el.dataset.target;
      const $target = document.getElementById(target);
      el.classList.toggle('is-active');
      $target.classList.toggle('is-active');
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const contentImages = document.querySelectorAll('.content img');
  if (contentImages.length > 0 && typeof mediumZoom !== 'undefined') {
    mediumZoom(contentImages, {
      margin: 25,
      background: 'rgba(255, 255, 255, 0.9)',
      scrollOffset: 40
    });
  }
});