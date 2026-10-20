// Copy buttons on code blocks, and highlight the current section in the guide's table of contents.
document.querySelectorAll("pre").forEach((pre) => {
  const btn = document.createElement("button");
  btn.className = "copy";
  btn.type = "button";
  btn.textContent = "Copy";
  btn.addEventListener("click", async () => {
    const text = pre.querySelector("code")?.innerText ?? pre.innerText;
    try {
      await navigator.clipboard.writeText(text.replace(/\s+#.*$/gm, "").trim());
      btn.textContent = "Copied";
    } catch {
      btn.textContent = "Select and copy";
    }
    setTimeout(() => (btn.textContent = "Copy"), 1600);
  });
  pre.appendChild(btn);
});

const links = [...document.querySelectorAll(".toc a")];
if (links.length) {
  const byId = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
  const obs = new IntersectionObserver(
    (entries) => {
      const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!top) return;
      links.forEach((a) => a.classList.remove("on"));
      byId.get(top.target.id)?.classList.add("on");
    },
    { rootMargin: "-80px 0px -65% 0px" },
  );
  document.querySelectorAll(".doc h2[id]").forEach((h) => obs.observe(h));
}
