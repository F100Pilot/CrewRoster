// On an iPhone/iPad (Safari, and the app added to the Home Screen) a "download" link to a blob
// opens a preview with no way back in the standalone app; the share sheet ("Guardar em Ficheiros",
// Mail, WhatsApp…) is the native way to hand a file out. iPadOS reports itself as a Mac, hence
// the touch check.
const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Trigger a browser download for a Blob — through the share sheet on iOS, when it takes files.
export function downloadBlob(blob: Blob, fileName: string): void {
  if (isIOS()) {
    const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      // A cancelled share is fine; anything else falls back to the plain download.
      navigator.share({ files: [file] }).catch((e: unknown) => {
        if ((e as { name?: string })?.name !== 'AbortError') anchorDownload(blob, fileName);
      });
      return;
    }
  }
  anchorDownload(blob, fileName);
}

function anchorDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after a tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
