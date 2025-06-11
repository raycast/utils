/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Readable, Writable, Duplex } from "node:stream";

export const none = /* #__PURE__ */ Symbol.for("object-stream.none");
const stop = /* #__PURE__ */ Symbol.for("object-stream.stop");

const finalSymbol = /* #__PURE__ */ Symbol.for("object-stream.final");
const manySymbol = /* #__PURE__ */ Symbol.for("object-stream.many");
const flushSymbol = /* #__PURE__ */ Symbol.for("object-stream.flush");
const fListSymbol = /* #__PURE__ */ Symbol.for("object-stream.fList");

const finalValue = (value: any) => ({ [finalSymbol]: 1, value });
export const many = (values: any) => ({ [manySymbol]: 1, values });

const isFinalValue = (o: any) => o && o[finalSymbol] === 1;
const isMany = (o: any) => o && o[manySymbol] === 1;
const isFlushable = (o: any) => o && o[flushSymbol] === 1;
const isFunctionList = (o: any) => o && o[fListSymbol] === 1;

const getFinalValue = (o: any) => o.value;
const getManyValues = (o: any) => o.values;
const getFunctionList = (o: any) => o.fList;

export const combineManyMut = (a: any, b: any) => {
  const values = a === none ? [] : a?.[manySymbol] === 1 ? a.values : [a];
  if (b === none) {
    // do nothing
  } else if (b?.[manySymbol] === 1) {
    values.push(...b.values);
  } else {
    values.push(b);
  }
  return many(values);
};

export const flushable = (write: (value: any) => any, final = null) => {
  const fn = final ? (value: any) => (value === none ? finalValue(undefined) : write(value)) : write;
  // @ts-ignore
  fn[flushSymbol] = 1;
  return fn;
};

const setFunctionList = (o: any, fns: any) => {
  o.fList = fns;
  o[fListSymbol] = 1;
  return o;
};

// is*NodeStream functions taken from https://github.com/nodejs/node/blob/master/lib/internal/streams/utils.js
const isReadableNodeStream = (obj: any) =>
  obj &&
  typeof obj.pipe === "function" &&
  typeof obj.on === "function" &&
  (!obj._writableState || (typeof obj._readableState === "object" ? obj._readableState.readable : null) !== false) && // Duplex
  (!obj._writableState || obj._readableState); // Writable has .pipe.

const isWritableNodeStream = (obj: any) =>
  obj &&
  typeof obj.write === "function" &&
  typeof obj.on === "function" &&
  (!obj._readableState || (typeof obj._writableState === "object" ? obj._writableState.writable : null) !== false); // Duplex

const isDuplexNodeStream = (obj: any) =>
  obj &&
  typeof obj.pipe === "function" &&
  obj._readableState &&
  typeof obj.on === "function" &&
  typeof obj.write === "function";

const isReadableWebStream = (obj: any) => obj && globalThis.ReadableStream && obj instanceof globalThis.ReadableStream;

const isWritableWebStream = (obj: any) => obj && globalThis.WritableStream && obj instanceof globalThis.WritableStream;

const isDuplexWebStream = (obj: any) =>
  obj &&
  globalThis.ReadableStream &&
  obj.readable instanceof globalThis.ReadableStream &&
  globalThis.WritableStream &&
  obj.writable instanceof globalThis.WritableStream;

const groupFunctions = (output: any, fn: any, index: any, fns: any) => {
  if (
    isDuplexNodeStream(fn) ||
    (!index && isReadableNodeStream(fn)) ||
    (index === fns.length - 1 && isWritableNodeStream(fn))
  ) {
    output.push(fn);
    return output;
  }
  if (isDuplexWebStream(fn)) {
    output.push(Duplex.fromWeb(fn, { objectMode: true }));
    return output;
  }
  if (!index && isReadableWebStream(fn)) {
    output.push(Readable.fromWeb(fn, { objectMode: true }));
    return output;
  }
  if (index === fns.length - 1 && isWritableWebStream(fn)) {
    output.push(Writable.fromWeb(fn, { objectMode: true }));
    return output;
  }
  if (typeof fn != "function") throw TypeError("Item #" + index + " is not a proper stream, nor a function.");
  if (!output.length) output.push([]);
  const last = output[output.length - 1];
  if (Array.isArray(last)) {
    last.push(fn);
  } else {
    output.push([fn]);
  }
  return output;
};

