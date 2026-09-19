export function restorePreviewScroll(
  container: HTMLElement,
  requested: number,
  report: (top: number) => void,
): () => void {
  const images = Array.from(container.querySelectorAll('img'));
  const pending = new Set(images.filter((image) => !image.complete));
  let restoring = true;
  let disposed = false;
  let observer: ResizeObserver | undefined;

  const apply = () => {
    if (disposed || !restoring) return;
    const maximum = Math.max(0, container.scrollHeight - container.clientHeight);
    container.scrollTop = Math.min(Math.max(0, requested), maximum);
    if (pending.size === 0) {
      restoring = false;
      report(container.scrollTop);
      observer?.disconnect();
    }
  };

  const cancel = () => {
    restoring = false;
    observer?.disconnect();
  };

  const scroll = () => {
    if (!restoring) report(container.scrollTop);
  };

  const settled = (event: Event) => {
    pending.delete(event.currentTarget as HTMLImageElement);
    apply();
  };

  images.forEach((image) => {
    image.addEventListener('load', settled);
    image.addEventListener('error', settled);
  });
  container.addEventListener('scroll', scroll);
  // Outline dispatches this event before scrolling, including while an image is pending.
  container.addEventListener('preview-navigation', cancel);
  container.addEventListener('wheel', cancel, { passive: true });
  container.addEventListener('touchstart', cancel, { passive: true });
  container.addEventListener('pointerdown', cancel);
  container.addEventListener('keydown', cancel);

  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(apply);
    observer.observe(container);
    if (container.firstElementChild) observer.observe(container.firstElementChild);
  }

  apply();

  return () => {
    disposed = true;
    observer?.disconnect();
    images.forEach((image) => {
      image.removeEventListener('load', settled);
      image.removeEventListener('error', settled);
    });
    container.removeEventListener('scroll', scroll);
    container.removeEventListener('preview-navigation', cancel);
    container.removeEventListener('wheel', cancel);
    container.removeEventListener('touchstart', cancel);
    container.removeEventListener('pointerdown', cancel);
    container.removeEventListener('keydown', cancel);
  };
}
