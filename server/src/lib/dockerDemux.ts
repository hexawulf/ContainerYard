/**
 * Docker log stream demultiplexer.
 *
 * Non-TTY containers return logs in Docker's multiplexed format: each frame is
 * an 8-byte header ([stream, 0, 0, 0, size(uint32 BE)]) followed by `size`
 * bytes of payload. TTY containers return the raw byte stream with no headers.
 *
 * The previous implementation decoded every chunk on its own. On a follow
 * stream, frames regularly straddle chunk boundaries, so the tail of a frame
 * was dropped and the next chunk was misread as raw text (header bytes leaked
 * into the UI). Multi-byte UTF-8 characters split across frames were mangled
 * too. This class keeps the unconsumed bytes between chunks and uses one
 * StringDecoder per stream to keep UTF-8 sequences intact.
 */
import { StringDecoder } from "string_decoder";

const HEADER_SIZE = 8;

type Mode = "unknown" | "multiplexed" | "raw";

function looksLikeHeader(buf: Buffer, offset = 0): boolean {
  if (buf.length - offset < HEADER_SIZE) return false;
  const stream = buf[offset];
  return (stream === 0 || stream === 1 || stream === 2) &&
    buf[offset + 1] === 0 && buf[offset + 2] === 0 && buf[offset + 3] === 0;
}

export class DockerLogDemuxer {
  private mode: Mode = "unknown";
  private pending: Buffer = Buffer.alloc(0);
  private readonly decoders = new Map<number, StringDecoder>();

  private decoder(stream: number): StringDecoder {
    let d = this.decoders.get(stream);
    if (!d) {
      d = new StringDecoder("utf8");
      this.decoders.set(stream, d);
    }
    return d;
  }

  /** Feed a chunk; returns whatever text is now complete. */
  push(chunk: Buffer): string {
    let buf = this.pending.length ? Buffer.concat([this.pending, chunk]) : chunk;
    this.pending = Buffer.alloc(0);

    if (this.mode === "unknown") {
      if (buf.length < HEADER_SIZE) {
        // Not enough bytes to decide yet.
        this.pending = buf;
        return "";
      }
      this.mode = looksLikeHeader(buf) ? "multiplexed" : "raw";
    }

    if (this.mode === "raw") {
      return this.decoder(1).write(buf);
    }

    let out = "";
    let offset = 0;
    while (buf.length - offset >= HEADER_SIZE) {
      const stream = buf[offset];
      const size = buf.readUInt32BE(offset + 4);
      const start = offset + HEADER_SIZE;
      const end = start + size;
      if (end > buf.length) break; // frame incomplete: wait for more data
      out += this.decoder(stream).write(buf.subarray(start, end));
      offset = end;
    }
    if (offset < buf.length) {
      this.pending = Buffer.from(buf.subarray(offset));
    }
    return out;
  }

  /** Flush any buffered bytes (call when the stream ends). */
  end(): string {
    let out = "";
    if (this.mode !== "multiplexed" && this.pending.length) {
      // Short TTY output that never reached HEADER_SIZE bytes.
      out += this.decoder(1).write(this.pending);
    }
    // A truncated trailing frame in multiplexed mode is dropped deliberately:
    // its header is not text.
    this.pending = Buffer.alloc(0);
    this.decoders.forEach((d) => { out += d.end(); });
    return out;
  }
}

/** Demultiplex a complete (non-streaming) log buffer. */
export function demuxDockerLogs(buffer: Buffer): string {
  const demuxer = new DockerLogDemuxer();
  return demuxer.push(buffer) + demuxer.end();
}
