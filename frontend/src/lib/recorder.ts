// Records the microphone as standalone 16 kHz mono WAV chunks. Unlike MediaRecorder
// timeslices, every chunk is a complete file that any speech API can decode on its own.

const WORKLET = `
class Capture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('capture', Capture);
`

export type ChunkHandler = (wav: Blob, startSec: number, endSec: number) => void

export class ChunkRecorder {
  private ctx?: AudioContext
  private stream?: MediaStream
  private node?: AudioWorkletNode
  private frames: Float32Array[] = []
  private frameSamples = 0
  private totalSamples = 0
  private chunkStartSample = 0
  private currentLevel = 0

  /**
   * Chunks whose loudest sample is below `minPeak` (0..1) are treated as silence:
   * `onSilent` is called instead of `onChunk`. 0 keeps everything.
   */
  constructor(
    private chunkSec: number,
    private onChunk: ChunkHandler,
    private minPeak = 0,
    private onSilent: () => void = () => {},
  ) {}

  /** The input device the browser picked, e.g. "Microphone Array (Realtek)". */
  deviceName() {
    return this.stream?.getAudioTracks()[0]?.label ?? ''
  }

  /** Recent microphone loudness, 0..1, for a live level meter. */
  level() {
    return this.currentLevel
  }

  async start() {
    // autoGainControl lifts quiet / distant voices; noiseSuppression off so soft speech is not erased.
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: true,
      },
    })
    try {
      this.ctx = new AudioContext({ sampleRate: 16000 })
    } catch {
      this.ctx = new AudioContext()
    }
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
    await this.ctx.audioWorklet.addModule(url)
    URL.revokeObjectURL(url)
    const source = this.ctx.createMediaStreamSource(this.stream)
    this.node = new AudioWorkletNode(this.ctx, 'capture')
    this.node.port.onmessage = (e: MessageEvent<Float32Array>) => this.push(e.data)
    source.connect(this.node)
    // Do not connect to speakers — loopback makes echo-cancellation kill quiet speech.
  }

  elapsedSec() {
    return this.ctx ? this.totalSamples / this.ctx.sampleRate : 0
  }

  async stop() {
    if (!this.ctx) return
    const rate = this.ctx.sampleRate
    if (this.frameSamples > rate * 0.5) this.flush()
    this.node?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    await this.ctx.close()
    this.ctx = undefined
  }

  private push(frame: Float32Array) {
    let p = 0
    for (let i = 0; i < frame.length; i++) p = Math.max(p, Math.abs(frame[i]))
    this.currentLevel = Math.max(p, this.currentLevel * 0.85)
    this.frames.push(frame)
    this.frameSamples += frame.length
    this.totalSamples += frame.length
    if (this.ctx && this.frameSamples >= this.chunkSec * this.ctx.sampleRate) this.flush()
  }

  private flush() {
    const rate = this.ctx!.sampleRate
    const samples = new Float32Array(this.frameSamples)
    let offset = 0
    for (const f of this.frames) {
      samples.set(f, offset)
      offset += f.length
    }
    const start = this.chunkStartSample / rate
    this.chunkStartSample += this.frameSamples
    this.frames = []
    this.frameSamples = 0
    const p = peak(samples)
    if (this.minPeak > 0 && p < this.minPeak) {
      this.onSilent()
      return
    }
    normalize(samples, p)
    this.onChunk(encodeWav(samples, rate), start, this.chunkStartSample / rate)
  }
}

function peak(samples: Float32Array): number {
  let p = 0
  for (let i = 0; i < samples.length; i++) p = Math.max(p, Math.abs(samples[i]))
  return p
}

/** Boosts quiet / low-level recordings so speech models hear them (up to 16x). */
function normalize(samples: Float32Array, p: number) {
  if (p <= 0) return
  const gain = Math.min(16, 0.9 / p)
  if (gain <= 1) return
  for (let i = 0; i < samples.length; i++) samples[i] *= gain
}

function encodeWav(samples: Float32Array, rate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buffer)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

/** Records one answer: stops after `maxSec`, or earlier when `stopSignal` resolves. */
export async function recordOnce(maxSec: number, stopSignal: Promise<void>): Promise<Blob | null> {
  let result: Blob | null = null
  const rec = new ChunkRecorder(maxSec + 5, (wav) => {
    result = wav
  })
  await rec.start()
  await Promise.race([new Promise((r) => setTimeout(r, maxSec * 1000)), stopSignal])
  await rec.stop()
  return result
}
