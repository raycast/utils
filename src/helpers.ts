import crypto, { BinaryLike } from "node:crypto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function replacer(this: any, key: string, _value: unknown) {
  const value = this[key];
  if (value instanceof Date) {
    return `__raycast_cached_date__${value.toString()}`;
  }
  if (Buffer.isBuffer(value)) {
    return `__raycast_cached_buffer__${value.toString("base64")}`;
  }
  return _value;
}

export function reviver(_key: string, value: unknown) {
  if (typeof value === "string" && value.startsWith("__raycast_cached_date__")) {
    return new Date(value.replace("__raycast_cached_date__", ""));
  }
  if (typeof value === "string" && value.startsWith("__raycast_cached_buffer__")) {
    return Buffer.from(value.replace("__raycast_cached_buffer__", ""), "base64");
  }
  return value;
}

export function hash(object: any) {
  const hashingStream = crypto.createHash("sha1");
  const hasher = typeHasher(hashingStream);
  hasher.dispatch(object);

  return hashingStream.digest("hex");
}

/** Check if the given function is a native function */
function isNativeFunction(f: Function) {
  if (typeof f !== "function") {
    return false;
  }
  var exp = /^function\s+\w*\s*\(\s*\)\s*{\s+\[native code\]\s+}$/i;
  return exp.exec(Function.prototype.toString.call(f)) !== null;
}

function hashReplacer(value: any): string {
  if (value instanceof URLSearchParams) {
    return value.toString();
  }
  return value;
}

