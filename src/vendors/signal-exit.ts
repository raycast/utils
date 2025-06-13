/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: since nyc uses this module to output coverage, any lines
// that are in the direct sync flow of nyc's outputCoverage are
// ignored, since we can never get coverage for them.
// grab a reference to node's real process object right away

const processOk = (process: any) =>
  !!process &&
  typeof process === "object" &&
  typeof process.removeListener === "function" &&
  typeof process.emit === "function" &&
  typeof process.reallyExit === "function" &&
  typeof process.listeners === "function" &&
  typeof process.kill === "function" &&
  typeof process.pid === "number" &&
  typeof process.on === "function";
const kExitEmitter = /* #__PURE__ */ Symbol.for("signal-exit emitter");
// teeny special purpose ee
class Emitter {
  emitted = {
    afterExit: false,
    exit: false,
  };
  listeners = {
    afterExit: [],
    exit: [],
  };
  count = 0;
  id = Math.random();
  constructor() {
    // @ts-ignore
    if (global[kExitEmitter]) {
      // @ts-ignore
      return global[kExitEmitter];
    }
    Object.defineProperty(global, kExitEmitter, {
      value: this,
      writable: false,
      enumerable: false,
      configurable: false,
    });
  }
  on(ev: any, fn: any) {
    // @ts-ignore
    this.listeners[ev].push(fn);
  }
  removeListener(ev: any, fn: any) {
    // @ts-ignore
    const list = this.listeners[ev];
    const i = list.indexOf(fn);
    /* c8 ignore start */
    if (i === -1) {
      return;
    }
    /* c8 ignore stop */
    if (i === 0 && list.length === 1) {
      list.length = 0;
    } else {
      list.splice(i, 1);
    }
  }
  emit(ev: any, code: any, signal: any): any {
    // @ts-ignore
    if (this.emitted[ev]) {
      return false;
    }
    // @ts-ignore
    this.emitted[ev] = true;
    let ret = false;
    // @ts-ignore
    for (const fn of this.listeners[ev]) {
      ret = fn(code, signal) === true || ret;
    }
    if (ev === "exit") {
      ret = this.emit("afterExit", code, signal) || ret;
    }
    return ret;
  }
}

