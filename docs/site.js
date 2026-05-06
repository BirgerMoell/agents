const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.16 }
);

for (const element of document.querySelectorAll(".reveal")) {
  observer.observe(element);
}

const heroImage = document.querySelector(".hero-image");

window.addEventListener(
  "scroll",
  () => {
    if (!heroImage) return;
    const offset = Math.min(window.scrollY * 0.08, 44);
    heroImage.style.transform = `translateY(${offset}px) scale(1.02)`;
  },
  { passive: true }
);
