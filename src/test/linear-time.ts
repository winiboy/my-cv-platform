/**
 * Growth-rate timing for complexity tests, independent of machine speed.
 *
 * An absolute threshold ("under 100 ms") fails on a slow shared CI runner and
 * passes on a fast laptop whatever the algorithm. What a complexity test
 * actually protects is the SHAPE of the cost, so this measures the same
 * operation on a base input and on an input `f` times larger and returns the
 * ratio of the two times. The machine's speed cancels out of that ratio.
 *
 * Reading the ratio for a growth factor `f`: constant (bounded) cost gives
 * about 1, linear about `f`, quadratic `f²`. `linearCeiling(f)` is the
 * geometric midpoint between linear and quadratic, so it tolerates the same
 * factor of measurement skew on either side: `√f`.
 *
 * Use `f = 8` (ceiling ≈ 22.6, tolerance ≈ 2.8x) rather than 4 (ceiling 8,
 * tolerance 2x). A linear operation has been measured at up to 2x its expected
 * ratio, persistently within one test worker - heap and cache state, which
 * more repetitions do not remove - and at `f = 4` that reached the ceiling.
 *
 * Precondition: the base input must be large enough that the operation's own
 * work dominates any fixed cost per call. A fixed cost pulls the ratio towards
 * 1 and so HIDES growth. A tight pure-JavaScript loop is a poor subject for the
 * same reason: V8 can run it at different JIT tiers on the two sides (seen as
 * a quadratic loop measuring 2.5 instead of 16). Work done by native string
 * and RegExp code, which is what the sanitizers and detector spend their time
 * in, measures cleanly.
 *
 * Noise control:
 * - both operations run once before timing, so JIT compilation, regex
 *   compilation and lazy string flattening are not measured;
 * - each sample repeats its operation until it lasts at least `MIN_SAMPLE_MS`,
 *   so no sample is near timer resolution;
 * - the base sample is calibrated to last at least as long as the scaled one
 *   (and, since calibration doubles, less than twice as long). A longer sample
 *   is more likely to be preempted (other test workers, a scheduler quantum),
 *   so a scaled sample longer than the base one would inflate the ratio under
 *   load - which is exactly the shared CI runner this exists for. The
 *   remaining imbalance tends to lower the ratio, not raise it;
 * - base and scaled samples are interleaved, so a slowdown of the machine
 *   during the run hits both, and the fastest of `repetitions` samples is kept,
 *   because interference only ever adds time.
 */

/** Shortest sample: far above `performance.now()` resolution and jitter. */
const MIN_SAMPLE_MS = 10

const DEFAULT_REPETITIONS = 5

/**
 * The highest ratio a linear operation may show when its input grows by
 * `growth`: the geometric midpoint between linear (`growth`) and quadratic
 * (`growth²`).
 */
export function linearCeiling(growth: number): number {
  return growth ** 1.5
}

export interface ScalingMeasurement {
  /** Fastest time of one base operation, in milliseconds. */
  baseMs: number
  /** Fastest time of one scaled operation, in milliseconds. */
  scaledMs: number
  /** `scaledMs / baseMs`. */
  ratio: number
}

/**
 * Results are kept here so the engine cannot discard a call whose return value
 * is otherwise unused.
 */
let sink: unknown

function timeIterations(operation: () => unknown, iterations: number): number {
  const started = performance.now()
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    sink = operation()
  }
  return performance.now() - started
}

interface Calibration {
  iterations: number
  sampleMs: number
}

/** The fewest iterations, by doubling, whose sample lasts at least `targetMs`. */
function calibrate(operation: () => unknown, targetMs: number): Calibration {
  let iterations = 1
  let sampleMs = timeIterations(operation, iterations)
  while (sampleMs < targetMs) {
    iterations *= 2
    sampleMs = timeIterations(operation, iterations)
  }
  return { iterations, sampleMs }
}

/**
 * Times `base` and `scaled` (the same operation on inputs of two sizes) and
 * returns how much slower the scaled one is. Build both inputs before calling
 * this, so their construction is not timed.
 */
export function measureScaling(
  base: () => unknown,
  scaled: () => unknown,
  repetitions: number = DEFAULT_REPETITIONS
): ScalingMeasurement {
  sink = base()
  sink = scaled()

  const scaledCalibration = calibrate(scaled, MIN_SAMPLE_MS)
  const baseCalibration = calibrate(base, scaledCalibration.sampleMs)

  let basePerOperation = Number.POSITIVE_INFINITY
  let scaledPerOperation = Number.POSITIVE_INFINITY
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    basePerOperation = Math.min(
      basePerOperation,
      timeIterations(base, baseCalibration.iterations) / baseCalibration.iterations
    )
    scaledPerOperation = Math.min(
      scaledPerOperation,
      timeIterations(scaled, scaledCalibration.iterations) / scaledCalibration.iterations
    )
  }
  void sink

  return {
    baseMs: basePerOperation,
    scaledMs: scaledPerOperation,
    ratio: scaledPerOperation / basePerOperation,
  }
}