class SignalExitFallback {
  onExit() {
    return () => {};
  }
  load() {}
  unload() {}
}
class SignalExit {
  // "SIGHUP" throws an `ENOSYS` error on Windows,
  // so use a supported signal instead
  /* c8 ignore start */
  // @ts-ignore
  #hupSig = process.platform === "win32" ? "SIGINT" : "SIGHUP";
  /* c8 ignore stop */
  #emitter = new Emitter();
  #process: any;
  #originalProcessEmit: any;
  #originalProcessReallyExit: any;
  #sigListeners = {};
  #loaded = false;
  #signals: string[] = [];
  constructor(process: any) {
    /**
     * This is not the set of all possible signals.
     *
     * It IS, however, the set of all signals that trigger
     * an exit on either Linux or BSD systems.  Linux is a
     * superset of the signal names supported on BSD, and
     * the unknown signals just fail to register, so we can
     * catch that easily enough.
     *
     * Windows signals are a different set, since there are
     * signals that terminate Windows processes, but don't
     * terminate (or don't even exist) on Posix systems.
     *
     * Don't bother with SIGKILL.  It's uncatchable, which
     * means that we can't fire any callbacks anyway.
     *
     * If a user does happen to register a handler on a non-
     * fatal signal like SIGWINCH or something, and then
     * exit, it'll end up firing `process.emit('exit')`, so
     * the handler will be fired anyway.
     *
     * SIGBUS, SIGFPE, SIGSEGV and SIGILL, when not raised
     * artificially, inherently leave the process in a
     * state from which it is not safe to try and enter JS
     * listeners.
     */
    this.#signals.push("SIGHUP", "SIGINT", "SIGTERM");
    if (globalThis.process.platform !== "win32") {
      this.#signals.push(
        "SIGALRM",
        "SIGABRT",
        "SIGVTALRM",
        "SIGXCPU",
        "SIGXFSZ",
        "SIGUSR2",
        "SIGTRAP",
        "SIGSYS",
        "SIGQUIT",
        "SIGIOT",
        // should detect profiler and enable/disable accordingly.
        // see #21
        // 'SIGPROF'
      );
    }
    if (globalThis.process.platform === "linux") {
      this.#signals.push("SIGIO", "SIGPOLL", "SIGPWR", "SIGSTKFLT");
    }
    this.#process = process;
    // { <signal>: <listener fn>, ... }
    this.#sigListeners = {};
    for (const sig of this.#signals) {
      // @ts-ignore
      this.#sigListeners[sig] = () => {
        // If there are no other listeners, an exit is coming!
        // Simplest way: remove us and then re-send the signal.
        // We know that this will kill the process, so we can
        // safely emit now.
        const listeners = this.#process.listeners(sig);
        let { count } = this.#emitter;
        // This is a workaround for the fact that signal-exit v3 and signal
        // exit v4 are not aware of each other, and each will attempt to let
        // the other handle it, so neither of them do. To correct this, we
        // detect if we're the only handler *except* for previous versions
        // of signal-exit, and increment by the count of listeners it has
        // created.
        /* c8 ignore start */
        const p = process;
        if (typeof p.__signal_exit_emitter__ === "object" && typeof p.__signal_exit_emitter__.count === "number") {
          count += p.__signal_exit_emitter__.count;
        }
        /* c8 ignore stop */
        if (listeners.length === count) {
          this.unload();
          const ret = this.#emitter.emit("exit", null, sig);
          /* c8 ignore start */
          const s = sig === "SIGHUP" ? this.#hupSig : sig;
          if (!ret) process.kill(process.pid, s);
          /* c8 ignore stop */
        }
      };
    }
    this.#originalProcessReallyExit = process.reallyExit;
    this.#originalProcessEmit = process.emit;
  }
  onExit(cb: any, opts: any) {
    /* c8 ignore start */
    if (!processOk(this.#process)) {
      return () => {};
    }
    /* c8 ignore stop */
    if (this.#loaded === false) {
      this.load();
    }
    const ev = opts?.alwaysLast ? "afterExit" : "exit";
    this.#emitter.on(ev, cb);
    return () => {
      this.#emitter.removeListener(ev, cb);
      if (this.#emitter.listeners["exit"].length === 0 && this.#emitter.listeners["afterExit"].length === 0) {
        this.unload();
      }
    };
  }
  load() {
    if (this.#loaded) {
      return;
    }
    this.#loaded = true;
    // This is the number of onSignalExit's that are in play.
    // It's important so that we can count the correct number of
    // listeners on signals, and don't wait for the other one to
    // handle it instead of us.
    this.#emitter.count += 1;
    for (const sig of this.#signals) {
      try {
        // @ts-ignore
        const fn = this.#sigListeners[sig];
        if (fn) this.#process.on(sig, fn);
      } catch (_) {
        // no-op
      }
    }
    this.#process.emit = (ev: any, ...a: any) => {
      return this.#processEmit(ev, ...a);
    };
    this.#process.reallyExit = (code: any) => {
      return this.#processReallyExit(code);
    };
  }
  unload() {
    if (!this.#loaded) {
      return;
    }
    this.#loaded = false;
    this.#signals.forEach((sig) => {
      // @ts-ignore
      const listener = this.#sigListeners[sig];
      /* c8 ignore start */
      if (!listener) {
        throw new Error("Listener not defined for signal: " + sig);
      }
      /* c8 ignore stop */
      try {
        this.#process.removeListener(sig, listener);
        /* c8 ignore start */
      } catch (_) {
        // no-op
      }
      /* c8 ignore stop */
    });
    this.#process.emit = this.#originalProcessEmit;
    this.#process.reallyExit = this.#originalProcessReallyExit;
    this.#emitter.count -= 1;
  }
  #processReallyExit(code: any) {
    /* c8 ignore start */
    if (!processOk(this.#process)) {
      return 0;
    }
    this.#process.exitCode = code || 0;
    /* c8 ignore stop */
    this.#emitter.emit("exit", this.#process.exitCode, null);
    return this.#originalProcessReallyExit.call(this.#process, this.#process.exitCode);
  }
  #processEmit(ev: any, ...args: any) {
    const og = this.#originalProcessEmit;
    if (ev === "exit" && processOk(this.#process)) {
      if (typeof args[0] === "number") {
        this.#process.exitCode = args[0];
        /* c8 ignore start */
      }
      /* c8 ignore start */
      const ret = og.call(this.#process, ev, ...args);
      /* c8 ignore start */
      this.#emitter.emit("exit", this.#process.exitCode, null);
      /* c8 ignore stop */
      return ret;
    } else {
      return og.call(this.#process, ev, ...args);
    }
  }
}

let signalExit: SignalExit | SignalExitFallback | null = null;

export const onExit = (
  cb: any,
  opts?: {
    alwaysLast?: boolean | undefined;
  },
) => {
  if (!signalExit) {
    signalExit = processOk(process) ? new SignalExit(process) : new SignalExitFallback();
  }
  return signalExit.onExit(cb, opts);
};