class Stop extends Error {}

export const asStream = (fn: any) => {
  if (typeof fn != "function") throw TypeError("Only a function is accepted as the first argument");

  // pump variables
  let paused = Promise.resolve();
  let resolvePaused: ((value: void | PromiseLike<void>) => void) | null = null;
  const queue: any[] = [];

  // pause/resume
  const resume: any = () => {
    if (!resolvePaused) return;
    resolvePaused();
    resolvePaused = null;
    paused = Promise.resolve();
  };
  const pause: any = () => {
    if (resolvePaused) return;
    paused = new Promise((resolve) => (resolvePaused = resolve));
  };

  // eslint-disable-next-line prefer-const
  let stream: Duplex; // will be assigned later

  // data processing
  const pushResults: any = (values: any) => {
    if (values && typeof values.next == "function") {
      // generator
      queue.push(values);
      return;
    }
    // array
    queue.push(values[Symbol.iterator]());
  };
  const pump: any = async () => {
    while (queue.length) {
      await paused;
      const gen = queue[queue.length - 1];
      let result = gen.next();
      if (result && typeof result.then == "function") {
        result = await result;
      }
      if (result.done) {
        queue.pop();
        continue;
      }
      let value = result.value;
      if (value && typeof value.then == "function") {
        value = await value;
      }
      await sanitize(value);
    }
  };
  const sanitize: any = async (value: any) => {
    if (value === undefined || value === null || value === none) return;
    if (value === stop) throw new Stop();

    if (isMany(value)) {
      pushResults(getManyValues(value));
      return pump();
    }

    if (isFinalValue(value)) {
      // a final value is not supported, it is treated as a regular value
      value = getFinalValue(value);
      return processValue(value);
    }

    if (!stream.push(value)) {
      pause();
    }
  };
  const processChunk: any = async (chunk: any, encoding: any) => {
    try {
      const value = fn(chunk, encoding);
      await processValue(value);
    } catch (error) {
      if (error instanceof Stop) {
        stream.push(null);
        stream.destroy();
        return;
      }
      throw error;
    }
  };
  const processValue: any = async (value: any) => {
    if (value && typeof value.then == "function") {
      // thenable
      return value.then((value: any) => processValue(value));
    }
    if (value && typeof value.next == "function") {
      // generator
      pushResults(value);
      return pump();
    }
    return sanitize(value);
  };

  stream = new Duplex(
    Object.assign({ writableObjectMode: true, readableObjectMode: true }, undefined, {
      write(chunk: any, encoding: any, callback: any) {
        processChunk(chunk, encoding).then(
          () => callback(null),
          (error: any) => callback(error),
        );
      },
      final(callback: any) {
        if (!isFlushable(fn)) {
          stream.push(null);
          callback(null);
          return;
        }
        processChunk(none, null).then(
          () => (stream.push(null), callback(null)),
          (error: any) => callback(error),
        );
      },
      read() {
        resume();
      },
    }),
  );

  return stream;
};

const produceStreams = (item: any) => {
  if (Array.isArray(item)) {
    if (!item.length) return null;
    if (item.length == 1) return item[0] && asStream(item[0]);
    return asStream(gen(...item));
  }
  return item;
};

