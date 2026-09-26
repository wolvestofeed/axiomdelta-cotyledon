import 'server-only';

/** Stream a Buffer in chunks so large documents are not held as one response body. */
export function streamBuffer(buf: Buffer, chunk = 256 * 1024): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= buf.byteLength) {
        controller.close();
        return;
      }
      const end = Math.min(offset + chunk, buf.byteLength);
      controller.enqueue(new Uint8Array(buf.subarray(offset, end)));
      offset = end;
    },
  });
}