function typeHasher(
  writeTo:
    | crypto.Hash
    | {
        buf: string;
        write: (b: any) => void;
        end: (b: any) => void;
        read: () => string;
      },
  context: any[] = [],
) {
  function write(str: string) {
    if ("update" in writeTo) {
      return writeTo.update(str, "utf8");
    } else {
      return writeTo.write(str);
    }
  }

  return {
    dispatch: function (value: any) {
      value = hashReplacer(value);

      var type = typeof value;
      if (value === null) {
        this["_null"]();
      } else {
        // @ts-ignore
        this["_" + type](value);
      }
    },
    _object: function (object: any) {
      const pattern = /\[object (.*)\]/i;
      const objString = Object.prototype.toString.call(object);
      let objType = pattern.exec(objString)?.[1] ?? "unknown:[" + objString + "]";
      objType = objType.toLowerCase();

      var objectNumber = null;

      if ((objectNumber = context.indexOf(object)) >= 0) {
        this.dispatch("[CIRCULAR:" + objectNumber + "]");
        return;
      } else {
        context.push(object);
      }

      if (Buffer.isBuffer(object)) {
        write("buffer:");
        return write(object.toString("utf8"));
      }

      if (objType !== "object" && objType !== "function" && objType !== "asyncfunction") {
        // @ts-ignore
        if (this["_" + objType]) {
          // @ts-ignore
          this["_" + objType](object);
        } else {
          throw new Error('Unknown object type "' + objType + '"');
        }
      } else {
        var keys = Object.keys(object);
        keys = keys.sort();
        // Make sure to incorporate special properties, so
        // Types with different prototypes will produce
        // a different hash and objects derived from
        // different functions (`new Foo`, `new Bar`) will
        // produce different hashes.
        // We never do this for native functions since some
        // seem to break because of that.
        if (!isNativeFunction(object)) {
          keys.splice(0, 0, "prototype", "__proto__", "constructor");
        }

        write("object:" + keys.length + ":");
        var self = this;
        return keys.forEach(function (key) {
          self.dispatch(key);
          write(":");
          self.dispatch(object[key]);
          write(",");
        });
      }
    },
    _array: function (arr: any[], unordered: boolean) {
      unordered = typeof unordered !== "undefined" ? unordered : false; // default to options.unorderedArrays

      var self = this;
      write("array:" + arr.length + ":");
      if (!unordered || arr.length <= 1) {
        arr.forEach(function (entry: any) {
          self.dispatch(entry);
        });
        return;
      }

      // the unordered case is a little more complicated:
      // since there is no canonical ordering on objects,
      // i.e. {a:1} < {a:2} and {a:1} > {a:2} are both false,
      // we first serialize each entry using a PassThrough stream
      // before sorting.
      // also: we can’t use the same context array for all entries
      // since the order of hashing should *not* matter. instead,
      // we keep track of the additions to a copy of the context array
      // and add all of them to the global context array when we’re done
      var contextAdditions: any[] = [];
      var entries = arr.map(function (entry: any) {
        var strm = PassThrough();
        var localContext = context.slice(); // make copy
        var hasher = typeHasher(strm, localContext);
        hasher.dispatch(entry);
        // take only what was added to localContext and append it to contextAdditions
        contextAdditions = contextAdditions.concat(localContext.slice(context.length));
        return strm.read().toString();
      });
      context = context.concat(contextAdditions);
      entries.sort();
      this._array(entries, false);
    },
    _date: function (date: Date) {
      write("date:" + date.toJSON());
    },
    _symbol: function (sym: Symbol) {
      write("symbol:" + sym.toString());
    },
    _error: function (err: Error) {
      write("error:" + err.toString());
    },
    _boolean: function (bool: boolean) {
      write("bool:" + bool.toString());
    },
    _string: function (string: string) {
      write("string:" + string.length + ":");
      write(string.toString());
    },
    _function: function (fn: Function) {
      write("fn:");
      if (isNativeFunction(fn)) {
        this.dispatch("[native]");
      } else {
        this.dispatch(fn.toString());
      }

      // Make sure we can still distinguish native functions
      // by their name, otherwise String and Function will
      // have the same hash
      this.dispatch("function-name:" + String(fn.name));

      this._object(fn);
    },
    _number: function (number: number) {
      write("number:" + number.toString());
    },
    _xml: function (xml: any) {
      write("xml:" + xml.toString());
    },
    _null: function () {
      write("Null");
    },
    _undefined: function () {
      write("Undefined");
    },
    _regexp: function (regex: RegExp) {
      write("regex:" + regex.toString());
    },
    _uint8array: function (arr: Uint8Array) {
      write("uint8array:");
      this.dispatch(Array.prototype.slice.call(arr));
    },
    _uint8clampedarray: function (arr: Uint8ClampedArray) {
      write("uint8clampedarray:");
      this.dispatch(Array.prototype.slice.call(arr));
    },
    _int8array: function (arr: Int8Array) {
      write("int8array:");
      this.dispatch(Array.prototype.slice.call(arr));
    },
    _uint16array: function (arr: Uint16Array) {
      write("uint16array:");
      this.dispatch(Array.prototype.slice.call(arr));
    },
    _int16array: function (arr: Int16Array) {
      write("int16array:");
      this.dispatch(Array.prototype.slice.call(arr));
    },
    _uint32array: function (arr: Uint32Array) {
      write("uint32array:");
      this.dispatch(Array.prototype.slice.call(arr));
    },
    _int32array: function (arr: Int32Array) {
      write("int32array:");
      this.dispatch(Array.prototype.slice.call(arr));
    },
    _float32array: function (arr: Float32Array) {
      write("float32array:");
      this.dispatch(Array.prototype.slice.call(arr));
    },
    _float64array: function (arr: Float64Array) {
      write("float64array:");
      this.dispatch(Array.prototype.slice.call(arr));
    },
    _arraybuffer: function (arr: ArrayBuffer) {
      write("arraybuffer:");
      this.dispatch(new Uint8Array(arr));
    },
    _url: function (url: URL) {
      write("url:" + url.toString());
    },
    _map: function (map: Map<any, any>) {
      write("map:");
      var arr = Array.from(map);
      this._array(arr, true);
    },
    _set: function (set: Set<any>) {
      write("set:");
      var arr = Array.from(set);
      this._array(arr, true);
    },
    _file: function (file: File) {
      write("file:");
      this.dispatch([file.name, file.size, file.type, file.lastModified]);
    },
    _blob: function () {
      throw Error(
        "Hashing Blob objects is currently not supported\n" +
          "(see https://github.com/puleos/object-hash/issues/26)\n" +
          'Use "options.replacer" or "options.ignoreUnknown"\n',
      );
    },
    _domwindow: function () {
      write("domwindow");
    },
    _bigint: function (number: BigInt) {
      write("bigint:" + number.toString());
    },
    /* Node.js standard native objects */
    _process: function () {
      write("process");
    },
    _timer: function () {
      write("timer");
    },
    _pipe: function () {
      write("pipe");
    },
    _tcp: function () {
      write("tcp");
    },
    _udp: function () {
      write("udp");
    },
    _tty: function () {
      write("tty");
    },
    _statwatcher: function () {
      write("statwatcher");
    },
    _securecontext: function () {
      write("securecontext");
    },
    _connection: function () {
      write("connection");
    },
    _zlib: function () {
      write("zlib");
    },
    _context: function () {
      write("context");
    },
    _nodescript: function () {
      write("nodescript");
    },
    _httpparser: function () {
      write("httpparser");
    },
    _dataview: function () {
      write("dataview");
    },
    _signal: function () {
      write("signal");
    },
    _fsevent: function () {
      write("fsevent");
    },
    _tlswrap: function () {
      write("tlswrap");
    },
  };
}

// Mini-implementation of stream.PassThrough
// We are far from having need for the full implementation, and we can
// make assumptions like "many writes, then only one final read"
// and we can ignore encoding specifics
function PassThrough() {
  return {
    buf: "",

    write: function (b: string) {
      this.buf += b;
    },

    end: function (b: string) {
      this.buf += b;
    },

    read: function () {
      return this.buf;
    },
  };
}