const next: any = async function* (value: any, fns: any, index: any) {
  for (let i = index; i <= fns.length; ++i) {
    if (value && typeof value.then == "function") {
      // thenable
      value = await value;
    }
    if (value === none) break;
    if (value === stop) throw new Stop();
    if (isFinalValue(value)) {
      yield getFinalValue(value);
      break;
    }
    if (isMany(value)) {
      const values = getManyValues(value);
      if (i == fns.length) {
        yield* values;
      } else {
        for (let j = 0; j < values.length; ++j) {
          yield* next(values[j], fns, i);
        }
      }
      break;
    }
    if (value && typeof value.next == "function") {
      // generator
      for (;;) {
        let data = value.next();
        if (data && typeof data.then == "function") {
          data = await data;
        }
        if (data.done) break;
        if (i == fns.length) {
          yield data.value;
        } else {
          yield* next(data.value, fns, i);
        }
      }
      break;
    }
    if (i == fns.length) {
      yield value;
      break;
    }
    const f = fns[i];
    value = f(value);
  }
};

export const gen = (...fns: any) => {
  fns = fns
    .filter((fn: any) => fn)
    .flat(Infinity)
    .map((fn: any) => (isFunctionList(fn) ? getFunctionList(fn) : fn))
    .flat(Infinity);
  if (!fns.length) {
    fns = [(x: any) => x];
  }
  let flushed = false;
  let g = async function* (value: any) {
    if (flushed) throw Error("Call to a flushed pipe.");
    if (value !== none) {
      yield* next(value, fns, 0);
    } else {
      flushed = true;
      for (let i = 0; i < fns.length; ++i) {
        const f = fns[i];
        if (isFlushable(f)) {
          yield* next(f(none), fns, i + 1);
        }
      }
    }
  };
  const needToFlush = fns.some((fn: any) => isFlushable(fn));
  if (needToFlush) g = flushable(g);
  return setFunctionList(g, fns);
};

const write = (input: any, chunk: any, encoding: any, callback: any) => {
  let error: any = null;
  try {
    input.write(chunk, encoding, (e: any) => callback(e || error));
  } catch (e) {
    error = e;
  }
};

const final = (input: any, callback: any) => {
  let error: any = null;
  try {
    input.end(null, null, (e: any) => callback(e || error));
  } catch (e) {
    error = e;
  }
};

const read = (output: any) => {
  output.resume();
};

export default function chain(fns: any) {
  fns = fns.flat(Infinity).filter((fn: any) => fn);

  const streams = fns
      .map((fn: any) => (isFunctionList(fn) ? getFunctionList(fn) : fn))
      .flat(Infinity)
      .reduce(groupFunctions, [])
      .map(produceStreams)
      .filter((s: any) => s),
    input = streams[0],
    output = streams.reduce((output: any, item: any) => (output && output.pipe(item)) || item);

  // eslint-disable-next-line prefer-const
  let stream: Duplex; // will be assigned later

  let writeMethod = (chunk: any, encoding: any, callback: any) => write(input, chunk, encoding, callback),
    finalMethod = (callback: any) => final(input, callback),
    readMethod = () => read(output);

  if (!isWritableNodeStream(input)) {
    writeMethod = (_1, _2, callback) => callback(null);
    finalMethod = (callback) => callback(null);
    input.on("end", () => stream.end());
  }

  if (isReadableNodeStream(output)) {
    output.on("data", (chunk: any) => !stream.push(chunk) && output.pause());
    output.on("end", () => stream.push(null));
  } else {
    readMethod = () => {}; // nop
    output.on("finish", () => stream.push(null));
  }

  stream = new Duplex(
    Object.assign(
      { writableObjectMode: true, readableObjectMode: true },
      {
        readable: isReadableNodeStream(output),
        writable: isWritableNodeStream(input),
        write: writeMethod,
        final: finalMethod,
        read: readMethod,
      },
    ),
  );
  // @ts-ignore
  stream.streams = streams;
  // @ts-ignore
  stream.input = input;
  // @ts-ignore
  stream.output = output;

  if (!isReadableNodeStream(output)) {
    stream.resume();
  }

  // connect events
  streams.forEach((item: any) => item.on("error", (error: any) => stream.emit("error", error)));

  return stream;
}
