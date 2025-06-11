/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-control-regex */
/* eslint-disable no-useless-escape */
import { flushable, gen, many, none, combineManyMut } from "./stream-chain";
import { StringDecoder } from "node:string_decoder";
import EventEmitter from "node:events";

const fixUtf8Stream = () => {
  const stringDecoder = new StringDecoder();
  let input = "";
  return flushable((chunk: any) => {
    if (chunk === none) {
      const result = input + stringDecoder.end();
      input = "";
      return result;
    }
    if (typeof chunk == "string") {
      if (!input) return chunk;
      const result = input + chunk;
      input = "";
      return result;
    }
    if (chunk instanceof Buffer) {
      const result = input + stringDecoder.write(chunk);
      input = "";
      return result;
    }
    throw new TypeError("Expected a string or a Buffer");
  });
};

const patterns = {
  value1: /[\"\{\[\]\-\d]|true\b|false\b|null\b|\s{1,256}/y,
  string: /[^\x00-\x1f\"\\]{1,256}|\\[bfnrt\"\\\/]|\\u[\da-fA-F]{4}|\"/y,
  key1: /[\"\}]|\s{1,256}/y,
  colon: /\:|\s{1,256}/y,
  comma: /[\,\]\}]|\s{1,256}/y,
  ws: /\s{1,256}/y,
  numberStart: /\d/y,
  numberDigit: /\d{0,256}/y,
  numberFraction: /[\.eE]/y,
  numberExponent: /[eE]/y,
  numberExpSign: /[-+]/y,
};
const MAX_PATTERN_SIZE = 16;

const values: { [key: string]: any } = { true: true, false: false, null: null },
  expected: { [key: string]: string } = { object: "objectStop", array: "arrayStop", "": "done" };

// long hexadecimal codes: \uXXXX
const fromHex = (s: string) => String.fromCharCode(parseInt(s.slice(2), 16));

// short codes: \b \f \n \r \t \" \\ \/
const codes: { [key: string]: string } = {
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
  '"': '"',
  "\\": "\\",
  "/": "/",
};

const jsonParser = (options?: any) => {
  let packKeys = true,
    packStrings = true,
    packNumbers = true,
    streamKeys = true,
    streamStrings = true,
    streamNumbers = true,
    jsonStreaming = false;

  if (options) {
    "packValues" in options && (packKeys = packStrings = packNumbers = options.packValues);
    "packKeys" in options && (packKeys = options.packKeys);
    "packStrings" in options && (packStrings = options.packStrings);
    "packNumbers" in options && (packNumbers = options.packNumbers);
    "streamValues" in options && (streamKeys = streamStrings = streamNumbers = options.streamValues);
    "streamKeys" in options && (streamKeys = options.streamKeys);
    "streamStrings" in options && (streamStrings = options.streamStrings);
    "streamNumbers" in options && (streamNumbers = options.streamNumbers);
    jsonStreaming = options.jsonStreaming;
  }

  !packKeys && (streamKeys = true);
  !packStrings && (streamStrings = true);
  !packNumbers && (streamNumbers = true);

  let done = false,
    expect = jsonStreaming ? "done" : "value",
    parent = "",
    openNumber = false,
    accumulator = "",
    buffer = "";

  const stack: any[] = [];

  return flushable((buf: any) => {
    const tokens: any[] = [];

    if (buf === none) {
      done = true;
    } else {
      buffer += buf;
    }

    let match: any;
    let value: any;
    let index = 0;

    main: for (;;) {
      switch (expect) {
        case "value1":
        case "value":
          patterns.value1.lastIndex = index;
          match = patterns.value1.exec(buffer);
          if (!match) {
            if (done || index + MAX_PATTERN_SIZE < buffer.length) {
              if (index < buffer.length) throw new Error("Parser cannot parse input: expected a value");
              throw new Error("Parser has expected a value");
            }
            break main; // wait for more input
          }
          value = match[0];
          switch (value) {
            case '"':
              if (streamStrings) tokens.push({ name: "startString" });
              expect = "string";
              break;
            case "{":
              tokens.push({ name: "startObject" });
              stack.push(parent);
              parent = "object";
              expect = "key1";
              break;
            case "[":
              tokens.push({ name: "startArray" });
              stack.push(parent);
              parent = "array";
              expect = "value1";
              break;
            case "]":
              if (expect !== "value1") throw new Error("Parser cannot parse input: unexpected token ']'");
              if (openNumber) {
                if (streamNumbers) tokens.push({ name: "endNumber" });
                openNumber = false;
                if (packNumbers) {
                  tokens.push({ name: "numberValue", value: accumulator });
                  accumulator = "";
                }
              }
              tokens.push({ name: "endArray" });
              parent = stack.pop();
              expect = expected[parent];
              break;
            case "-":
              openNumber = true;
              if (streamNumbers) {
                tokens.push({ name: "startNumber" }, { name: "numberChunk", value: "-" });
              }
              packNumbers && (accumulator = "-");
              expect = "numberStart";
              break;
            case "0":
              openNumber = true;
              if (streamNumbers) {
                tokens.push({ name: "startNumber" }, { name: "numberChunk", value: "0" });
              }
              packNumbers && (accumulator = "0");
              expect = "numberFraction";
              break;
            case "1":
            case "2":
            case "3":
            case "4":
            case "5":
            case "6":
            case "7":
            case "8":
            case "9":
              openNumber = true;
              if (streamNumbers) {
                tokens.push({ name: "startNumber" }, { name: "numberChunk", value: value });
              }
              packNumbers && (accumulator = value);
              expect = "numberDigit";
              break;
            case "true":
            case "false":
            case "null":
              if (buffer.length - index === value.length && !done) break main; // wait for more input
              tokens.push({ name: value + "Value", value: values[value] });
              expect = expected[parent];
              break;
            // default: // ws
          }
          index += value.length;
          break;
        case "keyVal":
        case "string":
          patterns.string.lastIndex = index;
          match = patterns.string.exec(buffer);
          if (!match) {
            if (index < buffer.length && (done || buffer.length - index >= 6))
              throw new Error("Parser cannot parse input: escaped characters");
            if (done) throw new Error("Parser has expected a string value");
            break main; // wait for more input
          }
          value = match[0];
          if (value === '"') {
            if (expect === "keyVal") {
              if (streamKeys) tokens.push({ name: "endKey" });
              if (packKeys) {
                tokens.push({ name: "keyValue", value: accumulator });
                accumulator = "";
              }
              expect = "colon";
            } else {
              if (streamStrings) tokens.push({ name: "endString" });
              if (packStrings) {
                tokens.push({ name: "stringValue", value: accumulator });
                accumulator = "";
              }
              expect = expected[parent];
            }
          } else if (value.length > 1 && value.charAt(0) === "\\") {
            const t = value.length == 2 ? codes[value.charAt(1)] : fromHex(value);
            if (expect === "keyVal" ? streamKeys : streamStrings) {
              tokens.push({ name: "stringChunk", value: t });
            }
            if (expect === "keyVal" ? packKeys : packStrings) {
              accumulator += t;
            }
          } else {
            if (expect === "keyVal" ? streamKeys : streamStrings) {
              tokens.push({ name: "stringChunk", value: value });
            }
            if (expect === "keyVal" ? packKeys : packStrings) {
              accumulator += value;
            }
          }
          index += value.length;
          break;
        case "key1":
        case "key":
          patterns.key1.lastIndex = index;
          match = patterns.key1.exec(buffer);
          if (!match) {
            if (index < buffer.length || done) throw new Error("Parser cannot parse input: expected an object key");
            break main; // wait for more input
          }
          value = match[0];
          if (value === '"') {
            if (streamKeys) tokens.push({ name: "startKey" });
            expect = "keyVal";
          } else if (value === "}") {
            if (expect !== "key1") throw new Error("Parser cannot parse input: unexpected token '}'");
            tokens.push({ name: "endObject" });
            parent = stack.pop();
            expect = expected[parent];
          }
          index += value.length;
          break;
        case "colon":
          patterns.colon.lastIndex = index;
          match = patterns.colon.exec(buffer);
          if (!match) {
            if (index < buffer.length || done) throw new Error("Parser cannot parse input: expected ':'");
            break main; // wait for more input
          }
          value = match[0];
          value === ":" && (expect = "value");
          index += value.length;
          break;
        case "arrayStop":
        case "objectStop":
          patterns.comma.lastIndex = index;
          match = patterns.comma.exec(buffer);
          if (!match) {
            if (index < buffer.length || done) throw new Error("Parser cannot parse input: expected ','");
            break main; // wait for more input
          }
          if (openNumber) {
            if (streamNumbers) tokens.push({ name: "endNumber" });
            openNumber = false;
            if (packNumbers) {
              tokens.push({ name: "numberValue", value: accumulator });
              accumulator = "";
            }
          }
          value = match[0];
          if (value === ",") {
            expect = expect === "arrayStop" ? "value" : "key";
          } else if (value === "}" || value === "]") {
            if (value === "}" ? expect === "arrayStop" : expect !== "arrayStop") {
              throw new Error("Parser cannot parse input: expected '" + (expect === "arrayStop" ? "]" : "}") + "'");
            }
            tokens.push({ name: value === "}" ? "endObject" : "endArray" });
            parent = stack.pop();
            expect = expected[parent];
          }
          index += value.length;
          break;
        // number chunks
        case "numberStart": // [0-9]
          patterns.numberStart.lastIndex = index;
          match = patterns.numberStart.exec(buffer);
          if (!match) {
            if (index < buffer.length || done) throw new Error("Parser cannot parse input: expected a starting digit");
            break main; // wait for more input
          }
          value = match[0];
          if (streamNumbers) tokens.push({ name: "numberChunk", value: value });
          packNumbers && (accumulator += value);
          expect = value === "0" ? "numberFraction" : "numberDigit";
          index += value.length;
          break;
        case "numberDigit": // [0-9]*
          patterns.numberDigit.lastIndex = index;
          match = patterns.numberDigit.exec(buffer);
          if (!match) {
            if (index < buffer.length || done) throw new Error("Parser cannot parse input: expected a digit");
            break main; // wait for more input
          }
          value = match[0];
          if (value) {
            if (streamNumbers) tokens.push({ name: "numberChunk", value: value });
            packNumbers && (accumulator += value);
            index += value.length;
          } else {
            if (index < buffer.length) {
              expect = "numberFraction";
              break;
            }
            if (done) {
              expect = expected[parent];
              break;
            }
            break main; // wait for more input
          }
          break;
        case "numberFraction": // [\.eE]?
          patterns.numberFraction.lastIndex = index;
          match = patterns.numberFraction.exec(buffer);
          if (!match) {
            if (index < buffer.length || done) {
              expect = expected[parent];
              break;
            }
            break main; // wait for more input
          }
          value = match[0];
          if (streamNumbers) tokens.push({ name: "numberChunk", value: value });
          packNumbers && (accumulator += value);
          expect = value === "." ? "numberFracStart" : "numberExpSign";
          index += value.length;
          break;
        case "numberFracStart": // [0-9]
          patterns.numberStart.lastIndex = index;
          match = patterns.numberStart.exec(buffer);
          if (!match) {
            if (index < buffer.length || done)
              throw new Error("Parser cannot parse input: expected a fractional part of a number");
            break main; // wait for more input
          }
          value = match[0];
          if (streamNumbers) tokens.push({ name: "numberChunk", value: value });
          packNumbers && (accumulator += value);
          expect = "numberFracDigit";
          index += value.length;
          break;
        case "numberFracDigit": // [0-9]*
          patterns.numberDigit.lastIndex = index;
          match = patterns.numberDigit.exec(buffer);
          value = match[0];
          if (value) {
            if (streamNumbers) tokens.push({ name: "numberChunk", value: value });
            packNumbers && (accumulator += value);
            index += value.length;
          } else {
            if (index < buffer.length) {
              expect = "numberExponent";
              break;
            }
            if (done) {
              expect = expected[parent];
              break;
            }
            break main; // wait for more input
          }
          break;
        case "numberExponent": // [eE]?
          patterns.numberExponent.lastIndex = index;
          match = patterns.numberExponent.exec(buffer);
          if (!match) {
            if (index < buffer.length) {
              expect = expected[parent];
              break;
            }
            if (done) {
              expect = "done";
              break;
            }
            break main; // wait for more input
          }
          value = match[0];
          if (streamNumbers) tokens.push({ name: "numberChunk", value: value });
          packNumbers && (accumulator += value);
          expect = "numberExpSign";
          index += value.length;
          break;
        case "numberExpSign": // [-+]?
          patterns.numberExpSign.lastIndex = index;
          match = patterns.numberExpSign.exec(buffer);
          if (!match) {
            if (index < buffer.length) {
              expect = "numberExpStart";
              break;
            }
            if (done) throw new Error("Parser has expected an exponent value of a number");
            break main; // wait for more input
          }
          value = match[0];
          if (streamNumbers) tokens.push({ name: "numberChunk", value: value });
          packNumbers && (accumulator += value);
          expect = "numberExpStart";
          index += value.length;
          break;
        case "numberExpStart": // [0-9]
          patterns.numberStart.lastIndex = index;
          match = patterns.numberStart.exec(buffer);
          if (!match) {
            if (index < buffer.length || done)
              throw new Error("Parser cannot parse input: expected an exponent part of a number");
            break main; // wait for more input
          }
          value = match[0];
          if (streamNumbers) tokens.push({ name: "numberChunk", value: value });
          packNumbers && (accumulator += value);
          expect = "numberExpDigit";
          index += value.length;
          break;
        case "numberExpDigit": // [0-9]*
          patterns.numberDigit.lastIndex = index;
          match = patterns.numberDigit.exec(buffer);
          value = match[0];
          if (value) {
            if (streamNumbers) tokens.push({ name: "numberChunk", value: value });
            packNumbers && (accumulator += value);
            index += value.length;
          } else {
            if (index < buffer.length || done) {
              expect = expected[parent];
              break;
            }
            break main; // wait for more input
          }
          break;
        case "done":
          patterns.ws.lastIndex = index;
          match = patterns.ws.exec(buffer);
          if (!match) {
            if (index < buffer.length) {
              if (jsonStreaming) {
                expect = "value";
                break;
              }
              throw new Error("Parser cannot parse input: unexpected characters");
            }
            break main; // wait for more input
          }
          value = match[0];
          if (openNumber) {
            if (streamNumbers) tokens.push({ name: "endNumber" });
            openNumber = false;
            if (packNumbers) {
              tokens.push({ name: "numberValue", value: accumulator });
              accumulator = "";
            }
          }
          index += value.length;
          break;
      }
    }
    if (done && openNumber) {
      if (streamNumbers) tokens.push({ name: "endNumber" });
      openNumber = false;
      if (packNumbers) {
        tokens.push({ name: "numberValue", value: accumulator });
        accumulator = "";
      }
    }
    buffer = buffer.slice(index);
    return tokens.length ? many(tokens) : none;
  });
};

export const parser = (options?: any) => gen(fixUtf8Stream(), jsonParser(options));

const withParser = (fn: any, options?: any) => gen(parser(options), fn(options));

const checkableTokens = {
    startObject: 1,
    startArray: 1,
    startString: 1,
    startNumber: 1,
    nullValue: 1,
    trueValue: 1,
    falseValue: 1,
    stringValue: 1,
    numberValue: 1,
  },
  stopTokens = {
    startObject: "endObject",
    startArray: "endArray",
    startString: "endString",
    startNumber: "endNumber",
  },
  optionalTokens = { endString: "stringValue", endNumber: "numberValue" };

const defaultFilter = (_stack: string[], _a: any) => true;

const stringFilter = (string: string, separator: string) => {
  const stringWithSeparator = string + separator;
  return (stack: string[], _a: any) => {
    const path = stack.join(separator);
    return path === string || path.startsWith(stringWithSeparator);
  };
};

const regExpFilter = (regExp: RegExp, separator: string) => {
  return (stack: string[], _a: any) => regExp.test(stack.join(separator));
};

const filterBase =
  ({
    specialAction = "accept",
    defaultAction = "ignore",
    nonCheckableAction = "process-key",
    transition = undefined as any,
  } = {}) =>
  (options: any) => {
    const once = options?.once,
      separator = options?.pathSeparator || ".";
    let filter = defaultFilter,
      streamKeys = true;
    if (options) {
      if (typeof options.filter == "function") {
        filter = options.filter;
      } else if (typeof options.filter == "string") {
        filter = stringFilter(options.filter, separator);
      } else if (options.filter instanceof RegExp) {
        filter = regExpFilter(options.filter, separator);
      }
      if ("streamValues" in options) streamKeys = options.streamValues;
      if ("streamKeys" in options) streamKeys = options.streamKeys;
    }
    const sanitizedOptions = Object.assign({}, options, { filter, streamKeys, separator });
    let state = "check";
    const stack: any[] = [];
    let depth = 0,
      previousToken = "",
      endToken = "",
      optionalToken = "",
      startTransition = false;
    return flushable((chunk) => {
      // the flush
      if (chunk === none) return transition ? transition([], null, "flush", sanitizedOptions) : none;

      // process the optional value token (unfinished)
      if (optionalToken) {
        if (optionalToken === chunk.name) {
          let returnToken = none;
          switch (state) {
            case "process-key":
              stack[stack.length - 1] = chunk.value;
              state = "check";
              break;
            case "accept-value":
              returnToken = chunk;
              state = once ? "pass" : "check";
              break;
            default:
              state = once ? "all" : "check";
              break;
          }
          optionalToken = "";
          return returnToken;
        }
        optionalToken = "";
        state = once && state !== "process-key" ? "pass" : "check";
      }

      let returnToken: any = none;

      recheck: for (;;) {
        // accept/reject tokens
        switch (state) {
          case "process-key":
            if (chunk.name === "endKey") optionalToken = "keyValue";
            return none;
          case "pass":
            return none;
          case "all":
            return chunk;
          case "accept":
          case "reject":
            if (startTransition) {
              startTransition = false;
              returnToken = transition(stack, chunk, state, sanitizedOptions) || none;
            }
            switch (chunk.name) {
              case "startObject":
              case "startArray":
                ++depth;
                break;
              case "endObject":
              case "endArray":
                --depth;
                break;
            }
            if (state === "accept") {
              returnToken = combineManyMut(returnToken, chunk);
            }
            if (!depth) {
              if (once) {
                state = state === "accept" ? "pass" : "all";
              } else {
                state = "check";
              }
            }
            return returnToken;
          case "accept-value":
          case "reject-value":
            if (startTransition) {
              startTransition = false;
              returnToken = transition(stack, chunk, state, sanitizedOptions) || none;
            }
            if (state === "accept-value") {
              returnToken = combineManyMut(returnToken, chunk);
            }
            if (chunk.name === endToken) {
              // @ts-ignore
              optionalToken = optionalTokens[endToken] || "";
              endToken = "";
              if (!optionalToken) {
                if (once) {
                  state = state === "accept-value" ? "pass" : "all";
                } else {
                  state = "check";
                }
              }
            }
            return returnToken;
        }

        // update the last index in the stack
        if (typeof stack[stack.length - 1] == "number") {
          // array
          switch (chunk.name) {
            case "startObject":
            case "startArray":
            case "startString":
            case "startNumber":
            case "nullValue":
            case "trueValue":
            case "falseValue":
              ++stack[stack.length - 1];
              break;
            case "numberValue":
              if (previousToken !== "endNumber") ++stack[stack.length - 1];
              break;
            case "stringValue":
              if (previousToken !== "endString") ++stack[stack.length - 1];
              break;
          }
        } else {
          if (chunk.name === "keyValue") stack[stack.length - 1] = chunk.value;
        }
        previousToken = chunk.name;

        // check the token
        const action =
          // @ts-ignore
          checkableTokens[chunk.name] !== 1 ? nonCheckableAction : filter(stack, chunk) ? specialAction : defaultAction;

        // @ts-ignore
        endToken = stopTokens[chunk.name] || "";
        switch (action) {
          case "process-key":
            if (chunk.name === "startKey") {
              state = "process-key";
              continue recheck;
            }
            break;
          case "accept-token":
            // @ts-ignore
            if (endToken && optionalTokens[endToken]) {
              state = "accept-value";
              startTransition = !!transition;
              continue recheck;
            }
            if (transition) returnToken = transition(stack, chunk, action, sanitizedOptions);
            returnToken = combineManyMut(returnToken, chunk);
            break;
          case "accept":
            if (endToken) {
              // @ts-ignore
              state = optionalTokens[endToken] ? "accept-value" : "accept";
              startTransition = !!transition;
              continue recheck;
            }
            if (transition) returnToken = transition(stack, chunk, action, sanitizedOptions);
            returnToken = combineManyMut(returnToken, chunk);
            break;
          case "reject":
            if (endToken) {
              // @ts-ignore
              state = optionalTokens[endToken] ? "reject-value" : "reject";
              startTransition = !!transition;
              continue recheck;
            }
            if (transition) returnToken = transition(stack, chunk, action, sanitizedOptions);
            break;
          case "pass":
            state = "pass";
            continue recheck;
        }

        break;
      }

      // update the stack
      switch (chunk.name) {
        case "startObject":
          stack.push(null);
          break;
        case "startArray":
          stack.push(-1);
          break;
        case "endObject":
        case "endArray":
          stack.pop();
          break;
      }

      return returnToken;
    });
  };

export const PickParser = (options?: any) => withParser(filterBase(), Object.assign({ packKeys: true }, options));

class Counter {
  depth: number;
  constructor(initialDepth: number) {
    this.depth = initialDepth;
  }
  startObject() {
    ++this.depth;
  }
  endObject() {
    --this.depth;
  }
  startArray() {
    ++this.depth;
  }
  endArray() {
    --this.depth;
  }
}

class Assembler extends EventEmitter {
  static connectTo(stream: any, options: any) {
    return new Assembler(options).connectTo(stream);
  }

  stack: any;
  current: any;
  key: any;
  done: boolean;
  reviver: any;
  // @ts-ignore
  stringValue: (value: string) => void;
  tapChain: (chunk: any) => any;

  constructor(options: any) {
    super();
    this.stack = [];
    this.current = this.key = null;
    this.done = true;
    if (options) {
      this.reviver = typeof options.reviver == "function" && options.reviver;
      if (this.reviver) {
        this.stringValue = this._saveValue = this._saveValueWithReviver;
      }
      if (options.numberAsString) {
        // @ts-ignore
        this.numberValue = this.stringValue;
      }
    }

    this.tapChain = (chunk) => {
      // @ts-ignore
      if (this[chunk.name]) {
        // @ts-ignore
        this[chunk.name](chunk.value);
        if (this.done) return this.current;
      }
      return none;
    };

    this.stringValue = this._saveValue;
  }

  connectTo(stream: any) {
    stream.on("data", (chunk: any) => {
      // @ts-ignore
      if (this[chunk.name]) {
        // @ts-ignore
        this[chunk.name](chunk.value);
        // @ts-ignore
        if (this.done) this.emit("done", this);
      }
    });
    return this;
  }

  get depth() {
    return (this.stack.length >> 1) + (this.done ? 0 : 1);
  }

  get path() {
    const path: any[] = [];
    for (let i = 0; i < this.stack.length; i += 2) {
      const key = this.stack[i + 1];
      path.push(key === null ? this.stack[i].length : key);
    }
    return path;
  }

  dropToLevel(level: any) {
    if (level < this.depth) {
      if (level > 0) {
        const index = (level - 1) << 1;
        this.current = this.stack[index];
        this.key = this.stack[index + 1];
        this.stack.splice(index);
      } else {
        this.stack = [];
        this.current = this.key = null;
        this.done = true;
      }
    }
    return this;
  }

  consume(chunk: any) {
    // @ts-ignore
    this[chunk.name] && this[chunk.name](chunk.value);
    return this;
  }

  keyValue(value: any) {
    this.key = value;
  }

  //stringValue() - aliased below to _saveValue()

  numberValue(value: any) {
    this._saveValue(parseFloat(value));
  }
  nullValue() {
    this._saveValue(null);
  }
  trueValue() {
    this._saveValue(true);
  }
  falseValue() {
    this._saveValue(false);
  }

  startObject() {
    if (this.done) {
      this.done = false;
    } else {
      this.stack.push(this.current, this.key);
    }
    this.current = new Object();
    this.key = null;
  }

  endObject() {
    if (this.stack.length) {
      const value = this.current;
      this.key = this.stack.pop();
      this.current = this.stack.pop();
      this._saveValue(value);
    } else {
      this.done = true;
    }
  }

  startArray() {
    if (this.done) {
      this.done = false;
    } else {
      this.stack.push(this.current, this.key);
    }
    this.current = [];
    this.key = null;
  }

  endArray() {
    if (this.stack.length) {
      const value = this.current;
      this.key = this.stack.pop();
      this.current = this.stack.pop();
      this._saveValue(value);
    } else {
      this.done = true;
    }
  }

  _saveValue(value: any) {
    if (this.done) {
      this.current = value;
    } else {
      if (this.current instanceof Array) {
        this.current.push(value);
      } else {
        this.current[this.key] = value;
        this.key = null;
      }
    }
  }
  _saveValueWithReviver(value: any) {
    if (this.done) {
      this.current = this.reviver("", value);
    } else {
      if (this.current instanceof Array) {
        value = this.reviver("" + this.current.length, value);
        this.current.push(value);
        if (value === undefined) {
          delete this.current[this.current.length - 1];
        }
      } else {
        value = this.reviver(this.key, value);
        if (value !== undefined) {
          this.current[this.key] = value;
        }
        this.key = null;
      }
    }
  }
}

const streamBase =
  ({ push, first, level }: any) =>
  (options = {} as any) => {
    const { objectFilter, includeUndecided } = options;
    let asm = new Assembler(options) as any,
      state = first ? "first" : "check",
      savedAsm = null as any;

    if (typeof objectFilter != "function") {
      // no object filter + no first check
      if (state === "check")
        return (chunk: any) => {
          if (asm[chunk.name]) {
            asm[chunk.name](chunk.value);
            if (asm.depth === level) {
              return push(asm);
            }
          }
          return none;
        };
      // no object filter
      return (chunk: any) => {
        switch (state) {
          case "first":
            first(chunk);
            state = "accept";
          // fall through
          case "accept":
            if (asm[chunk.name]) {
              asm[chunk.name](chunk.value);
              if (asm.depth === level) {
                return push(asm);
              }
            }
            break;
        }
        return none;
      };
    }

    // object filter + a possible first check
    return (chunk: any) => {
      switch (state) {
        case "first":
          first(chunk);
          state = "check";
        // fall through
        case "check":
          if (asm[chunk.name]) {
            asm[chunk.name](chunk.value);
            const result = objectFilter(asm);
            if (result) {
              state = "accept";
              if (asm.depth === level) return push(asm);
            } else if (result === false) {
              if (asm.depth === level) return push(asm, true);
              state = "reject";
              savedAsm = asm;
              asm = new Counter(savedAsm.depth);
              savedAsm.dropToLevel(level);
            } else {
              if (asm.depth === level) return push(asm, !includeUndecided);
            }
          }
          break;
        case "accept":
          if (asm[chunk.name]) {
            asm[chunk.name](chunk.value);
            if (asm.depth === level) {
              state = "check";
              return push(asm);
            }
          }
          break;
        case "reject":
          if (asm[chunk.name]) {
            asm[chunk.name](chunk.value);
            if (asm.depth === level) {
              state = "check";
              asm = savedAsm;
              savedAsm = null;
              return push(asm, true);
            }
          }
          break;
      }
      return none;
    };
  };

export const StreamArray = (options?: any) => {
  let key = 0;
  return streamBase({
    level: 1,

    first(chunk: any) {
      if (chunk.name !== "startArray") throw new Error("Top-level object should be an array.");
    },

    push(asm: any, discard: any) {
      if (asm.current.length) {
        if (discard) {
          ++key;
          asm.current.pop();
        } else {
          return { key: key++, value: asm.current.pop() };
        }
      }
      return none;
    },
  })(options);
};
