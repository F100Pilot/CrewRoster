// Test environment shims. fake-indexeddb/auto installs a global IndexedDB so the storage
// layer (idb) and anything that persists can be exercised under jsdom. Each test file runs
// in its own isolated module/global scope, so the DB starts empty per file.
import 'fake-indexeddb/auto';

// jsdom's Blob lacks .text()/.arrayBuffer() (present in all real browsers). The backup
// code reads files/blobs via these, so polyfill them with FileReader for tests.
if (typeof Blob !== 'undefined' && !Blob.prototype.text) {
  Blob.prototype.text = function () {
    return new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsText(this);
    });
  };
  Blob.prototype.arrayBuffer = function () {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as ArrayBuffer);
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(this);
    });
  };
}
