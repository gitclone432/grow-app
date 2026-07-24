(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __export = (target, all3) => {
    for (var name in all3)
      __defProp(target, name, { get: all3[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // node_modules/axios/lib/helpers/bind.js
  function bind(fn, thisArg) {
    return function wrap() {
      return fn.apply(thisArg, arguments);
    };
  }
  var init_bind = __esm({
    "node_modules/axios/lib/helpers/bind.js"() {
      "use strict";
    }
  });

  // node_modules/axios/lib/utils.js
  function isBuffer(val) {
    return val !== null && !isUndefined(val) && val.constructor !== null && !isUndefined(val.constructor) && isFunction(val.constructor.isBuffer) && val.constructor.isBuffer(val);
  }
  function isArrayBufferView(val) {
    let result;
    if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView) {
      result = ArrayBuffer.isView(val);
    } else {
      result = val && val.buffer && isArrayBuffer(val.buffer);
    }
    return result;
  }
  function forEach(obj, fn, { allOwnKeys = false } = {}) {
    if (obj === null || typeof obj === "undefined") {
      return;
    }
    let i;
    let l;
    if (typeof obj !== "object") {
      obj = [obj];
    }
    if (isArray(obj)) {
      for (i = 0, l = obj.length; i < l; i++) {
        fn.call(null, obj[i], i, obj);
      }
    } else {
      if (isBuffer(obj)) {
        return;
      }
      const keys = allOwnKeys ? Object.getOwnPropertyNames(obj) : Object.keys(obj);
      const len = keys.length;
      let key;
      for (i = 0; i < len; i++) {
        key = keys[i];
        fn.call(null, obj[key], key, obj);
      }
    }
  }
  function findKey(obj, key) {
    if (isBuffer(obj)) {
      return null;
    }
    key = key.toLowerCase();
    const keys = Object.keys(obj);
    let i = keys.length;
    let _key;
    while (i-- > 0) {
      _key = keys[i];
      if (key === _key.toLowerCase()) {
        return _key;
      }
    }
    return null;
  }
  function merge() {
    const { caseless, skipUndefined } = isContextDefined(this) && this || {};
    const result = {};
    const assignValue = (val, key) => {
      const targetKey = caseless && findKey(result, key) || key;
      if (isPlainObject(result[targetKey]) && isPlainObject(val)) {
        result[targetKey] = merge(result[targetKey], val);
      } else if (isPlainObject(val)) {
        result[targetKey] = merge({}, val);
      } else if (isArray(val)) {
        result[targetKey] = val.slice();
      } else if (!skipUndefined || !isUndefined(val)) {
        result[targetKey] = val;
      }
    };
    for (let i = 0, l = arguments.length; i < l; i++) {
      arguments[i] && forEach(arguments[i], assignValue);
    }
    return result;
  }
  function isSpecCompliantForm(thing) {
    return !!(thing && isFunction(thing.append) && thing[toStringTag] === "FormData" && thing[iterator]);
  }
  var toString, getPrototypeOf, iterator, toStringTag, kindOf, kindOfTest, typeOfTest, isArray, isUndefined, isArrayBuffer, isString, isFunction, isNumber, isObject, isBoolean, isPlainObject, isEmptyObject, isDate, isFile, isBlob, isFileList, isStream, isFormData, isURLSearchParams, isReadableStream, isRequest, isResponse, isHeaders, trim, _global, isContextDefined, extend, stripBOM, inherits, toFlatObject, endsWith, toArray, isTypedArray, forEachEntry, matchAll, isHTMLForm, toCamelCase, hasOwnProperty, isRegExp, reduceDescriptors, freezeMethods, toObjectSet, noop, toFiniteNumber, toJSONObject, isAsyncFn, isThenable, _setImmediate, asap, isIterable, utils_default;
  var init_utils = __esm({
    "node_modules/axios/lib/utils.js"() {
      "use strict";
      init_bind();
      ({ toString } = Object.prototype);
      ({ getPrototypeOf } = Object);
      ({ iterator, toStringTag } = Symbol);
      kindOf = /* @__PURE__ */ ((cache) => (thing) => {
        const str = toString.call(thing);
        return cache[str] || (cache[str] = str.slice(8, -1).toLowerCase());
      })(/* @__PURE__ */ Object.create(null));
      kindOfTest = (type) => {
        type = type.toLowerCase();
        return (thing) => kindOf(thing) === type;
      };
      typeOfTest = (type) => (thing) => typeof thing === type;
      ({ isArray } = Array);
      isUndefined = typeOfTest("undefined");
      isArrayBuffer = kindOfTest("ArrayBuffer");
      isString = typeOfTest("string");
      isFunction = typeOfTest("function");
      isNumber = typeOfTest("number");
      isObject = (thing) => thing !== null && typeof thing === "object";
      isBoolean = (thing) => thing === true || thing === false;
      isPlainObject = (val) => {
        if (kindOf(val) !== "object") {
          return false;
        }
        const prototype3 = getPrototypeOf(val);
        return (prototype3 === null || prototype3 === Object.prototype || Object.getPrototypeOf(prototype3) === null) && !(toStringTag in val) && !(iterator in val);
      };
      isEmptyObject = (val) => {
        if (!isObject(val) || isBuffer(val)) {
          return false;
        }
        try {
          return Object.keys(val).length === 0 && Object.getPrototypeOf(val) === Object.prototype;
        } catch (e) {
          return false;
        }
      };
      isDate = kindOfTest("Date");
      isFile = kindOfTest("File");
      isBlob = kindOfTest("Blob");
      isFileList = kindOfTest("FileList");
      isStream = (val) => isObject(val) && isFunction(val.pipe);
      isFormData = (thing) => {
        let kind;
        return thing && (typeof FormData === "function" && thing instanceof FormData || isFunction(thing.append) && ((kind = kindOf(thing)) === "formdata" || // detect form-data instance
        kind === "object" && isFunction(thing.toString) && thing.toString() === "[object FormData]"));
      };
      isURLSearchParams = kindOfTest("URLSearchParams");
      [isReadableStream, isRequest, isResponse, isHeaders] = ["ReadableStream", "Request", "Response", "Headers"].map(kindOfTest);
      trim = (str) => str.trim ? str.trim() : str.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, "");
      _global = (() => {
        if (typeof globalThis !== "undefined") return globalThis;
        return typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : global;
      })();
      isContextDefined = (context) => !isUndefined(context) && context !== _global;
      extend = (a, b, thisArg, { allOwnKeys } = {}) => {
        forEach(b, (val, key) => {
          if (thisArg && isFunction(val)) {
            a[key] = bind(val, thisArg);
          } else {
            a[key] = val;
          }
        }, { allOwnKeys });
        return a;
      };
      stripBOM = (content) => {
        if (content.charCodeAt(0) === 65279) {
          content = content.slice(1);
        }
        return content;
      };
      inherits = (constructor, superConstructor, props, descriptors2) => {
        constructor.prototype = Object.create(superConstructor.prototype, descriptors2);
        constructor.prototype.constructor = constructor;
        Object.defineProperty(constructor, "super", {
          value: superConstructor.prototype
        });
        props && Object.assign(constructor.prototype, props);
      };
      toFlatObject = (sourceObj, destObj, filter2, propFilter) => {
        let props;
        let i;
        let prop;
        const merged = {};
        destObj = destObj || {};
        if (sourceObj == null) return destObj;
        do {
          props = Object.getOwnPropertyNames(sourceObj);
          i = props.length;
          while (i-- > 0) {
            prop = props[i];
            if ((!propFilter || propFilter(prop, sourceObj, destObj)) && !merged[prop]) {
              destObj[prop] = sourceObj[prop];
              merged[prop] = true;
            }
          }
          sourceObj = filter2 !== false && getPrototypeOf(sourceObj);
        } while (sourceObj && (!filter2 || filter2(sourceObj, destObj)) && sourceObj !== Object.prototype);
        return destObj;
      };
      endsWith = (str, searchString, position) => {
        str = String(str);
        if (position === void 0 || position > str.length) {
          position = str.length;
        }
        position -= searchString.length;
        const lastIndex = str.indexOf(searchString, position);
        return lastIndex !== -1 && lastIndex === position;
      };
      toArray = (thing) => {
        if (!thing) return null;
        if (isArray(thing)) return thing;
        let i = thing.length;
        if (!isNumber(i)) return null;
        const arr = new Array(i);
        while (i-- > 0) {
          arr[i] = thing[i];
        }
        return arr;
      };
      isTypedArray = /* @__PURE__ */ ((TypedArray) => {
        return (thing) => {
          return TypedArray && thing instanceof TypedArray;
        };
      })(typeof Uint8Array !== "undefined" && getPrototypeOf(Uint8Array));
      forEachEntry = (obj, fn) => {
        const generator = obj && obj[iterator];
        const _iterator = generator.call(obj);
        let result;
        while ((result = _iterator.next()) && !result.done) {
          const pair = result.value;
          fn.call(obj, pair[0], pair[1]);
        }
      };
      matchAll = (regExp, str) => {
        let matches;
        const arr = [];
        while ((matches = regExp.exec(str)) !== null) {
          arr.push(matches);
        }
        return arr;
      };
      isHTMLForm = kindOfTest("HTMLFormElement");
      toCamelCase = (str) => {
        return str.toLowerCase().replace(
          /[-_\s]([a-z\d])(\w*)/g,
          function replacer(m, p1, p2) {
            return p1.toUpperCase() + p2;
          }
        );
      };
      hasOwnProperty = (({ hasOwnProperty: hasOwnProperty2 }) => (obj, prop) => hasOwnProperty2.call(obj, prop))(Object.prototype);
      isRegExp = kindOfTest("RegExp");
      reduceDescriptors = (obj, reducer) => {
        const descriptors2 = Object.getOwnPropertyDescriptors(obj);
        const reducedDescriptors = {};
        forEach(descriptors2, (descriptor, name) => {
          let ret;
          if ((ret = reducer(descriptor, name, obj)) !== false) {
            reducedDescriptors[name] = ret || descriptor;
          }
        });
        Object.defineProperties(obj, reducedDescriptors);
      };
      freezeMethods = (obj) => {
        reduceDescriptors(obj, (descriptor, name) => {
          if (isFunction(obj) && ["arguments", "caller", "callee"].indexOf(name) !== -1) {
            return false;
          }
          const value = obj[name];
          if (!isFunction(value)) return;
          descriptor.enumerable = false;
          if ("writable" in descriptor) {
            descriptor.writable = false;
            return;
          }
          if (!descriptor.set) {
            descriptor.set = () => {
              throw Error("Can not rewrite read-only method '" + name + "'");
            };
          }
        });
      };
      toObjectSet = (arrayOrString, delimiter) => {
        const obj = {};
        const define = (arr) => {
          arr.forEach((value) => {
            obj[value] = true;
          });
        };
        isArray(arrayOrString) ? define(arrayOrString) : define(String(arrayOrString).split(delimiter));
        return obj;
      };
      noop = () => {
      };
      toFiniteNumber = (value, defaultValue) => {
        return value != null && Number.isFinite(value = +value) ? value : defaultValue;
      };
      toJSONObject = (obj) => {
        const stack = new Array(10);
        const visit = (source, i) => {
          if (isObject(source)) {
            if (stack.indexOf(source) >= 0) {
              return;
            }
            if (isBuffer(source)) {
              return source;
            }
            if (!("toJSON" in source)) {
              stack[i] = source;
              const target = isArray(source) ? [] : {};
              forEach(source, (value, key) => {
                const reducedValue = visit(value, i + 1);
                !isUndefined(reducedValue) && (target[key] = reducedValue);
              });
              stack[i] = void 0;
              return target;
            }
          }
          return source;
        };
        return visit(obj, 0);
      };
      isAsyncFn = kindOfTest("AsyncFunction");
      isThenable = (thing) => thing && (isObject(thing) || isFunction(thing)) && isFunction(thing.then) && isFunction(thing.catch);
      _setImmediate = ((setImmediateSupported, postMessageSupported) => {
        if (setImmediateSupported) {
          return setImmediate;
        }
        return postMessageSupported ? ((token, callbacks) => {
          _global.addEventListener("message", ({ source, data }) => {
            if (source === _global && data === token) {
              callbacks.length && callbacks.shift()();
            }
          }, false);
          return (cb) => {
            callbacks.push(cb);
            _global.postMessage(token, "*");
          };
        })(`axios@${Math.random()}`, []) : (cb) => setTimeout(cb);
      })(
        typeof setImmediate === "function",
        isFunction(_global.postMessage)
      );
      asap = typeof queueMicrotask !== "undefined" ? queueMicrotask.bind(_global) : typeof process !== "undefined" && process.nextTick || _setImmediate;
      isIterable = (thing) => thing != null && isFunction(thing[iterator]);
      utils_default = {
        isArray,
        isArrayBuffer,
        isBuffer,
        isFormData,
        isArrayBufferView,
        isString,
        isNumber,
        isBoolean,
        isObject,
        isPlainObject,
        isEmptyObject,
        isReadableStream,
        isRequest,
        isResponse,
        isHeaders,
        isUndefined,
        isDate,
        isFile,
        isBlob,
        isRegExp,
        isFunction,
        isStream,
        isURLSearchParams,
        isTypedArray,
        isFileList,
        forEach,
        merge,
        extend,
        trim,
        stripBOM,
        inherits,
        toFlatObject,
        kindOf,
        kindOfTest,
        endsWith,
        toArray,
        forEachEntry,
        matchAll,
        isHTMLForm,
        hasOwnProperty,
        hasOwnProp: hasOwnProperty,
        // an alias to avoid ESLint no-prototype-builtins detection
        reduceDescriptors,
        freezeMethods,
        toObjectSet,
        toCamelCase,
        noop,
        toFiniteNumber,
        findKey,
        global: _global,
        isContextDefined,
        isSpecCompliantForm,
        toJSONObject,
        isAsyncFn,
        isThenable,
        setImmediate: _setImmediate,
        asap,
        isIterable
      };
    }
  });

  // node_modules/axios/lib/core/AxiosError.js
  function AxiosError(message, code, config, request, response) {
    Error.call(this);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = new Error().stack;
    }
    this.message = message;
    this.name = "AxiosError";
    code && (this.code = code);
    config && (this.config = config);
    request && (this.request = request);
    if (response) {
      this.response = response;
      this.status = response.status ? response.status : null;
    }
  }
  var prototype, descriptors, AxiosError_default;
  var init_AxiosError = __esm({
    "node_modules/axios/lib/core/AxiosError.js"() {
      "use strict";
      init_utils();
      utils_default.inherits(AxiosError, Error, {
        toJSON: function toJSON() {
          return {
            // Standard
            message: this.message,
            name: this.name,
            // Microsoft
            description: this.description,
            number: this.number,
            // Mozilla
            fileName: this.fileName,
            lineNumber: this.lineNumber,
            columnNumber: this.columnNumber,
            stack: this.stack,
            // Axios
            config: utils_default.toJSONObject(this.config),
            code: this.code,
            status: this.status
          };
        }
      });
      prototype = AxiosError.prototype;
      descriptors = {};
      [
        "ERR_BAD_OPTION_VALUE",
        "ERR_BAD_OPTION",
        "ECONNABORTED",
        "ETIMEDOUT",
        "ERR_NETWORK",
        "ERR_FR_TOO_MANY_REDIRECTS",
        "ERR_DEPRECATED",
        "ERR_BAD_RESPONSE",
        "ERR_BAD_REQUEST",
        "ERR_CANCELED",
        "ERR_NOT_SUPPORT",
        "ERR_INVALID_URL"
        // eslint-disable-next-line func-names
      ].forEach((code) => {
        descriptors[code] = { value: code };
      });
      Object.defineProperties(AxiosError, descriptors);
      Object.defineProperty(prototype, "isAxiosError", { value: true });
      AxiosError.from = (error, code, config, request, response, customProps) => {
        const axiosError = Object.create(prototype);
        utils_default.toFlatObject(error, axiosError, function filter2(obj) {
          return obj !== Error.prototype;
        }, (prop) => {
          return prop !== "isAxiosError";
        });
        const msg = error && error.message ? error.message : "Error";
        const errCode = code == null && error ? error.code : code;
        AxiosError.call(axiosError, msg, errCode, config, request, response);
        if (error && axiosError.cause == null) {
          Object.defineProperty(axiosError, "cause", { value: error, configurable: true });
        }
        axiosError.name = error && error.name || "Error";
        customProps && Object.assign(axiosError, customProps);
        return axiosError;
      };
      AxiosError_default = AxiosError;
    }
  });

  // node_modules/axios/lib/helpers/null.js
  var null_default;
  var init_null = __esm({
    "node_modules/axios/lib/helpers/null.js"() {
      null_default = null;
    }
  });

  // node_modules/axios/lib/helpers/toFormData.js
  function isVisitable(thing) {
    return utils_default.isPlainObject(thing) || utils_default.isArray(thing);
  }
  function removeBrackets(key) {
    return utils_default.endsWith(key, "[]") ? key.slice(0, -2) : key;
  }
  function renderKey(path, key, dots) {
    if (!path) return key;
    return path.concat(key).map(function each(token, i) {
      token = removeBrackets(token);
      return !dots && i ? "[" + token + "]" : token;
    }).join(dots ? "." : "");
  }
  function isFlatArray(arr) {
    return utils_default.isArray(arr) && !arr.some(isVisitable);
  }
  function toFormData(obj, formData, options) {
    if (!utils_default.isObject(obj)) {
      throw new TypeError("target must be an object");
    }
    formData = formData || new (null_default || FormData)();
    options = utils_default.toFlatObject(options, {
      metaTokens: true,
      dots: false,
      indexes: false
    }, false, function defined(option, source) {
      return !utils_default.isUndefined(source[option]);
    });
    const metaTokens = options.metaTokens;
    const visitor = options.visitor || defaultVisitor;
    const dots = options.dots;
    const indexes = options.indexes;
    const _Blob = options.Blob || typeof Blob !== "undefined" && Blob;
    const useBlob = _Blob && utils_default.isSpecCompliantForm(formData);
    if (!utils_default.isFunction(visitor)) {
      throw new TypeError("visitor must be a function");
    }
    function convertValue(value) {
      if (value === null) return "";
      if (utils_default.isDate(value)) {
        return value.toISOString();
      }
      if (utils_default.isBoolean(value)) {
        return value.toString();
      }
      if (!useBlob && utils_default.isBlob(value)) {
        throw new AxiosError_default("Blob is not supported. Use a Buffer instead.");
      }
      if (utils_default.isArrayBuffer(value) || utils_default.isTypedArray(value)) {
        return useBlob && typeof Blob === "function" ? new Blob([value]) : Buffer.from(value);
      }
      return value;
    }
    function defaultVisitor(value, key, path) {
      let arr = value;
      if (value && !path && typeof value === "object") {
        if (utils_default.endsWith(key, "{}")) {
          key = metaTokens ? key : key.slice(0, -2);
          value = JSON.stringify(value);
        } else if (utils_default.isArray(value) && isFlatArray(value) || (utils_default.isFileList(value) || utils_default.endsWith(key, "[]")) && (arr = utils_default.toArray(value))) {
          key = removeBrackets(key);
          arr.forEach(function each(el, index) {
            !(utils_default.isUndefined(el) || el === null) && formData.append(
              // eslint-disable-next-line no-nested-ternary
              indexes === true ? renderKey([key], index, dots) : indexes === null ? key : key + "[]",
              convertValue(el)
            );
          });
          return false;
        }
      }
      if (isVisitable(value)) {
        return true;
      }
      formData.append(renderKey(path, key, dots), convertValue(value));
      return false;
    }
    const stack = [];
    const exposedHelpers = Object.assign(predicates, {
      defaultVisitor,
      convertValue,
      isVisitable
    });
    function build(value, path) {
      if (utils_default.isUndefined(value)) return;
      if (stack.indexOf(value) !== -1) {
        throw Error("Circular reference detected in " + path.join("."));
      }
      stack.push(value);
      utils_default.forEach(value, function each(el, key) {
        const result = !(utils_default.isUndefined(el) || el === null) && visitor.call(
          formData,
          el,
          utils_default.isString(key) ? key.trim() : key,
          path,
          exposedHelpers
        );
        if (result === true) {
          build(el, path ? path.concat(key) : [key]);
        }
      });
      stack.pop();
    }
    if (!utils_default.isObject(obj)) {
      throw new TypeError("data must be an object");
    }
    build(obj);
    return formData;
  }
  var predicates, toFormData_default;
  var init_toFormData = __esm({
    "node_modules/axios/lib/helpers/toFormData.js"() {
      "use strict";
      init_utils();
      init_AxiosError();
      init_null();
      predicates = utils_default.toFlatObject(utils_default, {}, null, function filter(prop) {
        return /^is[A-Z]/.test(prop);
      });
      toFormData_default = toFormData;
    }
  });

  // node_modules/axios/lib/helpers/AxiosURLSearchParams.js
  function encode(str) {
    const charMap = {
      "!": "%21",
      "'": "%27",
      "(": "%28",
      ")": "%29",
      "~": "%7E",
      "%20": "+",
      "%00": "\0"
    };
    return encodeURIComponent(str).replace(/[!'()~]|%20|%00/g, function replacer(match) {
      return charMap[match];
    });
  }
  function AxiosURLSearchParams(params, options) {
    this._pairs = [];
    params && toFormData_default(params, this, options);
  }
  var prototype2, AxiosURLSearchParams_default;
  var init_AxiosURLSearchParams = __esm({
    "node_modules/axios/lib/helpers/AxiosURLSearchParams.js"() {
      "use strict";
      init_toFormData();
      prototype2 = AxiosURLSearchParams.prototype;
      prototype2.append = function append(name, value) {
        this._pairs.push([name, value]);
      };
      prototype2.toString = function toString2(encoder) {
        const _encode = encoder ? function(value) {
          return encoder.call(this, value, encode);
        } : encode;
        return this._pairs.map(function each(pair) {
          return _encode(pair[0]) + "=" + _encode(pair[1]);
        }, "").join("&");
      };
      AxiosURLSearchParams_default = AxiosURLSearchParams;
    }
  });

  // node_modules/axios/lib/helpers/buildURL.js
  function encode2(val) {
    return encodeURIComponent(val).replace(/%3A/gi, ":").replace(/%24/g, "$").replace(/%2C/gi, ",").replace(/%20/g, "+");
  }
  function buildURL(url, params, options) {
    if (!params) {
      return url;
    }
    const _encode = options && options.encode || encode2;
    if (utils_default.isFunction(options)) {
      options = {
        serialize: options
      };
    }
    const serializeFn = options && options.serialize;
    let serializedParams;
    if (serializeFn) {
      serializedParams = serializeFn(params, options);
    } else {
      serializedParams = utils_default.isURLSearchParams(params) ? params.toString() : new AxiosURLSearchParams_default(params, options).toString(_encode);
    }
    if (serializedParams) {
      const hashmarkIndex = url.indexOf("#");
      if (hashmarkIndex !== -1) {
        url = url.slice(0, hashmarkIndex);
      }
      url += (url.indexOf("?") === -1 ? "?" : "&") + serializedParams;
    }
    return url;
  }
  var init_buildURL = __esm({
    "node_modules/axios/lib/helpers/buildURL.js"() {
      "use strict";
      init_utils();
      init_AxiosURLSearchParams();
    }
  });

  // node_modules/axios/lib/core/InterceptorManager.js
  var InterceptorManager, InterceptorManager_default;
  var init_InterceptorManager = __esm({
    "node_modules/axios/lib/core/InterceptorManager.js"() {
      "use strict";
      init_utils();
      InterceptorManager = class {
        constructor() {
          this.handlers = [];
        }
        /**
         * Add a new interceptor to the stack
         *
         * @param {Function} fulfilled The function to handle `then` for a `Promise`
         * @param {Function} rejected The function to handle `reject` for a `Promise`
         *
         * @return {Number} An ID used to remove interceptor later
         */
        use(fulfilled, rejected, options) {
          this.handlers.push({
            fulfilled,
            rejected,
            synchronous: options ? options.synchronous : false,
            runWhen: options ? options.runWhen : null
          });
          return this.handlers.length - 1;
        }
        /**
         * Remove an interceptor from the stack
         *
         * @param {Number} id The ID that was returned by `use`
         *
         * @returns {void}
         */
        eject(id) {
          if (this.handlers[id]) {
            this.handlers[id] = null;
          }
        }
        /**
         * Clear all interceptors from the stack
         *
         * @returns {void}
         */
        clear() {
          if (this.handlers) {
            this.handlers = [];
          }
        }
        /**
         * Iterate over all the registered interceptors
         *
         * This method is particularly useful for skipping over any
         * interceptors that may have become `null` calling `eject`.
         *
         * @param {Function} fn The function to call for each interceptor
         *
         * @returns {void}
         */
        forEach(fn) {
          utils_default.forEach(this.handlers, function forEachHandler(h) {
            if (h !== null) {
              fn(h);
            }
          });
        }
      };
      InterceptorManager_default = InterceptorManager;
    }
  });

  // node_modules/axios/lib/defaults/transitional.js
  var transitional_default;
  var init_transitional = __esm({
    "node_modules/axios/lib/defaults/transitional.js"() {
      "use strict";
      transitional_default = {
        silentJSONParsing: true,
        forcedJSONParsing: true,
        clarifyTimeoutError: false
      };
    }
  });

  // node_modules/axios/lib/platform/browser/classes/URLSearchParams.js
  var URLSearchParams_default;
  var init_URLSearchParams = __esm({
    "node_modules/axios/lib/platform/browser/classes/URLSearchParams.js"() {
      "use strict";
      init_AxiosURLSearchParams();
      URLSearchParams_default = typeof URLSearchParams !== "undefined" ? URLSearchParams : AxiosURLSearchParams_default;
    }
  });

  // node_modules/axios/lib/platform/browser/classes/FormData.js
  var FormData_default;
  var init_FormData = __esm({
    "node_modules/axios/lib/platform/browser/classes/FormData.js"() {
      "use strict";
      FormData_default = typeof FormData !== "undefined" ? FormData : null;
    }
  });

  // node_modules/axios/lib/platform/browser/classes/Blob.js
  var Blob_default;
  var init_Blob = __esm({
    "node_modules/axios/lib/platform/browser/classes/Blob.js"() {
      "use strict";
      Blob_default = typeof Blob !== "undefined" ? Blob : null;
    }
  });

  // node_modules/axios/lib/platform/browser/index.js
  var browser_default;
  var init_browser = __esm({
    "node_modules/axios/lib/platform/browser/index.js"() {
      init_URLSearchParams();
      init_FormData();
      init_Blob();
      browser_default = {
        isBrowser: true,
        classes: {
          URLSearchParams: URLSearchParams_default,
          FormData: FormData_default,
          Blob: Blob_default
        },
        protocols: ["http", "https", "file", "blob", "url", "data"]
      };
    }
  });

  // node_modules/axios/lib/platform/common/utils.js
  var utils_exports = {};
  __export(utils_exports, {
    hasBrowserEnv: () => hasBrowserEnv,
    hasStandardBrowserEnv: () => hasStandardBrowserEnv,
    hasStandardBrowserWebWorkerEnv: () => hasStandardBrowserWebWorkerEnv,
    navigator: () => _navigator,
    origin: () => origin
  });
  var hasBrowserEnv, _navigator, hasStandardBrowserEnv, hasStandardBrowserWebWorkerEnv, origin;
  var init_utils2 = __esm({
    "node_modules/axios/lib/platform/common/utils.js"() {
      hasBrowserEnv = typeof window !== "undefined" && typeof document !== "undefined";
      _navigator = typeof navigator === "object" && navigator || void 0;
      hasStandardBrowserEnv = hasBrowserEnv && (!_navigator || ["ReactNative", "NativeScript", "NS"].indexOf(_navigator.product) < 0);
      hasStandardBrowserWebWorkerEnv = (() => {
        return typeof WorkerGlobalScope !== "undefined" && // eslint-disable-next-line no-undef
        self instanceof WorkerGlobalScope && typeof self.importScripts === "function";
      })();
      origin = hasBrowserEnv && window.location.href || "http://localhost";
    }
  });

  // node_modules/axios/lib/platform/index.js
  var platform_default;
  var init_platform = __esm({
    "node_modules/axios/lib/platform/index.js"() {
      init_browser();
      init_utils2();
      platform_default = {
        ...utils_exports,
        ...browser_default
      };
    }
  });

  // node_modules/axios/lib/helpers/toURLEncodedForm.js
  function toURLEncodedForm(data, options) {
    return toFormData_default(data, new platform_default.classes.URLSearchParams(), {
      visitor: function(value, key, path, helpers) {
        if (platform_default.isNode && utils_default.isBuffer(value)) {
          this.append(key, value.toString("base64"));
          return false;
        }
        return helpers.defaultVisitor.apply(this, arguments);
      },
      ...options
    });
  }
  var init_toURLEncodedForm = __esm({
    "node_modules/axios/lib/helpers/toURLEncodedForm.js"() {
      "use strict";
      init_utils();
      init_toFormData();
      init_platform();
    }
  });

  // node_modules/axios/lib/helpers/formDataToJSON.js
  function parsePropPath(name) {
    return utils_default.matchAll(/\w+|\[(\w*)]/g, name).map((match) => {
      return match[0] === "[]" ? "" : match[1] || match[0];
    });
  }
  function arrayToObject(arr) {
    const obj = {};
    const keys = Object.keys(arr);
    let i;
    const len = keys.length;
    let key;
    for (i = 0; i < len; i++) {
      key = keys[i];
      obj[key] = arr[key];
    }
    return obj;
  }
  function formDataToJSON(formData) {
    function buildPath(path, value, target, index) {
      let name = path[index++];
      if (name === "__proto__") return true;
      const isNumericKey = Number.isFinite(+name);
      const isLast = index >= path.length;
      name = !name && utils_default.isArray(target) ? target.length : name;
      if (isLast) {
        if (utils_default.hasOwnProp(target, name)) {
          target[name] = [target[name], value];
        } else {
          target[name] = value;
        }
        return !isNumericKey;
      }
      if (!target[name] || !utils_default.isObject(target[name])) {
        target[name] = [];
      }
      const result = buildPath(path, value, target[name], index);
      if (result && utils_default.isArray(target[name])) {
        target[name] = arrayToObject(target[name]);
      }
      return !isNumericKey;
    }
    if (utils_default.isFormData(formData) && utils_default.isFunction(formData.entries)) {
      const obj = {};
      utils_default.forEachEntry(formData, (name, value) => {
        buildPath(parsePropPath(name), value, obj, 0);
      });
      return obj;
    }
    return null;
  }
  var formDataToJSON_default;
  var init_formDataToJSON = __esm({
    "node_modules/axios/lib/helpers/formDataToJSON.js"() {
      "use strict";
      init_utils();
      formDataToJSON_default = formDataToJSON;
    }
  });

  // node_modules/axios/lib/defaults/index.js
  function stringifySafely(rawValue, parser, encoder) {
    if (utils_default.isString(rawValue)) {
      try {
        (parser || JSON.parse)(rawValue);
        return utils_default.trim(rawValue);
      } catch (e) {
        if (e.name !== "SyntaxError") {
          throw e;
        }
      }
    }
    return (encoder || JSON.stringify)(rawValue);
  }
  var defaults, defaults_default;
  var init_defaults = __esm({
    "node_modules/axios/lib/defaults/index.js"() {
      "use strict";
      init_utils();
      init_AxiosError();
      init_transitional();
      init_toFormData();
      init_toURLEncodedForm();
      init_platform();
      init_formDataToJSON();
      defaults = {
        transitional: transitional_default,
        adapter: ["xhr", "http", "fetch"],
        transformRequest: [function transformRequest(data, headers) {
          const contentType = headers.getContentType() || "";
          const hasJSONContentType = contentType.indexOf("application/json") > -1;
          const isObjectPayload = utils_default.isObject(data);
          if (isObjectPayload && utils_default.isHTMLForm(data)) {
            data = new FormData(data);
          }
          const isFormData2 = utils_default.isFormData(data);
          if (isFormData2) {
            return hasJSONContentType ? JSON.stringify(formDataToJSON_default(data)) : data;
          }
          if (utils_default.isArrayBuffer(data) || utils_default.isBuffer(data) || utils_default.isStream(data) || utils_default.isFile(data) || utils_default.isBlob(data) || utils_default.isReadableStream(data)) {
            return data;
          }
          if (utils_default.isArrayBufferView(data)) {
            return data.buffer;
          }
          if (utils_default.isURLSearchParams(data)) {
            headers.setContentType("application/x-www-form-urlencoded;charset=utf-8", false);
            return data.toString();
          }
          let isFileList2;
          if (isObjectPayload) {
            if (contentType.indexOf("application/x-www-form-urlencoded") > -1) {
              return toURLEncodedForm(data, this.formSerializer).toString();
            }
            if ((isFileList2 = utils_default.isFileList(data)) || contentType.indexOf("multipart/form-data") > -1) {
              const _FormData = this.env && this.env.FormData;
              return toFormData_default(
                isFileList2 ? { "files[]": data } : data,
                _FormData && new _FormData(),
                this.formSerializer
              );
            }
          }
          if (isObjectPayload || hasJSONContentType) {
            headers.setContentType("application/json", false);
            return stringifySafely(data);
          }
          return data;
        }],
        transformResponse: [function transformResponse(data) {
          const transitional2 = this.transitional || defaults.transitional;
          const forcedJSONParsing = transitional2 && transitional2.forcedJSONParsing;
          const JSONRequested = this.responseType === "json";
          if (utils_default.isResponse(data) || utils_default.isReadableStream(data)) {
            return data;
          }
          if (data && utils_default.isString(data) && (forcedJSONParsing && !this.responseType || JSONRequested)) {
            const silentJSONParsing = transitional2 && transitional2.silentJSONParsing;
            const strictJSONParsing = !silentJSONParsing && JSONRequested;
            try {
              return JSON.parse(data, this.parseReviver);
            } catch (e) {
              if (strictJSONParsing) {
                if (e.name === "SyntaxError") {
                  throw AxiosError_default.from(e, AxiosError_default.ERR_BAD_RESPONSE, this, null, this.response);
                }
                throw e;
              }
            }
          }
          return data;
        }],
        /**
         * A timeout in milliseconds to abort a request. If set to 0 (default) a
         * timeout is not created.
         */
        timeout: 0,
        xsrfCookieName: "XSRF-TOKEN",
        xsrfHeaderName: "X-XSRF-TOKEN",
        maxContentLength: -1,
        maxBodyLength: -1,
        env: {
          FormData: platform_default.classes.FormData,
          Blob: platform_default.classes.Blob
        },
        validateStatus: function validateStatus(status) {
          return status >= 200 && status < 300;
        },
        headers: {
          common: {
            "Accept": "application/json, text/plain, */*",
            "Content-Type": void 0
          }
        }
      };
      utils_default.forEach(["delete", "get", "head", "post", "put", "patch"], (method) => {
        defaults.headers[method] = {};
      });
      defaults_default = defaults;
    }
  });

  // node_modules/axios/lib/helpers/parseHeaders.js
  var ignoreDuplicateOf, parseHeaders_default;
  var init_parseHeaders = __esm({
    "node_modules/axios/lib/helpers/parseHeaders.js"() {
      "use strict";
      init_utils();
      ignoreDuplicateOf = utils_default.toObjectSet([
        "age",
        "authorization",
        "content-length",
        "content-type",
        "etag",
        "expires",
        "from",
        "host",
        "if-modified-since",
        "if-unmodified-since",
        "last-modified",
        "location",
        "max-forwards",
        "proxy-authorization",
        "referer",
        "retry-after",
        "user-agent"
      ]);
      parseHeaders_default = (rawHeaders) => {
        const parsed = {};
        let key;
        let val;
        let i;
        rawHeaders && rawHeaders.split("\n").forEach(function parser(line) {
          i = line.indexOf(":");
          key = line.substring(0, i).trim().toLowerCase();
          val = line.substring(i + 1).trim();
          if (!key || parsed[key] && ignoreDuplicateOf[key]) {
            return;
          }
          if (key === "set-cookie") {
            if (parsed[key]) {
              parsed[key].push(val);
            } else {
              parsed[key] = [val];
            }
          } else {
            parsed[key] = parsed[key] ? parsed[key] + ", " + val : val;
          }
        });
        return parsed;
      };
    }
  });

  // node_modules/axios/lib/core/AxiosHeaders.js
  function normalizeHeader(header) {
    return header && String(header).trim().toLowerCase();
  }
  function normalizeValue(value) {
    if (value === false || value == null) {
      return value;
    }
    return utils_default.isArray(value) ? value.map(normalizeValue) : String(value);
  }
  function parseTokens(str) {
    const tokens = /* @__PURE__ */ Object.create(null);
    const tokensRE = /([^\s,;=]+)\s*(?:=\s*([^,;]+))?/g;
    let match;
    while (match = tokensRE.exec(str)) {
      tokens[match[1]] = match[2];
    }
    return tokens;
  }
  function matchHeaderValue(context, value, header, filter2, isHeaderNameFilter) {
    if (utils_default.isFunction(filter2)) {
      return filter2.call(this, value, header);
    }
    if (isHeaderNameFilter) {
      value = header;
    }
    if (!utils_default.isString(value)) return;
    if (utils_default.isString(filter2)) {
      return value.indexOf(filter2) !== -1;
    }
    if (utils_default.isRegExp(filter2)) {
      return filter2.test(value);
    }
  }
  function formatHeader(header) {
    return header.trim().toLowerCase().replace(/([a-z\d])(\w*)/g, (w, char, str) => {
      return char.toUpperCase() + str;
    });
  }
  function buildAccessors(obj, header) {
    const accessorName = utils_default.toCamelCase(" " + header);
    ["get", "set", "has"].forEach((methodName) => {
      Object.defineProperty(obj, methodName + accessorName, {
        value: function(arg1, arg2, arg3) {
          return this[methodName].call(this, header, arg1, arg2, arg3);
        },
        configurable: true
      });
    });
  }
  var $internals, isValidHeaderName, AxiosHeaders, AxiosHeaders_default;
  var init_AxiosHeaders = __esm({
    "node_modules/axios/lib/core/AxiosHeaders.js"() {
      "use strict";
      init_utils();
      init_parseHeaders();
      $internals = Symbol("internals");
      isValidHeaderName = (str) => /^[-_a-zA-Z0-9^`|~,!#$%&'*+.]+$/.test(str.trim());
      AxiosHeaders = class {
        constructor(headers) {
          headers && this.set(headers);
        }
        set(header, valueOrRewrite, rewrite) {
          const self2 = this;
          function setHeader(_value, _header, _rewrite) {
            const lHeader = normalizeHeader(_header);
            if (!lHeader) {
              throw new Error("header name must be a non-empty string");
            }
            const key = utils_default.findKey(self2, lHeader);
            if (!key || self2[key] === void 0 || _rewrite === true || _rewrite === void 0 && self2[key] !== false) {
              self2[key || _header] = normalizeValue(_value);
            }
          }
          const setHeaders = (headers, _rewrite) => utils_default.forEach(headers, (_value, _header) => setHeader(_value, _header, _rewrite));
          if (utils_default.isPlainObject(header) || header instanceof this.constructor) {
            setHeaders(header, valueOrRewrite);
          } else if (utils_default.isString(header) && (header = header.trim()) && !isValidHeaderName(header)) {
            setHeaders(parseHeaders_default(header), valueOrRewrite);
          } else if (utils_default.isObject(header) && utils_default.isIterable(header)) {
            let obj = {}, dest, key;
            for (const entry of header) {
              if (!utils_default.isArray(entry)) {
                throw TypeError("Object iterator must return a key-value pair");
              }
              obj[key = entry[0]] = (dest = obj[key]) ? utils_default.isArray(dest) ? [...dest, entry[1]] : [dest, entry[1]] : entry[1];
            }
            setHeaders(obj, valueOrRewrite);
          } else {
            header != null && setHeader(valueOrRewrite, header, rewrite);
          }
          return this;
        }
        get(header, parser) {
          header = normalizeHeader(header);
          if (header) {
            const key = utils_default.findKey(this, header);
            if (key) {
              const value = this[key];
              if (!parser) {
                return value;
              }
              if (parser === true) {
                return parseTokens(value);
              }
              if (utils_default.isFunction(parser)) {
                return parser.call(this, value, key);
              }
              if (utils_default.isRegExp(parser)) {
                return parser.exec(value);
              }
              throw new TypeError("parser must be boolean|regexp|function");
            }
          }
        }
        has(header, matcher) {
          header = normalizeHeader(header);
          if (header) {
            const key = utils_default.findKey(this, header);
            return !!(key && this[key] !== void 0 && (!matcher || matchHeaderValue(this, this[key], key, matcher)));
          }
          return false;
        }
        delete(header, matcher) {
          const self2 = this;
          let deleted = false;
          function deleteHeader(_header) {
            _header = normalizeHeader(_header);
            if (_header) {
              const key = utils_default.findKey(self2, _header);
              if (key && (!matcher || matchHeaderValue(self2, self2[key], key, matcher))) {
                delete self2[key];
                deleted = true;
              }
            }
          }
          if (utils_default.isArray(header)) {
            header.forEach(deleteHeader);
          } else {
            deleteHeader(header);
          }
          return deleted;
        }
        clear(matcher) {
          const keys = Object.keys(this);
          let i = keys.length;
          let deleted = false;
          while (i--) {
            const key = keys[i];
            if (!matcher || matchHeaderValue(this, this[key], key, matcher, true)) {
              delete this[key];
              deleted = true;
            }
          }
          return deleted;
        }
        normalize(format) {
          const self2 = this;
          const headers = {};
          utils_default.forEach(this, (value, header) => {
            const key = utils_default.findKey(headers, header);
            if (key) {
              self2[key] = normalizeValue(value);
              delete self2[header];
              return;
            }
            const normalized = format ? formatHeader(header) : String(header).trim();
            if (normalized !== header) {
              delete self2[header];
            }
            self2[normalized] = normalizeValue(value);
            headers[normalized] = true;
          });
          return this;
        }
        concat(...targets) {
          return this.constructor.concat(this, ...targets);
        }
        toJSON(asStrings) {
          const obj = /* @__PURE__ */ Object.create(null);
          utils_default.forEach(this, (value, header) => {
            value != null && value !== false && (obj[header] = asStrings && utils_default.isArray(value) ? value.join(", ") : value);
          });
          return obj;
        }
        [Symbol.iterator]() {
          return Object.entries(this.toJSON())[Symbol.iterator]();
        }
        toString() {
          return Object.entries(this.toJSON()).map(([header, value]) => header + ": " + value).join("\n");
        }
        getSetCookie() {
          return this.get("set-cookie") || [];
        }
        get [Symbol.toStringTag]() {
          return "AxiosHeaders";
        }
        static from(thing) {
          return thing instanceof this ? thing : new this(thing);
        }
        static concat(first, ...targets) {
          const computed = new this(first);
          targets.forEach((target) => computed.set(target));
          return computed;
        }
        static accessor(header) {
          const internals = this[$internals] = this[$internals] = {
            accessors: {}
          };
          const accessors = internals.accessors;
          const prototype3 = this.prototype;
          function defineAccessor(_header) {
            const lHeader = normalizeHeader(_header);
            if (!accessors[lHeader]) {
              buildAccessors(prototype3, _header);
              accessors[lHeader] = true;
            }
          }
          utils_default.isArray(header) ? header.forEach(defineAccessor) : defineAccessor(header);
          return this;
        }
      };
      AxiosHeaders.accessor(["Content-Type", "Content-Length", "Accept", "Accept-Encoding", "User-Agent", "Authorization"]);
      utils_default.reduceDescriptors(AxiosHeaders.prototype, ({ value }, key) => {
        let mapped = key[0].toUpperCase() + key.slice(1);
        return {
          get: () => value,
          set(headerValue2) {
            this[mapped] = headerValue2;
          }
        };
      });
      utils_default.freezeMethods(AxiosHeaders);
      AxiosHeaders_default = AxiosHeaders;
    }
  });

  // node_modules/axios/lib/core/transformData.js
  function transformData(fns, response) {
    const config = this || defaults_default;
    const context = response || config;
    const headers = AxiosHeaders_default.from(context.headers);
    let data = context.data;
    utils_default.forEach(fns, function transform(fn) {
      data = fn.call(config, data, headers.normalize(), response ? response.status : void 0);
    });
    headers.normalize();
    return data;
  }
  var init_transformData = __esm({
    "node_modules/axios/lib/core/transformData.js"() {
      "use strict";
      init_utils();
      init_defaults();
      init_AxiosHeaders();
    }
  });

  // node_modules/axios/lib/cancel/isCancel.js
  function isCancel(value) {
    return !!(value && value.__CANCEL__);
  }
  var init_isCancel = __esm({
    "node_modules/axios/lib/cancel/isCancel.js"() {
      "use strict";
    }
  });

  // node_modules/axios/lib/cancel/CanceledError.js
  function CanceledError(message, config, request) {
    AxiosError_default.call(this, message == null ? "canceled" : message, AxiosError_default.ERR_CANCELED, config, request);
    this.name = "CanceledError";
  }
  var CanceledError_default;
  var init_CanceledError = __esm({
    "node_modules/axios/lib/cancel/CanceledError.js"() {
      "use strict";
      init_AxiosError();
      init_utils();
      utils_default.inherits(CanceledError, AxiosError_default, {
        __CANCEL__: true
      });
      CanceledError_default = CanceledError;
    }
  });

  // node_modules/axios/lib/core/settle.js
  function settle(resolve, reject, response) {
    const validateStatus2 = response.config.validateStatus;
    if (!response.status || !validateStatus2 || validateStatus2(response.status)) {
      resolve(response);
    } else {
      reject(new AxiosError_default(
        "Request failed with status code " + response.status,
        [AxiosError_default.ERR_BAD_REQUEST, AxiosError_default.ERR_BAD_RESPONSE][Math.floor(response.status / 100) - 4],
        response.config,
        response.request,
        response
      ));
    }
  }
  var init_settle = __esm({
    "node_modules/axios/lib/core/settle.js"() {
      "use strict";
      init_AxiosError();
    }
  });

  // node_modules/axios/lib/helpers/parseProtocol.js
  function parseProtocol(url) {
    const match = /^([-+\w]{1,25})(:?\/\/|:)/.exec(url);
    return match && match[1] || "";
  }
  var init_parseProtocol = __esm({
    "node_modules/axios/lib/helpers/parseProtocol.js"() {
      "use strict";
    }
  });

  // node_modules/axios/lib/helpers/speedometer.js
  function speedometer(samplesCount, min) {
    samplesCount = samplesCount || 10;
    const bytes = new Array(samplesCount);
    const timestamps = new Array(samplesCount);
    let head = 0;
    let tail = 0;
    let firstSampleTS;
    min = min !== void 0 ? min : 1e3;
    return function push(chunkLength) {
      const now = Date.now();
      const startedAt = timestamps[tail];
      if (!firstSampleTS) {
        firstSampleTS = now;
      }
      bytes[head] = chunkLength;
      timestamps[head] = now;
      let i = tail;
      let bytesCount = 0;
      while (i !== head) {
        bytesCount += bytes[i++];
        i = i % samplesCount;
      }
      head = (head + 1) % samplesCount;
      if (head === tail) {
        tail = (tail + 1) % samplesCount;
      }
      if (now - firstSampleTS < min) {
        return;
      }
      const passed = startedAt && now - startedAt;
      return passed ? Math.round(bytesCount * 1e3 / passed) : void 0;
    };
  }
  var speedometer_default;
  var init_speedometer = __esm({
    "node_modules/axios/lib/helpers/speedometer.js"() {
      "use strict";
      speedometer_default = speedometer;
    }
  });

  // node_modules/axios/lib/helpers/throttle.js
  function throttle(fn, freq) {
    let timestamp = 0;
    let threshold = 1e3 / freq;
    let lastArgs;
    let timer;
    const invoke = (args, now = Date.now()) => {
      timestamp = now;
      lastArgs = null;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      fn(...args);
    };
    const throttled = (...args) => {
      const now = Date.now();
      const passed = now - timestamp;
      if (passed >= threshold) {
        invoke(args, now);
      } else {
        lastArgs = args;
        if (!timer) {
          timer = setTimeout(() => {
            timer = null;
            invoke(lastArgs);
          }, threshold - passed);
        }
      }
    };
    const flush = () => lastArgs && invoke(lastArgs);
    return [throttled, flush];
  }
  var throttle_default;
  var init_throttle = __esm({
    "node_modules/axios/lib/helpers/throttle.js"() {
      throttle_default = throttle;
    }
  });

  // node_modules/axios/lib/helpers/progressEventReducer.js
  var progressEventReducer, progressEventDecorator, asyncDecorator;
  var init_progressEventReducer = __esm({
    "node_modules/axios/lib/helpers/progressEventReducer.js"() {
      init_speedometer();
      init_throttle();
      init_utils();
      progressEventReducer = (listener, isDownloadStream, freq = 3) => {
        let bytesNotified = 0;
        const _speedometer = speedometer_default(50, 250);
        return throttle_default((e) => {
          const loaded = e.loaded;
          const total = e.lengthComputable ? e.total : void 0;
          const progressBytes = loaded - bytesNotified;
          const rate = _speedometer(progressBytes);
          const inRange = loaded <= total;
          bytesNotified = loaded;
          const data = {
            loaded,
            total,
            progress: total ? loaded / total : void 0,
            bytes: progressBytes,
            rate: rate ? rate : void 0,
            estimated: rate && total && inRange ? (total - loaded) / rate : void 0,
            event: e,
            lengthComputable: total != null,
            [isDownloadStream ? "download" : "upload"]: true
          };
          listener(data);
        }, freq);
      };
      progressEventDecorator = (total, throttled) => {
        const lengthComputable = total != null;
        return [(loaded) => throttled[0]({
          lengthComputable,
          total,
          loaded
        }), throttled[1]];
      };
      asyncDecorator = (fn) => (...args) => utils_default.asap(() => fn(...args));
    }
  });

  // node_modules/axios/lib/helpers/isURLSameOrigin.js
  var isURLSameOrigin_default;
  var init_isURLSameOrigin = __esm({
    "node_modules/axios/lib/helpers/isURLSameOrigin.js"() {
      init_platform();
      isURLSameOrigin_default = platform_default.hasStandardBrowserEnv ? /* @__PURE__ */ ((origin2, isMSIE) => (url) => {
        url = new URL(url, platform_default.origin);
        return origin2.protocol === url.protocol && origin2.host === url.host && (isMSIE || origin2.port === url.port);
      })(
        new URL(platform_default.origin),
        platform_default.navigator && /(msie|trident)/i.test(platform_default.navigator.userAgent)
      ) : () => true;
    }
  });

  // node_modules/axios/lib/helpers/cookies.js
  var cookies_default;
  var init_cookies = __esm({
    "node_modules/axios/lib/helpers/cookies.js"() {
      init_utils();
      init_platform();
      cookies_default = platform_default.hasStandardBrowserEnv ? (
        // Standard browser envs support document.cookie
        {
          write(name, value, expires, path, domain, secure, sameSite) {
            if (typeof document === "undefined") return;
            const cookie = [`${name}=${encodeURIComponent(value)}`];
            if (utils_default.isNumber(expires)) {
              cookie.push(`expires=${new Date(expires).toUTCString()}`);
            }
            if (utils_default.isString(path)) {
              cookie.push(`path=${path}`);
            }
            if (utils_default.isString(domain)) {
              cookie.push(`domain=${domain}`);
            }
            if (secure === true) {
              cookie.push("secure");
            }
            if (utils_default.isString(sameSite)) {
              cookie.push(`SameSite=${sameSite}`);
            }
            document.cookie = cookie.join("; ");
          },
          read(name) {
            if (typeof document === "undefined") return null;
            const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
            return match ? decodeURIComponent(match[1]) : null;
          },
          remove(name) {
            this.write(name, "", Date.now() - 864e5, "/");
          }
        }
      ) : (
        // Non-standard browser env (web workers, react-native) lack needed support.
        {
          write() {
          },
          read() {
            return null;
          },
          remove() {
          }
        }
      );
    }
  });

  // node_modules/axios/lib/helpers/isAbsoluteURL.js
  function isAbsoluteURL(url) {
    return /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url);
  }
  var init_isAbsoluteURL = __esm({
    "node_modules/axios/lib/helpers/isAbsoluteURL.js"() {
      "use strict";
    }
  });

  // node_modules/axios/lib/helpers/combineURLs.js
  function combineURLs(baseURL, relativeURL) {
    return relativeURL ? baseURL.replace(/\/?\/$/, "") + "/" + relativeURL.replace(/^\/+/, "") : baseURL;
  }
  var init_combineURLs = __esm({
    "node_modules/axios/lib/helpers/combineURLs.js"() {
      "use strict";
    }
  });

  // node_modules/axios/lib/core/buildFullPath.js
  function buildFullPath(baseURL, requestedURL, allowAbsoluteUrls) {
    let isRelativeUrl = !isAbsoluteURL(requestedURL);
    if (baseURL && (isRelativeUrl || allowAbsoluteUrls == false)) {
      return combineURLs(baseURL, requestedURL);
    }
    return requestedURL;
  }
  var init_buildFullPath = __esm({
    "node_modules/axios/lib/core/buildFullPath.js"() {
      "use strict";
      init_isAbsoluteURL();
      init_combineURLs();
    }
  });

  // node_modules/axios/lib/core/mergeConfig.js
  function mergeConfig(config1, config2) {
    config2 = config2 || {};
    const config = {};
    function getMergedValue(target, source, prop, caseless) {
      if (utils_default.isPlainObject(target) && utils_default.isPlainObject(source)) {
        return utils_default.merge.call({ caseless }, target, source);
      } else if (utils_default.isPlainObject(source)) {
        return utils_default.merge({}, source);
      } else if (utils_default.isArray(source)) {
        return source.slice();
      }
      return source;
    }
    function mergeDeepProperties(a, b, prop, caseless) {
      if (!utils_default.isUndefined(b)) {
        return getMergedValue(a, b, prop, caseless);
      } else if (!utils_default.isUndefined(a)) {
        return getMergedValue(void 0, a, prop, caseless);
      }
    }
    function valueFromConfig2(a, b) {
      if (!utils_default.isUndefined(b)) {
        return getMergedValue(void 0, b);
      }
    }
    function defaultToConfig2(a, b) {
      if (!utils_default.isUndefined(b)) {
        return getMergedValue(void 0, b);
      } else if (!utils_default.isUndefined(a)) {
        return getMergedValue(void 0, a);
      }
    }
    function mergeDirectKeys(a, b, prop) {
      if (prop in config2) {
        return getMergedValue(a, b);
      } else if (prop in config1) {
        return getMergedValue(void 0, a);
      }
    }
    const mergeMap = {
      url: valueFromConfig2,
      method: valueFromConfig2,
      data: valueFromConfig2,
      baseURL: defaultToConfig2,
      transformRequest: defaultToConfig2,
      transformResponse: defaultToConfig2,
      paramsSerializer: defaultToConfig2,
      timeout: defaultToConfig2,
      timeoutMessage: defaultToConfig2,
      withCredentials: defaultToConfig2,
      withXSRFToken: defaultToConfig2,
      adapter: defaultToConfig2,
      responseType: defaultToConfig2,
      xsrfCookieName: defaultToConfig2,
      xsrfHeaderName: defaultToConfig2,
      onUploadProgress: defaultToConfig2,
      onDownloadProgress: defaultToConfig2,
      decompress: defaultToConfig2,
      maxContentLength: defaultToConfig2,
      maxBodyLength: defaultToConfig2,
      beforeRedirect: defaultToConfig2,
      transport: defaultToConfig2,
      httpAgent: defaultToConfig2,
      httpsAgent: defaultToConfig2,
      cancelToken: defaultToConfig2,
      socketPath: defaultToConfig2,
      responseEncoding: defaultToConfig2,
      validateStatus: mergeDirectKeys,
      headers: (a, b, prop) => mergeDeepProperties(headersToObject(a), headersToObject(b), prop, true)
    };
    utils_default.forEach(Object.keys({ ...config1, ...config2 }), function computeConfigValue(prop) {
      const merge2 = mergeMap[prop] || mergeDeepProperties;
      const configValue = merge2(config1[prop], config2[prop], prop);
      utils_default.isUndefined(configValue) && merge2 !== mergeDirectKeys || (config[prop] = configValue);
    });
    return config;
  }
  var headersToObject;
  var init_mergeConfig = __esm({
    "node_modules/axios/lib/core/mergeConfig.js"() {
      "use strict";
      init_utils();
      init_AxiosHeaders();
      headersToObject = (thing) => thing instanceof AxiosHeaders_default ? { ...thing } : thing;
    }
  });

  // node_modules/axios/lib/helpers/resolveConfig.js
  var resolveConfig_default;
  var init_resolveConfig = __esm({
    "node_modules/axios/lib/helpers/resolveConfig.js"() {
      init_platform();
      init_utils();
      init_isURLSameOrigin();
      init_cookies();
      init_buildFullPath();
      init_mergeConfig();
      init_AxiosHeaders();
      init_buildURL();
      resolveConfig_default = (config) => {
        const newConfig = mergeConfig({}, config);
        let { data, withXSRFToken, xsrfHeaderName, xsrfCookieName, headers, auth } = newConfig;
        newConfig.headers = headers = AxiosHeaders_default.from(headers);
        newConfig.url = buildURL(buildFullPath(newConfig.baseURL, newConfig.url, newConfig.allowAbsoluteUrls), config.params, config.paramsSerializer);
        if (auth) {
          headers.set(
            "Authorization",
            "Basic " + btoa((auth.username || "") + ":" + (auth.password ? unescape(encodeURIComponent(auth.password)) : ""))
          );
        }
        if (utils_default.isFormData(data)) {
          if (platform_default.hasStandardBrowserEnv || platform_default.hasStandardBrowserWebWorkerEnv) {
            headers.setContentType(void 0);
          } else if (utils_default.isFunction(data.getHeaders)) {
            const formHeaders = data.getHeaders();
            const allowedHeaders = ["content-type", "content-length"];
            Object.entries(formHeaders).forEach(([key, val]) => {
              if (allowedHeaders.includes(key.toLowerCase())) {
                headers.set(key, val);
              }
            });
          }
        }
        if (platform_default.hasStandardBrowserEnv) {
          withXSRFToken && utils_default.isFunction(withXSRFToken) && (withXSRFToken = withXSRFToken(newConfig));
          if (withXSRFToken || withXSRFToken !== false && isURLSameOrigin_default(newConfig.url)) {
            const xsrfValue = xsrfHeaderName && xsrfCookieName && cookies_default.read(xsrfCookieName);
            if (xsrfValue) {
              headers.set(xsrfHeaderName, xsrfValue);
            }
          }
        }
        return newConfig;
      };
    }
  });

  // node_modules/axios/lib/adapters/xhr.js
  var isXHRAdapterSupported, xhr_default;
  var init_xhr = __esm({
    "node_modules/axios/lib/adapters/xhr.js"() {
      init_utils();
      init_settle();
      init_transitional();
      init_AxiosError();
      init_CanceledError();
      init_parseProtocol();
      init_platform();
      init_AxiosHeaders();
      init_progressEventReducer();
      init_resolveConfig();
      isXHRAdapterSupported = typeof XMLHttpRequest !== "undefined";
      xhr_default = isXHRAdapterSupported && function(config) {
        return new Promise(function dispatchXhrRequest(resolve, reject) {
          const _config = resolveConfig_default(config);
          let requestData = _config.data;
          const requestHeaders = AxiosHeaders_default.from(_config.headers).normalize();
          let { responseType, onUploadProgress, onDownloadProgress } = _config;
          let onCanceled;
          let uploadThrottled, downloadThrottled;
          let flushUpload, flushDownload;
          function done() {
            flushUpload && flushUpload();
            flushDownload && flushDownload();
            _config.cancelToken && _config.cancelToken.unsubscribe(onCanceled);
            _config.signal && _config.signal.removeEventListener("abort", onCanceled);
          }
          let request = new XMLHttpRequest();
          request.open(_config.method.toUpperCase(), _config.url, true);
          request.timeout = _config.timeout;
          function onloadend() {
            if (!request) {
              return;
            }
            const responseHeaders = AxiosHeaders_default.from(
              "getAllResponseHeaders" in request && request.getAllResponseHeaders()
            );
            const responseData = !responseType || responseType === "text" || responseType === "json" ? request.responseText : request.response;
            const response = {
              data: responseData,
              status: request.status,
              statusText: request.statusText,
              headers: responseHeaders,
              config,
              request
            };
            settle(function _resolve(value) {
              resolve(value);
              done();
            }, function _reject(err) {
              reject(err);
              done();
            }, response);
            request = null;
          }
          if ("onloadend" in request) {
            request.onloadend = onloadend;
          } else {
            request.onreadystatechange = function handleLoad() {
              if (!request || request.readyState !== 4) {
                return;
              }
              if (request.status === 0 && !(request.responseURL && request.responseURL.indexOf("file:") === 0)) {
                return;
              }
              setTimeout(onloadend);
            };
          }
          request.onabort = function handleAbort() {
            if (!request) {
              return;
            }
            reject(new AxiosError_default("Request aborted", AxiosError_default.ECONNABORTED, config, request));
            request = null;
          };
          request.onerror = function handleError(event) {
            const msg = event && event.message ? event.message : "Network Error";
            const err = new AxiosError_default(msg, AxiosError_default.ERR_NETWORK, config, request);
            err.event = event || null;
            reject(err);
            request = null;
          };
          request.ontimeout = function handleTimeout() {
            let timeoutErrorMessage = _config.timeout ? "timeout of " + _config.timeout + "ms exceeded" : "timeout exceeded";
            const transitional2 = _config.transitional || transitional_default;
            if (_config.timeoutErrorMessage) {
              timeoutErrorMessage = _config.timeoutErrorMessage;
            }
            reject(new AxiosError_default(
              timeoutErrorMessage,
              transitional2.clarifyTimeoutError ? AxiosError_default.ETIMEDOUT : AxiosError_default.ECONNABORTED,
              config,
              request
            ));
            request = null;
          };
          requestData === void 0 && requestHeaders.setContentType(null);
          if ("setRequestHeader" in request) {
            utils_default.forEach(requestHeaders.toJSON(), function setRequestHeader(val, key) {
              request.setRequestHeader(key, val);
            });
          }
          if (!utils_default.isUndefined(_config.withCredentials)) {
            request.withCredentials = !!_config.withCredentials;
          }
          if (responseType && responseType !== "json") {
            request.responseType = _config.responseType;
          }
          if (onDownloadProgress) {
            [downloadThrottled, flushDownload] = progressEventReducer(onDownloadProgress, true);
            request.addEventListener("progress", downloadThrottled);
          }
          if (onUploadProgress && request.upload) {
            [uploadThrottled, flushUpload] = progressEventReducer(onUploadProgress);
            request.upload.addEventListener("progress", uploadThrottled);
            request.upload.addEventListener("loadend", flushUpload);
          }
          if (_config.cancelToken || _config.signal) {
            onCanceled = (cancel) => {
              if (!request) {
                return;
              }
              reject(!cancel || cancel.type ? new CanceledError_default(null, config, request) : cancel);
              request.abort();
              request = null;
            };
            _config.cancelToken && _config.cancelToken.subscribe(onCanceled);
            if (_config.signal) {
              _config.signal.aborted ? onCanceled() : _config.signal.addEventListener("abort", onCanceled);
            }
          }
          const protocol = parseProtocol(_config.url);
          if (protocol && platform_default.protocols.indexOf(protocol) === -1) {
            reject(new AxiosError_default("Unsupported protocol " + protocol + ":", AxiosError_default.ERR_BAD_REQUEST, config));
            return;
          }
          request.send(requestData || null);
        });
      };
    }
  });

  // node_modules/axios/lib/helpers/composeSignals.js
  var composeSignals, composeSignals_default;
  var init_composeSignals = __esm({
    "node_modules/axios/lib/helpers/composeSignals.js"() {
      init_CanceledError();
      init_AxiosError();
      init_utils();
      composeSignals = (signals, timeout) => {
        const { length } = signals = signals ? signals.filter(Boolean) : [];
        if (timeout || length) {
          let controller = new AbortController();
          let aborted;
          const onabort = function(reason) {
            if (!aborted) {
              aborted = true;
              unsubscribe();
              const err = reason instanceof Error ? reason : this.reason;
              controller.abort(err instanceof AxiosError_default ? err : new CanceledError_default(err instanceof Error ? err.message : err));
            }
          };
          let timer = timeout && setTimeout(() => {
            timer = null;
            onabort(new AxiosError_default(`timeout ${timeout} of ms exceeded`, AxiosError_default.ETIMEDOUT));
          }, timeout);
          const unsubscribe = () => {
            if (signals) {
              timer && clearTimeout(timer);
              timer = null;
              signals.forEach((signal2) => {
                signal2.unsubscribe ? signal2.unsubscribe(onabort) : signal2.removeEventListener("abort", onabort);
              });
              signals = null;
            }
          };
          signals.forEach((signal2) => signal2.addEventListener("abort", onabort));
          const { signal } = controller;
          signal.unsubscribe = () => utils_default.asap(unsubscribe);
          return signal;
        }
      };
      composeSignals_default = composeSignals;
    }
  });

  // node_modules/axios/lib/helpers/trackStream.js
  var streamChunk, readBytes, readStream, trackStream;
  var init_trackStream = __esm({
    "node_modules/axios/lib/helpers/trackStream.js"() {
      streamChunk = function* (chunk, chunkSize) {
        let len = chunk.byteLength;
        if (!chunkSize || len < chunkSize) {
          yield chunk;
          return;
        }
        let pos = 0;
        let end;
        while (pos < len) {
          end = pos + chunkSize;
          yield chunk.slice(pos, end);
          pos = end;
        }
      };
      readBytes = async function* (iterable, chunkSize) {
        for await (const chunk of readStream(iterable)) {
          yield* streamChunk(chunk, chunkSize);
        }
      };
      readStream = async function* (stream) {
        if (stream[Symbol.asyncIterator]) {
          yield* stream;
          return;
        }
        const reader = stream.getReader();
        try {
          for (; ; ) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            yield value;
          }
        } finally {
          await reader.cancel();
        }
      };
      trackStream = (stream, chunkSize, onProgress, onFinish) => {
        const iterator2 = readBytes(stream, chunkSize);
        let bytes = 0;
        let done;
        let _onFinish = (e) => {
          if (!done) {
            done = true;
            onFinish && onFinish(e);
          }
        };
        return new ReadableStream({
          async pull(controller) {
            try {
              const { done: done2, value } = await iterator2.next();
              if (done2) {
                _onFinish();
                controller.close();
                return;
              }
              let len = value.byteLength;
              if (onProgress) {
                let loadedBytes = bytes += len;
                onProgress(loadedBytes);
              }
              controller.enqueue(new Uint8Array(value));
            } catch (err) {
              _onFinish(err);
              throw err;
            }
          },
          cancel(reason) {
            _onFinish(reason);
            return iterator2.return();
          }
        }, {
          highWaterMark: 2
        });
      };
    }
  });

  // node_modules/axios/lib/adapters/fetch.js
  var DEFAULT_CHUNK_SIZE, isFunction2, globalFetchAPI, ReadableStream2, TextEncoder, test, factory, seedCache, getFetch, adapter;
  var init_fetch = __esm({
    "node_modules/axios/lib/adapters/fetch.js"() {
      init_platform();
      init_utils();
      init_AxiosError();
      init_composeSignals();
      init_trackStream();
      init_AxiosHeaders();
      init_progressEventReducer();
      init_resolveConfig();
      init_settle();
      DEFAULT_CHUNK_SIZE = 64 * 1024;
      ({ isFunction: isFunction2 } = utils_default);
      globalFetchAPI = (({ Request, Response }) => ({
        Request,
        Response
      }))(utils_default.global);
      ({
        ReadableStream: ReadableStream2,
        TextEncoder
      } = utils_default.global);
      test = (fn, ...args) => {
        try {
          return !!fn(...args);
        } catch (e) {
          return false;
        }
      };
      factory = (env) => {
        env = utils_default.merge.call({
          skipUndefined: true
        }, globalFetchAPI, env);
        const { fetch: envFetch, Request, Response } = env;
        const isFetchSupported = envFetch ? isFunction2(envFetch) : typeof fetch === "function";
        const isRequestSupported = isFunction2(Request);
        const isResponseSupported = isFunction2(Response);
        if (!isFetchSupported) {
          return false;
        }
        const isReadableStreamSupported = isFetchSupported && isFunction2(ReadableStream2);
        const encodeText = isFetchSupported && (typeof TextEncoder === "function" ? /* @__PURE__ */ ((encoder) => (str) => encoder.encode(str))(new TextEncoder()) : async (str) => new Uint8Array(await new Request(str).arrayBuffer()));
        const supportsRequestStream = isRequestSupported && isReadableStreamSupported && test(() => {
          let duplexAccessed = false;
          const hasContentType = new Request(platform_default.origin, {
            body: new ReadableStream2(),
            method: "POST",
            get duplex() {
              duplexAccessed = true;
              return "half";
            }
          }).headers.has("Content-Type");
          return duplexAccessed && !hasContentType;
        });
        const supportsResponseStream = isResponseSupported && isReadableStreamSupported && test(() => utils_default.isReadableStream(new Response("").body));
        const resolvers = {
          stream: supportsResponseStream && ((res) => res.body)
        };
        isFetchSupported && (() => {
          ["text", "arrayBuffer", "blob", "formData", "stream"].forEach((type) => {
            !resolvers[type] && (resolvers[type] = (res, config) => {
              let method = res && res[type];
              if (method) {
                return method.call(res);
              }
              throw new AxiosError_default(`Response type '${type}' is not supported`, AxiosError_default.ERR_NOT_SUPPORT, config);
            });
          });
        })();
        const getBodyLength = async (body) => {
          if (body == null) {
            return 0;
          }
          if (utils_default.isBlob(body)) {
            return body.size;
          }
          if (utils_default.isSpecCompliantForm(body)) {
            const _request = new Request(platform_default.origin, {
              method: "POST",
              body
            });
            return (await _request.arrayBuffer()).byteLength;
          }
          if (utils_default.isArrayBufferView(body) || utils_default.isArrayBuffer(body)) {
            return body.byteLength;
          }
          if (utils_default.isURLSearchParams(body)) {
            body = body + "";
          }
          if (utils_default.isString(body)) {
            return (await encodeText(body)).byteLength;
          }
        };
        const resolveBodyLength = async (headers, body) => {
          const length = utils_default.toFiniteNumber(headers.getContentLength());
          return length == null ? getBodyLength(body) : length;
        };
        return async (config) => {
          let {
            url,
            method,
            data,
            signal,
            cancelToken,
            timeout,
            onDownloadProgress,
            onUploadProgress,
            responseType,
            headers,
            withCredentials = "same-origin",
            fetchOptions
          } = resolveConfig_default(config);
          let _fetch = envFetch || fetch;
          responseType = responseType ? (responseType + "").toLowerCase() : "text";
          let composedSignal = composeSignals_default([signal, cancelToken && cancelToken.toAbortSignal()], timeout);
          let request = null;
          const unsubscribe = composedSignal && composedSignal.unsubscribe && (() => {
            composedSignal.unsubscribe();
          });
          let requestContentLength;
          try {
            if (onUploadProgress && supportsRequestStream && method !== "get" && method !== "head" && (requestContentLength = await resolveBodyLength(headers, data)) !== 0) {
              let _request = new Request(url, {
                method: "POST",
                body: data,
                duplex: "half"
              });
              let contentTypeHeader;
              if (utils_default.isFormData(data) && (contentTypeHeader = _request.headers.get("content-type"))) {
                headers.setContentType(contentTypeHeader);
              }
              if (_request.body) {
                const [onProgress, flush] = progressEventDecorator(
                  requestContentLength,
                  progressEventReducer(asyncDecorator(onUploadProgress))
                );
                data = trackStream(_request.body, DEFAULT_CHUNK_SIZE, onProgress, flush);
              }
            }
            if (!utils_default.isString(withCredentials)) {
              withCredentials = withCredentials ? "include" : "omit";
            }
            const isCredentialsSupported = isRequestSupported && "credentials" in Request.prototype;
            const resolvedOptions = {
              ...fetchOptions,
              signal: composedSignal,
              method: method.toUpperCase(),
              headers: headers.normalize().toJSON(),
              body: data,
              duplex: "half",
              credentials: isCredentialsSupported ? withCredentials : void 0
            };
            request = isRequestSupported && new Request(url, resolvedOptions);
            let response = await (isRequestSupported ? _fetch(request, fetchOptions) : _fetch(url, resolvedOptions));
            const isStreamResponse = supportsResponseStream && (responseType === "stream" || responseType === "response");
            if (supportsResponseStream && (onDownloadProgress || isStreamResponse && unsubscribe)) {
              const options = {};
              ["status", "statusText", "headers"].forEach((prop) => {
                options[prop] = response[prop];
              });
              const responseContentLength = utils_default.toFiniteNumber(response.headers.get("content-length"));
              const [onProgress, flush] = onDownloadProgress && progressEventDecorator(
                responseContentLength,
                progressEventReducer(asyncDecorator(onDownloadProgress), true)
              ) || [];
              response = new Response(
                trackStream(response.body, DEFAULT_CHUNK_SIZE, onProgress, () => {
                  flush && flush();
                  unsubscribe && unsubscribe();
                }),
                options
              );
            }
            responseType = responseType || "text";
            let responseData = await resolvers[utils_default.findKey(resolvers, responseType) || "text"](response, config);
            !isStreamResponse && unsubscribe && unsubscribe();
            return await new Promise((resolve, reject) => {
              settle(resolve, reject, {
                data: responseData,
                headers: AxiosHeaders_default.from(response.headers),
                status: response.status,
                statusText: response.statusText,
                config,
                request
              });
            });
          } catch (err) {
            unsubscribe && unsubscribe();
            if (err && err.name === "TypeError" && /Load failed|fetch/i.test(err.message)) {
              throw Object.assign(
                new AxiosError_default("Network Error", AxiosError_default.ERR_NETWORK, config, request),
                {
                  cause: err.cause || err
                }
              );
            }
            throw AxiosError_default.from(err, err && err.code, config, request);
          }
        };
      };
      seedCache = /* @__PURE__ */ new Map();
      getFetch = (config) => {
        let env = config && config.env || {};
        const { fetch: fetch2, Request, Response } = env;
        const seeds = [
          Request,
          Response,
          fetch2
        ];
        let len = seeds.length, i = len, seed, target, map = seedCache;
        while (i--) {
          seed = seeds[i];
          target = map.get(seed);
          target === void 0 && map.set(seed, target = i ? /* @__PURE__ */ new Map() : factory(env));
          map = target;
        }
        return target;
      };
      adapter = getFetch();
    }
  });

  // node_modules/axios/lib/adapters/adapters.js
  function getAdapter(adapters, config) {
    adapters = utils_default.isArray(adapters) ? adapters : [adapters];
    const { length } = adapters;
    let nameOrAdapter;
    let adapter2;
    const rejectedReasons = {};
    for (let i = 0; i < length; i++) {
      nameOrAdapter = adapters[i];
      let id;
      adapter2 = nameOrAdapter;
      if (!isResolvedHandle(nameOrAdapter)) {
        adapter2 = knownAdapters[(id = String(nameOrAdapter)).toLowerCase()];
        if (adapter2 === void 0) {
          throw new AxiosError_default(`Unknown adapter '${id}'`);
        }
      }
      if (adapter2 && (utils_default.isFunction(adapter2) || (adapter2 = adapter2.get(config)))) {
        break;
      }
      rejectedReasons[id || "#" + i] = adapter2;
    }
    if (!adapter2) {
      const reasons = Object.entries(rejectedReasons).map(
        ([id, state]) => `adapter ${id} ` + (state === false ? "is not supported by the environment" : "is not available in the build")
      );
      let s = length ? reasons.length > 1 ? "since :\n" + reasons.map(renderReason).join("\n") : " " + renderReason(reasons[0]) : "as no adapter specified";
      throw new AxiosError_default(
        `There is no suitable adapter to dispatch the request ` + s,
        "ERR_NOT_SUPPORT"
      );
    }
    return adapter2;
  }
  var knownAdapters, renderReason, isResolvedHandle, adapters_default;
  var init_adapters = __esm({
    "node_modules/axios/lib/adapters/adapters.js"() {
      init_utils();
      init_null();
      init_xhr();
      init_fetch();
      init_AxiosError();
      knownAdapters = {
        http: null_default,
        xhr: xhr_default,
        fetch: {
          get: getFetch
        }
      };
      utils_default.forEach(knownAdapters, (fn, value) => {
        if (fn) {
          try {
            Object.defineProperty(fn, "name", { value });
          } catch (e) {
          }
          Object.defineProperty(fn, "adapterName", { value });
        }
      });
      renderReason = (reason) => `- ${reason}`;
      isResolvedHandle = (adapter2) => utils_default.isFunction(adapter2) || adapter2 === null || adapter2 === false;
      adapters_default = {
        /**
         * Resolve an adapter from a list of adapter names or functions.
         * @type {Function}
         */
        getAdapter,
        /**
         * Exposes all known adapters
         * @type {Object<string, Function|Object>}
         */
        adapters: knownAdapters
      };
    }
  });

  // node_modules/axios/lib/core/dispatchRequest.js
  function throwIfCancellationRequested(config) {
    if (config.cancelToken) {
      config.cancelToken.throwIfRequested();
    }
    if (config.signal && config.signal.aborted) {
      throw new CanceledError_default(null, config);
    }
  }
  function dispatchRequest(config) {
    throwIfCancellationRequested(config);
    config.headers = AxiosHeaders_default.from(config.headers);
    config.data = transformData.call(
      config,
      config.transformRequest
    );
    if (["post", "put", "patch"].indexOf(config.method) !== -1) {
      config.headers.setContentType("application/x-www-form-urlencoded", false);
    }
    const adapter2 = adapters_default.getAdapter(config.adapter || defaults_default.adapter, config);
    return adapter2(config).then(function onAdapterResolution(response) {
      throwIfCancellationRequested(config);
      response.data = transformData.call(
        config,
        config.transformResponse,
        response
      );
      response.headers = AxiosHeaders_default.from(response.headers);
      return response;
    }, function onAdapterRejection(reason) {
      if (!isCancel(reason)) {
        throwIfCancellationRequested(config);
        if (reason && reason.response) {
          reason.response.data = transformData.call(
            config,
            config.transformResponse,
            reason.response
          );
          reason.response.headers = AxiosHeaders_default.from(reason.response.headers);
        }
      }
      return Promise.reject(reason);
    });
  }
  var init_dispatchRequest = __esm({
    "node_modules/axios/lib/core/dispatchRequest.js"() {
      "use strict";
      init_transformData();
      init_isCancel();
      init_defaults();
      init_CanceledError();
      init_AxiosHeaders();
      init_adapters();
    }
  });

  // node_modules/axios/lib/env/data.js
  var VERSION;
  var init_data = __esm({
    "node_modules/axios/lib/env/data.js"() {
      VERSION = "1.13.1";
    }
  });

  // node_modules/axios/lib/helpers/validator.js
  function assertOptions(options, schema, allowUnknown) {
    if (typeof options !== "object") {
      throw new AxiosError_default("options must be an object", AxiosError_default.ERR_BAD_OPTION_VALUE);
    }
    const keys = Object.keys(options);
    let i = keys.length;
    while (i-- > 0) {
      const opt = keys[i];
      const validator = schema[opt];
      if (validator) {
        const value = options[opt];
        const result = value === void 0 || validator(value, opt, options);
        if (result !== true) {
          throw new AxiosError_default("option " + opt + " must be " + result, AxiosError_default.ERR_BAD_OPTION_VALUE);
        }
        continue;
      }
      if (allowUnknown !== true) {
        throw new AxiosError_default("Unknown option " + opt, AxiosError_default.ERR_BAD_OPTION);
      }
    }
  }
  var validators, deprecatedWarnings, validator_default;
  var init_validator = __esm({
    "node_modules/axios/lib/helpers/validator.js"() {
      "use strict";
      init_data();
      init_AxiosError();
      validators = {};
      ["object", "boolean", "number", "function", "string", "symbol"].forEach((type, i) => {
        validators[type] = function validator(thing) {
          return typeof thing === type || "a" + (i < 1 ? "n " : " ") + type;
        };
      });
      deprecatedWarnings = {};
      validators.transitional = function transitional(validator, version, message) {
        function formatMessage(opt, desc) {
          return "[Axios v" + VERSION + "] Transitional option '" + opt + "'" + desc + (message ? ". " + message : "");
        }
        return (value, opt, opts) => {
          if (validator === false) {
            throw new AxiosError_default(
              formatMessage(opt, " has been removed" + (version ? " in " + version : "")),
              AxiosError_default.ERR_DEPRECATED
            );
          }
          if (version && !deprecatedWarnings[opt]) {
            deprecatedWarnings[opt] = true;
            console.warn(
              formatMessage(
                opt,
                " has been deprecated since v" + version + " and will be removed in the near future"
              )
            );
          }
          return validator ? validator(value, opt, opts) : true;
        };
      };
      validators.spelling = function spelling(correctSpelling) {
        return (value, opt) => {
          console.warn(`${opt} is likely a misspelling of ${correctSpelling}`);
          return true;
        };
      };
      validator_default = {
        assertOptions,
        validators
      };
    }
  });

  // node_modules/axios/lib/core/Axios.js
  var validators2, Axios, Axios_default;
  var init_Axios = __esm({
    "node_modules/axios/lib/core/Axios.js"() {
      "use strict";
      init_utils();
      init_buildURL();
      init_InterceptorManager();
      init_dispatchRequest();
      init_mergeConfig();
      init_buildFullPath();
      init_validator();
      init_AxiosHeaders();
      validators2 = validator_default.validators;
      Axios = class {
        constructor(instanceConfig) {
          this.defaults = instanceConfig || {};
          this.interceptors = {
            request: new InterceptorManager_default(),
            response: new InterceptorManager_default()
          };
        }
        /**
         * Dispatch a request
         *
         * @param {String|Object} configOrUrl The config specific for this request (merged with this.defaults)
         * @param {?Object} config
         *
         * @returns {Promise} The Promise to be fulfilled
         */
        async request(configOrUrl, config) {
          try {
            return await this._request(configOrUrl, config);
          } catch (err) {
            if (err instanceof Error) {
              let dummy = {};
              Error.captureStackTrace ? Error.captureStackTrace(dummy) : dummy = new Error();
              const stack = dummy.stack ? dummy.stack.replace(/^.+\n/, "") : "";
              try {
                if (!err.stack) {
                  err.stack = stack;
                } else if (stack && !String(err.stack).endsWith(stack.replace(/^.+\n.+\n/, ""))) {
                  err.stack += "\n" + stack;
                }
              } catch (e) {
              }
            }
            throw err;
          }
        }
        _request(configOrUrl, config) {
          if (typeof configOrUrl === "string") {
            config = config || {};
            config.url = configOrUrl;
          } else {
            config = configOrUrl || {};
          }
          config = mergeConfig(this.defaults, config);
          const { transitional: transitional2, paramsSerializer, headers } = config;
          if (transitional2 !== void 0) {
            validator_default.assertOptions(transitional2, {
              silentJSONParsing: validators2.transitional(validators2.boolean),
              forcedJSONParsing: validators2.transitional(validators2.boolean),
              clarifyTimeoutError: validators2.transitional(validators2.boolean)
            }, false);
          }
          if (paramsSerializer != null) {
            if (utils_default.isFunction(paramsSerializer)) {
              config.paramsSerializer = {
                serialize: paramsSerializer
              };
            } else {
              validator_default.assertOptions(paramsSerializer, {
                encode: validators2.function,
                serialize: validators2.function
              }, true);
            }
          }
          if (config.allowAbsoluteUrls !== void 0) {
          } else if (this.defaults.allowAbsoluteUrls !== void 0) {
            config.allowAbsoluteUrls = this.defaults.allowAbsoluteUrls;
          } else {
            config.allowAbsoluteUrls = true;
          }
          validator_default.assertOptions(config, {
            baseUrl: validators2.spelling("baseURL"),
            withXsrfToken: validators2.spelling("withXSRFToken")
          }, true);
          config.method = (config.method || this.defaults.method || "get").toLowerCase();
          let contextHeaders = headers && utils_default.merge(
            headers.common,
            headers[config.method]
          );
          headers && utils_default.forEach(
            ["delete", "get", "head", "post", "put", "patch", "common"],
            (method) => {
              delete headers[method];
            }
          );
          config.headers = AxiosHeaders_default.concat(contextHeaders, headers);
          const requestInterceptorChain = [];
          let synchronousRequestInterceptors = true;
          this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
            if (typeof interceptor.runWhen === "function" && interceptor.runWhen(config) === false) {
              return;
            }
            synchronousRequestInterceptors = synchronousRequestInterceptors && interceptor.synchronous;
            requestInterceptorChain.unshift(interceptor.fulfilled, interceptor.rejected);
          });
          const responseInterceptorChain = [];
          this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
            responseInterceptorChain.push(interceptor.fulfilled, interceptor.rejected);
          });
          let promise;
          let i = 0;
          let len;
          if (!synchronousRequestInterceptors) {
            const chain = [dispatchRequest.bind(this), void 0];
            chain.unshift(...requestInterceptorChain);
            chain.push(...responseInterceptorChain);
            len = chain.length;
            promise = Promise.resolve(config);
            while (i < len) {
              promise = promise.then(chain[i++], chain[i++]);
            }
            return promise;
          }
          len = requestInterceptorChain.length;
          let newConfig = config;
          while (i < len) {
            const onFulfilled = requestInterceptorChain[i++];
            const onRejected = requestInterceptorChain[i++];
            try {
              newConfig = onFulfilled(newConfig);
            } catch (error) {
              onRejected.call(this, error);
              break;
            }
          }
          try {
            promise = dispatchRequest.call(this, newConfig);
          } catch (error) {
            return Promise.reject(error);
          }
          i = 0;
          len = responseInterceptorChain.length;
          while (i < len) {
            promise = promise.then(responseInterceptorChain[i++], responseInterceptorChain[i++]);
          }
          return promise;
        }
        getUri(config) {
          config = mergeConfig(this.defaults, config);
          const fullPath = buildFullPath(config.baseURL, config.url, config.allowAbsoluteUrls);
          return buildURL(fullPath, config.params, config.paramsSerializer);
        }
      };
      utils_default.forEach(["delete", "get", "head", "options"], function forEachMethodNoData(method) {
        Axios.prototype[method] = function(url, config) {
          return this.request(mergeConfig(config || {}, {
            method,
            url,
            data: (config || {}).data
          }));
        };
      });
      utils_default.forEach(["post", "put", "patch"], function forEachMethodWithData(method) {
        function generateHTTPMethod(isForm) {
          return function httpMethod(url, data, config) {
            return this.request(mergeConfig(config || {}, {
              method,
              headers: isForm ? {
                "Content-Type": "multipart/form-data"
              } : {},
              url,
              data
            }));
          };
        }
        Axios.prototype[method] = generateHTTPMethod();
        Axios.prototype[method + "Form"] = generateHTTPMethod(true);
      });
      Axios_default = Axios;
    }
  });

  // node_modules/axios/lib/cancel/CancelToken.js
  var CancelToken, CancelToken_default;
  var init_CancelToken = __esm({
    "node_modules/axios/lib/cancel/CancelToken.js"() {
      "use strict";
      init_CanceledError();
      CancelToken = class _CancelToken {
        constructor(executor) {
          if (typeof executor !== "function") {
            throw new TypeError("executor must be a function.");
          }
          let resolvePromise;
          this.promise = new Promise(function promiseExecutor(resolve) {
            resolvePromise = resolve;
          });
          const token = this;
          this.promise.then((cancel) => {
            if (!token._listeners) return;
            let i = token._listeners.length;
            while (i-- > 0) {
              token._listeners[i](cancel);
            }
            token._listeners = null;
          });
          this.promise.then = (onfulfilled) => {
            let _resolve;
            const promise = new Promise((resolve) => {
              token.subscribe(resolve);
              _resolve = resolve;
            }).then(onfulfilled);
            promise.cancel = function reject() {
              token.unsubscribe(_resolve);
            };
            return promise;
          };
          executor(function cancel(message, config, request) {
            if (token.reason) {
              return;
            }
            token.reason = new CanceledError_default(message, config, request);
            resolvePromise(token.reason);
          });
        }
        /**
         * Throws a `CanceledError` if cancellation has been requested.
         */
        throwIfRequested() {
          if (this.reason) {
            throw this.reason;
          }
        }
        /**
         * Subscribe to the cancel signal
         */
        subscribe(listener) {
          if (this.reason) {
            listener(this.reason);
            return;
          }
          if (this._listeners) {
            this._listeners.push(listener);
          } else {
            this._listeners = [listener];
          }
        }
        /**
         * Unsubscribe from the cancel signal
         */
        unsubscribe(listener) {
          if (!this._listeners) {
            return;
          }
          const index = this._listeners.indexOf(listener);
          if (index !== -1) {
            this._listeners.splice(index, 1);
          }
        }
        toAbortSignal() {
          const controller = new AbortController();
          const abort = (err) => {
            controller.abort(err);
          };
          this.subscribe(abort);
          controller.signal.unsubscribe = () => this.unsubscribe(abort);
          return controller.signal;
        }
        /**
         * Returns an object that contains a new `CancelToken` and a function that, when called,
         * cancels the `CancelToken`.
         */
        static source() {
          let cancel;
          const token = new _CancelToken(function executor(c) {
            cancel = c;
          });
          return {
            token,
            cancel
          };
        }
      };
      CancelToken_default = CancelToken;
    }
  });

  // node_modules/axios/lib/helpers/spread.js
  function spread(callback) {
    return function wrap(arr) {
      return callback.apply(null, arr);
    };
  }
  var init_spread = __esm({
    "node_modules/axios/lib/helpers/spread.js"() {
      "use strict";
    }
  });

  // node_modules/axios/lib/helpers/isAxiosError.js
  function isAxiosError(payload) {
    return utils_default.isObject(payload) && payload.isAxiosError === true;
  }
  var init_isAxiosError = __esm({
    "node_modules/axios/lib/helpers/isAxiosError.js"() {
      "use strict";
      init_utils();
    }
  });

  // node_modules/axios/lib/helpers/HttpStatusCode.js
  var HttpStatusCode, HttpStatusCode_default;
  var init_HttpStatusCode = __esm({
    "node_modules/axios/lib/helpers/HttpStatusCode.js"() {
      HttpStatusCode = {
        Continue: 100,
        SwitchingProtocols: 101,
        Processing: 102,
        EarlyHints: 103,
        Ok: 200,
        Created: 201,
        Accepted: 202,
        NonAuthoritativeInformation: 203,
        NoContent: 204,
        ResetContent: 205,
        PartialContent: 206,
        MultiStatus: 207,
        AlreadyReported: 208,
        ImUsed: 226,
        MultipleChoices: 300,
        MovedPermanently: 301,
        Found: 302,
        SeeOther: 303,
        NotModified: 304,
        UseProxy: 305,
        Unused: 306,
        TemporaryRedirect: 307,
        PermanentRedirect: 308,
        BadRequest: 400,
        Unauthorized: 401,
        PaymentRequired: 402,
        Forbidden: 403,
        NotFound: 404,
        MethodNotAllowed: 405,
        NotAcceptable: 406,
        ProxyAuthenticationRequired: 407,
        RequestTimeout: 408,
        Conflict: 409,
        Gone: 410,
        LengthRequired: 411,
        PreconditionFailed: 412,
        PayloadTooLarge: 413,
        UriTooLong: 414,
        UnsupportedMediaType: 415,
        RangeNotSatisfiable: 416,
        ExpectationFailed: 417,
        ImATeapot: 418,
        MisdirectedRequest: 421,
        UnprocessableEntity: 422,
        Locked: 423,
        FailedDependency: 424,
        TooEarly: 425,
        UpgradeRequired: 426,
        PreconditionRequired: 428,
        TooManyRequests: 429,
        RequestHeaderFieldsTooLarge: 431,
        UnavailableForLegalReasons: 451,
        InternalServerError: 500,
        NotImplemented: 501,
        BadGateway: 502,
        ServiceUnavailable: 503,
        GatewayTimeout: 504,
        HttpVersionNotSupported: 505,
        VariantAlsoNegotiates: 506,
        InsufficientStorage: 507,
        LoopDetected: 508,
        NotExtended: 510,
        NetworkAuthenticationRequired: 511,
        WebServerIsDown: 521,
        ConnectionTimedOut: 522,
        OriginIsUnreachable: 523,
        TimeoutOccurred: 524,
        SslHandshakeFailed: 525,
        InvalidSslCertificate: 526
      };
      Object.entries(HttpStatusCode).forEach(([key, value]) => {
        HttpStatusCode[value] = key;
      });
      HttpStatusCode_default = HttpStatusCode;
    }
  });

  // node_modules/axios/lib/axios.js
  function createInstance(defaultConfig) {
    const context = new Axios_default(defaultConfig);
    const instance = bind(Axios_default.prototype.request, context);
    utils_default.extend(instance, Axios_default.prototype, context, { allOwnKeys: true });
    utils_default.extend(instance, context, null, { allOwnKeys: true });
    instance.create = function create(instanceConfig) {
      return createInstance(mergeConfig(defaultConfig, instanceConfig));
    };
    return instance;
  }
  var axios, axios_default;
  var init_axios = __esm({
    "node_modules/axios/lib/axios.js"() {
      "use strict";
      init_utils();
      init_bind();
      init_Axios();
      init_mergeConfig();
      init_defaults();
      init_formDataToJSON();
      init_CanceledError();
      init_CancelToken();
      init_isCancel();
      init_data();
      init_toFormData();
      init_AxiosError();
      init_spread();
      init_isAxiosError();
      init_AxiosHeaders();
      init_adapters();
      init_HttpStatusCode();
      axios = createInstance(defaults_default);
      axios.Axios = Axios_default;
      axios.CanceledError = CanceledError_default;
      axios.CancelToken = CancelToken_default;
      axios.isCancel = isCancel;
      axios.VERSION = VERSION;
      axios.toFormData = toFormData_default;
      axios.AxiosError = AxiosError_default;
      axios.Cancel = axios.CanceledError;
      axios.all = function all(promises) {
        return Promise.all(promises);
      };
      axios.spread = spread;
      axios.isAxiosError = isAxiosError;
      axios.mergeConfig = mergeConfig;
      axios.AxiosHeaders = AxiosHeaders_default;
      axios.formToJSON = (thing) => formDataToJSON_default(utils_default.isHTMLForm(thing) ? new FormData(thing) : thing);
      axios.getAdapter = adapters_default.getAdapter;
      axios.HttpStatusCode = HttpStatusCode_default;
      axios.default = axios;
      axios_default = axios;
    }
  });

  // node_modules/axios/index.js
  var Axios2, AxiosError2, CanceledError2, isCancel2, CancelToken2, VERSION2, all2, Cancel, isAxiosError2, spread2, toFormData2, AxiosHeaders2, HttpStatusCode2, formToJSON, getAdapter2, mergeConfig2;
  var init_axios2 = __esm({
    "node_modules/axios/index.js"() {
      init_axios();
      ({
        Axios: Axios2,
        AxiosError: AxiosError2,
        CanceledError: CanceledError2,
        isCancel: isCancel2,
        CancelToken: CancelToken2,
        VERSION: VERSION2,
        all: all2,
        Cancel,
        isAxiosError: isAxiosError2,
        spread: spread2,
        toFormData: toFormData2,
        AxiosHeaders: AxiosHeaders2,
        HttpStatusCode: HttpStatusCode2,
        formToJSON,
        getAdapter: getAdapter2,
        mergeConfig: mergeConfig2
      } = axios_default);
    }
  });

  // src/lib/sellersSort.js
  function sellerDisplayName(seller) {
    return String(
      seller?.user?.username || seller?.username || seller?.user?.email || seller?.email || seller?._id || ""
    );
  }
  function sortSellersByName(sellers) {
    return [...sellers || []].sort(
      (a, b) => sellerDisplayName(a).localeCompare(sellerDisplayName(b), void 0, { sensitivity: "base" })
    );
  }
  var init_sellersSort = __esm({
    "src/lib/sellersSort.js"() {
    }
  });

  // src/lib/sellersAllCache.js
  function getCachedSellersAll() {
    if (sellersAllCache && Date.now() < sellersAllExpiresAt) {
      return sellersAllCache;
    }
    return null;
  }
  function setCachedSellersAll(data) {
    sellersAllCache = sortSellersByName(Array.isArray(data) ? data : []);
    sellersAllExpiresAt = Date.now() + SELLERS_ALL_TTL_MS;
    return sellersAllCache;
  }
  function invalidateSellersAllCache() {
    sellersAllCache = null;
    sellersAllExpiresAt = 0;
  }
  var SELLERS_ALL_TTL_MS, sellersAllCache, sellersAllExpiresAt;
  var init_sellersAllCache = __esm({
    "src/lib/sellersAllCache.js"() {
      init_sellersSort();
      SELLERS_ALL_TTL_MS = 5 * 6e4;
      sellersAllCache = null;
      sellersAllExpiresAt = 0;
    }
  });

  // src/lib/api.js
  function isSellersAllGet(config) {
    const method = String(config?.method || "get").toLowerCase();
    if (method !== "get") return false;
    const url = String(config?.url || "");
    return url === "/sellers/all" || url.endsWith("/sellers/all");
  }
  function headerValue(headers, key) {
    if (!headers) return void 0;
    if (typeof headers.get === "function") return headers.get(key);
    return headers[key] ?? headers[key.toLowerCase()];
  }
  var import_meta, API_BASE, api, currentToken, api_default;
  var init_api = __esm({
    "src/lib/api.js"() {
      init_axios2();
      init_sellersAllCache();
      import_meta = {};
      API_BASE = import_meta.env.VITE_API_URL || "http://localhost:5000/api";
      api = axios_default.create({
        baseURL: API_BASE,
        headers: { "Content-Type": "application/json" }
      });
      currentToken = null;
      api.interceptors.request.use((config) => {
        if (!isSellersAllGet(config)) return config;
        if (headerValue(config.headers, "x-bypass-sellers-cache") === "1") return config;
        if (config.params && Object.keys(config.params).length > 0) return config;
        const cached = getCachedSellersAll();
        if (!cached) return config;
        config.adapter = async () => ({
          data: cached,
          status: 200,
          statusText: "OK",
          headers: { "x-sellers-cache": "HIT" },
          config,
          request: {}
        });
        return config;
      });
      api.interceptors.response.use(
        (response) => {
          if (isSellersAllGet(response.config)) {
            setCachedSellersAll(response.data);
          }
          return response;
        },
        (error) => {
          const status = error.response?.status;
          const url = String(error.config?.url || "");
          const message = String(error.response?.data?.error || "");
          const isLoginRequest = url.includes("/auth/login");
          const isSessionInvalid = /token expired|invalid token|please login again|access permissions have been updated|unauthorized/i.test(message) || status === 401 && !error.response?.data?.error;
          if (status === 401 && !isLoginRequest && currentToken && isSessionInvalid) {
            currentToken = null;
            delete api.defaults.headers.common.Authorization;
            localStorage.removeItem("auth_token");
            localStorage.removeItem("user");
            invalidateSellersAllCache();
            if (window.location.pathname !== "/login") {
              window.location.href = "/login";
            }
          }
          return Promise.reject(error);
        }
      );
      api_default = api;
    }
  });

  // src/pages/admin/UserCategoryTargetsPage.jsx
  var import_react = __toESM(__require("react"), 1);
  var import_material = __require("@mui/material");
  var import_styles3 = __require("@mui/material/styles");
  var import_AddTask = __toESM(__require("@mui/icons-material/AddTask"), 1);
  var import_Cancel = __toESM(__require("@mui/icons-material/Cancel"), 1);
  var import_Delete = __toESM(__require("@mui/icons-material/Delete"), 1);
  var import_Edit = __toESM(__require("@mui/icons-material/Edit"), 1);
  init_api();

  // src/constants/brandTheme.js
  var BRAND_YELLOW = "#f5c842";
  var BRAND_YELLOW_DARK = "#f0b800";
  var BRAND_DARK = "#1a1a2e";

  // src/theme/tableStyles.js
  var import_styles2 = __require("@mui/material/styles");

  // src/theme/appTheme.js
  var import_styles = __require("@mui/material/styles");
  var dashboardSignatureTokens = {
    radius: {
      card: 16,
      pill: 999,
      control: 8
    },
    surfaces: {
      pageCard: "linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)",
      metricCard: "linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(240,249,255,0.95) 100%)",
      emptyState: "linear-gradient(135deg, #ffffff 0%, #ecf0f1 100%)"
    },
    shadows: {
      card: "0 8px 24px rgba(0, 0, 0, 0.08)",
      table: "0 12px 32px rgba(0, 0, 0, 0.1)"
    },
    table: {
      headerBackground: "#0f766e",
      headerForeground: "#ffffff",
      rowStripe: "rgba(240, 249, 255, 0.8)",
      rowHover: "rgba(20, 184, 166, 0.08)",
      rowBorder: "rgba(0, 0, 0, 0.06)",
      indexBadgeBackground: "rgba(20, 184, 166, 0.1)",
      indexBadgeForeground: "#0f766e"
    },
    tones: {
      neutral: { background: "rgba(15, 23, 42, 0.05)", border: "rgba(15, 23, 42, 0.08)", color: "#0f172a" },
      info: { background: "rgba(6, 182, 212, 0.12)", border: "rgba(6, 182, 212, 0.2)", color: "#0891b2" },
      success: { background: "rgba(16, 185, 129, 0.12)", border: "rgba(16, 185, 129, 0.2)", color: "#047857" },
      warning: { background: "rgba(245, 158, 11, 0.12)", border: "rgba(245, 158, 11, 0.18)", color: "#d97706" },
      danger: { background: "rgba(239, 68, 68, 0.12)", border: "rgba(239, 68, 68, 0.18)", color: "#dc2626" },
      amazon: { background: "rgba(249, 115, 22, 0.12)", border: "rgba(249, 115, 22, 0.18)", color: "#c2410c" },
      shipping: { background: "rgba(59, 130, 246, 0.12)", border: "rgba(59, 130, 246, 0.18)", color: "#2563eb" }
    }
  };
  var dashboardSignatureThemeOptions = {
    palette: {
      mode: "light",
      primary: {
        main: "#0f766e"
      },
      secondary: {
        main: "#06b6d4"
      },
      success: {
        main: "#10b981"
      },
      warning: {
        main: "#f59e0b"
      },
      error: {
        main: "#ef4444"
      },
      info: {
        main: "#0891b2"
      },
      background: {
        default: "#f0f9ff",
        paper: "#ffffff"
      }
    },
    shape: {
      borderRadius: dashboardSignatureTokens.radius.control
    },
    customTokens: {
      dashboardSignature: dashboardSignatureTokens
    }
  };

  // src/theme/tableStyles.js
  var tableHeaderCellSx = {
    fontWeight: 700,
    fontSize: "0.74rem",
    letterSpacing: 0.55,
    textTransform: "uppercase",
    color: "rgba(255, 255, 255, 0.96)",
    backgroundColor: BRAND_DARK,
    borderBottom: "none",
    whiteSpace: "nowrap",
    py: 1.75,
    // Ensure TableSortLabel inherits the white colour
    "& .MuiTableSortLabel-root": { color: "inherit" },
    "& .MuiTableSortLabel-root:hover": { color: "rgba(255,255,255,0.8)" },
    "& .MuiTableSortLabel-root.Mui-active": { color: "inherit" },
    "& .MuiTableSortLabel-icon": { color: "rgba(255,255,255,0.55) !important" }
  };
  var tableBodyRowSx = {
    "& td": {
      borderBottomColor: dashboardSignatureTokens.table.rowBorder
    },
    "&:nth-of-type(even) td": {
      backgroundColor: dashboardSignatureTokens.table.rowStripe
    },
    "&:hover td": {
      backgroundColor: `${dashboardSignatureTokens.table.rowHover} !important`
    },
    "&.Mui-selected td": {
      backgroundColor: `${(0, import_styles2.alpha)(BRAND_YELLOW, 0.16)} !important`
    }
  };
  var tableBodyCellSx = {
    py: 1.4,
    px: 1.5,
    borderBottom: `1px solid ${dashboardSignatureTokens.table.rowBorder}`,
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums"
  };
  var tableContainerSx = {
    borderRadius: `${dashboardSignatureTokens.radius.card}px`,
    border: "1px solid",
    borderColor: (0, import_styles2.alpha)(BRAND_DARK, 0.1),
    boxShadow: dashboardSignatureTokens.shadows.table,
    overflow: "hidden"
  };
  var tableIndexBadgeSx = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 32,
    height: 32,
    borderRadius: "50%",
    backgroundColor: dashboardSignatureTokens.table.indexBadgeBackground,
    color: dashboardSignatureTokens.table.indexBadgeForeground,
    fontWeight: 700,
    fontSize: "0.875rem"
  };
  var _actionButtonBase = {
    minHeight: 36,
    px: 1.5,
    borderRadius: 1.5,
    boxSizing: "border-box",
    whiteSpace: "nowrap"
  };
  var yellowOutlinedButtonSx = {
    ..._actionButtonBase,
    color: BRAND_DARK,
    borderColor: BRAND_YELLOW_DARK,
    backgroundColor: (0, import_styles2.alpha)(BRAND_YELLOW, 0.08),
    "&:hover": {
      borderColor: BRAND_YELLOW_DARK,
      backgroundColor: (0, import_styles2.alpha)(BRAND_YELLOW, 0.18),
      boxShadow: `0 8px 18px ${(0, import_styles2.alpha)(BRAND_YELLOW_DARK, 0.18)}`
    },
    "&.Mui-disabled": {
      borderColor: (0, import_styles2.alpha)(BRAND_DARK, 0.16),
      color: (0, import_styles2.alpha)(BRAND_DARK, 0.35),
      backgroundColor: (0, import_styles2.alpha)(BRAND_DARK, 0.03)
    }
  };
  var yellowFilledButtonSx = {
    ..._actionButtonBase,
    color: BRAND_DARK,
    backgroundColor: BRAND_YELLOW,
    boxShadow: `0 10px 20px ${(0, import_styles2.alpha)(BRAND_YELLOW_DARK, 0.2)}`,
    "&:hover": {
      backgroundColor: BRAND_YELLOW_DARK,
      boxShadow: `0 12px 22px ${(0, import_styles2.alpha)(BRAND_YELLOW_DARK, 0.26)}`
    },
    "&.Mui-disabled": {
      color: (0, import_styles2.alpha)(BRAND_DARK, 0.35),
      backgroundColor: (0, import_styles2.alpha)(BRAND_YELLOW, 0.38),
      boxShadow: "none"
    }
  };

  // src/pages/admin/UserCategoryTargetsPage.jsx
  var EMPTY_FORM = {
    user: null,
    seller: null,
    marketplace: "",
    category: null,
    range: null,
    dailyDesiredQuantity: ""
  };
  var MARKETPLACES = ["US", "UK", "AU", "Canada"];
  function UserCategoryTargetsPage() {
    const theme = (0, import_styles3.useTheme)();
    const [users, setUsers] = (0, import_react.useState)([]);
    const [sellers, setSellers] = (0, import_react.useState)([]);
    const [categories, setCategories] = (0, import_react.useState)([]);
    const [ranges, setRanges] = (0, import_react.useState)([]);
    const [targets, setTargets] = (0, import_react.useState)([]);
    const [form, setForm] = (0, import_react.useState)(EMPTY_FORM);
    const [editingId, setEditingId] = (0, import_react.useState)(null);
    const [loading, setLoading] = (0, import_react.useState)(true);
    const [saving, setSaving] = (0, import_react.useState)(false);
    const [deleteId, setDeleteId] = (0, import_react.useState)(null);
    const [message, setMessage] = (0, import_react.useState)("");
    const [error, setError] = (0, import_react.useState)("");
    const [targetFilters, setTargetFilters] = (0, import_react.useState)({
      user: null,
      search: ""
    });
    const inputSx = {
      "& label.Mui-focused": { color: `${BRAND_YELLOW_DARK} !important` },
      "& .MuiOutlinedInput-root": {
        borderRadius: 1.5,
        "&:hover fieldset": { borderColor: `${(0, import_styles3.alpha)(BRAND_DARK, 0.35)} !important` },
        "&.Mui-focused fieldset": { borderColor: `${BRAND_YELLOW_DARK} !important` }
      }
    };
    (0, import_react.useEffect)(() => {
      loadPage();
    }, []);
    const loadPage = async () => {
      setLoading(true);
      setError("");
      try {
        const [usersRes, sellersRes, categoriesRes, rangesRes, targetsRes] = await Promise.all([
          api_default.get("/users"),
          api_default.get("/sellers/all"),
          api_default.get("/asin-list-categories"),
          api_default.get("/asin-list-ranges", { params: { all: true } }),
          api_default.get("/user-category-targets")
        ]);
        setUsers((usersRes.data || []).filter((user) => user.role !== "seller"));
        setSellers(sellersRes.data || []);
        setCategories(categoriesRes.data || []);
        setRanges(rangesRes.data || []);
        setTargets(targetsRes.data || []);
      } catch (err) {
        setError(err.response?.data?.error || "Failed to load desired quantity targets.");
      } finally {
        setLoading(false);
      }
    };
    const fetchTargets = async () => {
      const { data } = await api_default.get("/user-category-targets");
      setTargets(data || []);
    };
    const getUserLabel = (user) => {
      if (!user) return "";
      const detail = user.email || user.role || "";
      return detail ? `${user.username} (${detail})` : user.username;
    };
    const getSellerLabel = (seller) => seller?.user?.username || seller?.user?.email || seller?.storeName || seller?._id || "";
    const getCategoryLabel = (category) => category?.name || "";
    const getRangeLabel = (range) => range?.name || "";
    const selectedUserTargets = (0, import_react.useMemo)(() => {
      const normalizedSearch = targetFilters.search.trim().toLowerCase();
      return targets.filter((target) => {
        const matchesUser = !targetFilters.user || target.user?._id === targetFilters.user._id;
        if (!matchesUser) return false;
        if (!normalizedSearch) return true;
        const searchableText = [
          getUserLabel(target.user),
          target.user?.department,
          getSellerLabel(target.seller),
          target.marketplace,
          target.category?.name,
          target.range?.name,
          target.dailyDesiredQuantity
        ].filter(Boolean).join(" ").toLowerCase();
        return searchableText.includes(normalizedSearch);
      });
    }, [targetFilters, targets]);
    const selectedUserSummary = (0, import_react.useMemo)(() => {
      const sellerNames = /* @__PURE__ */ new Set();
      const categoryNames = /* @__PURE__ */ new Set();
      const totalQuantity = selectedUserTargets.reduce((sum, target) => {
        if (target.seller) sellerNames.add(getSellerLabel(target.seller));
        if (target.category?.name) categoryNames.add(target.category.name);
        return sum + Number(target.dailyDesiredQuantity || 0);
      }, 0);
      return {
        sellers: sellerNames.size,
        categories: categoryNames.size,
        totalQuantity
      };
    }, [selectedUserTargets]);
    const filteredRanges = form.category ? ranges.filter((range) => String(range.categoryId?._id || range.categoryId) === form.category._id) : [];
    const resetForm = () => {
      setForm(EMPTY_FORM);
      setEditingId(null);
    };
    const handleEdit = (target) => {
      setEditingId(target._id);
      setForm({
        user: users.find((user) => user._id === target.user?._id) || target.user || null,
        seller: sellers.find((seller) => seller._id === target.seller?._id) || target.seller || null,
        marketplace: target.marketplace || "",
        category: categories.find((category) => category._id === target.category?._id) || target.category || null,
        range: ranges.find((range) => range._id === target.range?._id) || target.range || null,
        dailyDesiredQuantity: String(target.dailyDesiredQuantity ?? 0)
      });
      setError("");
      setMessage("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    const handleSave = async () => {
      setError("");
      setMessage("");
      if (!form.user) return setError("Please select a user.");
      if (!form.seller) return setError("Please select a seller.");
      if (!form.marketplace) return setError("Please select a marketplace.");
      if (!form.category) return setError("Please select a category.");
      const quantity = Number(form.dailyDesiredQuantity);
      if (!Number.isFinite(quantity) || quantity < 0) {
        return setError("Daily desired quantity must be 0 or higher.");
      }
      setSaving(true);
      try {
        await api_default.post("/user-category-targets", {
          userId: form.user._id,
          sellerId: form.seller._id,
          marketplace: form.marketplace,
          categoryId: form.category._id,
          rangeId: form.range?._id || null,
          dailyDesiredQuantity: quantity
        });
        setMessage(editingId ? "Desired quantity updated." : "Desired quantity saved.");
        resetForm();
        await fetchTargets();
      } catch (err) {
        setError(err.response?.data?.error || "Failed to save desired quantity.");
      } finally {
        setSaving(false);
      }
    };
    const handleDelete = async (id) => {
      setDeleteId(id);
      setError("");
      setMessage("");
      try {
        await api_default.delete(`/user-category-targets/${id}`);
        setTargets((prev) => prev.filter((target) => target._id !== id));
        if (editingId === id) resetForm();
      } catch (err) {
        setError(err.response?.data?.error || "Failed to delete desired quantity.");
      } finally {
        setDeleteId(null);
      }
    };
    return /* @__PURE__ */ import_react.default.createElement(import_material.Box, { sx: { px: { xs: 2, md: 3 }, pb: 5, backgroundColor: theme.palette.background.paper, minHeight: "100vh" } }, /* @__PURE__ */ import_react.default.createElement(import_material.Stack, { direction: "row", alignItems: "center", spacing: 1.5, sx: { pt: 2.5, mb: 3 } }, /* @__PURE__ */ import_react.default.createElement(
      import_material.Box,
      {
        sx: {
          width: 40,
          height: 40,
          borderRadius: 2,
          flexShrink: 0,
          background: BRAND_DARK,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 4px 12px ${(0, import_styles3.alpha)(BRAND_DARK, 0.24)}`
        }
      },
      /* @__PURE__ */ import_react.default.createElement(import_AddTask.default, { sx: { color: BRAND_YELLOW, fontSize: 22 } })
    ), /* @__PURE__ */ import_react.default.createElement(import_material.Box, null, /* @__PURE__ */ import_react.default.createElement(import_material.Typography, { variant: "h5", fontWeight: 800, sx: { color: BRAND_DARK } }, "User Category Targets"), /* @__PURE__ */ import_react.default.createElement(import_material.Typography, { variant: "caption", sx: { color: (0, import_styles3.alpha)(BRAND_DARK, 0.5), fontWeight: 500 } }, "Set editable daily desired quantities by user, seller, and category"))), /* @__PURE__ */ import_react.default.createElement(import_material.Paper, { elevation: 0, sx: { p: 3, mb: 3, borderRadius: 2, border: `1px solid ${(0, import_styles3.alpha)(BRAND_DARK, 0.1)}` } }, /* @__PURE__ */ import_react.default.createElement(import_material.Typography, { variant: "subtitle1", fontWeight: 700, sx: { color: BRAND_DARK, mb: 2 } }, editingId ? "Edit Desired Quantity" : "Set Desired Quantity"), /* @__PURE__ */ import_react.default.createElement(import_material.Stack, { direction: { xs: "column", lg: "row" }, spacing: 2 }, /* @__PURE__ */ import_react.default.createElement(
      import_material.Autocomplete,
      {
        options: users,
        getOptionLabel: getUserLabel,
        value: form.user,
        onChange: (_, value) => setForm((prev) => ({ ...prev, user: value })),
        isOptionEqualToValue: (option, value) => option._id === value._id,
        sx: { minWidth: 240, flex: 1 },
        renderInput: (params) => /* @__PURE__ */ import_react.default.createElement(import_material.TextField, { ...params, label: "User", sx: inputSx })
      }
    ), /* @__PURE__ */ import_react.default.createElement(
      import_material.Autocomplete,
      {
        options: sellers,
        getOptionLabel: getSellerLabel,
        value: form.seller,
        onChange: (_, value) => setForm((prev) => ({ ...prev, seller: value })),
        isOptionEqualToValue: (option, value) => option._id === value._id,
        sx: { minWidth: 240, flex: 1 },
        renderInput: (params) => /* @__PURE__ */ import_react.default.createElement(import_material.TextField, { ...params, label: "Seller", sx: inputSx })
      }
    ), /* @__PURE__ */ import_react.default.createElement(import_material.FormControl, { sx: { minWidth: 170 } }, /* @__PURE__ */ import_react.default.createElement(import_material.InputLabel, { sx: { "&.Mui-focused": { color: BRAND_YELLOW_DARK } } }, "Marketplace"), /* @__PURE__ */ import_react.default.createElement(
      import_material.Select,
      {
        value: form.marketplace,
        label: "Marketplace",
        onChange: (event) => setForm((prev) => ({ ...prev, marketplace: event.target.value })),
        sx: {
          borderRadius: 1.5,
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: `${BRAND_YELLOW_DARK} !important` }
        }
      },
      MARKETPLACES.map((marketplace) => /* @__PURE__ */ import_react.default.createElement(import_material.MenuItem, { key: marketplace, value: marketplace }, marketplace))
    )), /* @__PURE__ */ import_react.default.createElement(
      import_material.Autocomplete,
      {
        options: categories,
        getOptionLabel: getCategoryLabel,
        value: form.category,
        onChange: (_, value) => setForm((prev) => ({ ...prev, category: value, range: null })),
        isOptionEqualToValue: (option, value) => option._id === value._id,
        sx: { minWidth: 220, flex: 1 },
        renderInput: (params) => /* @__PURE__ */ import_react.default.createElement(import_material.TextField, { ...params, label: "Category", sx: inputSx })
      }
    ), /* @__PURE__ */ import_react.default.createElement(
      import_material.Autocomplete,
      {
        options: filteredRanges,
        getOptionLabel: getRangeLabel,
        value: form.range,
        onChange: (_, value) => setForm((prev) => ({ ...prev, range: value })),
        isOptionEqualToValue: (option, value) => option._id === value._id,
        disabled: !form.category,
        sx: { minWidth: 220, flex: 1 },
        renderInput: (params) => /* @__PURE__ */ import_react.default.createElement(import_material.TextField, { ...params, label: "Range (Optional)", sx: inputSx })
      }
    ), /* @__PURE__ */ import_react.default.createElement(
      import_material.TextField,
      {
        label: "Daily Desired Quantity",
        type: "number",
        value: form.dailyDesiredQuantity,
        onChange: (event) => setForm((prev) => ({ ...prev, dailyDesiredQuantity: event.target.value })),
        inputProps: { min: 0, step: 1 },
        sx: { minWidth: 220, ...inputSx }
      }
    )), /* @__PURE__ */ import_react.default.createElement(import_material.Stack, { direction: "row", spacing: 1.5, alignItems: "center", sx: { mt: 2.5 } }, /* @__PURE__ */ import_react.default.createElement(
      import_material.Button,
      {
        variant: "contained",
        onClick: handleSave,
        disabled: saving || loading,
        startIcon: saving ? /* @__PURE__ */ import_react.default.createElement(import_material.CircularProgress, { size: 16, color: "inherit" }) : /* @__PURE__ */ import_react.default.createElement(import_AddTask.default, null),
        sx: yellowFilledButtonSx
      },
      saving ? "Saving..." : editingId ? "Update Quantity" : "Save Quantity"
    ), editingId && /* @__PURE__ */ import_react.default.createElement(
      import_material.Button,
      {
        variant: "outlined",
        startIcon: /* @__PURE__ */ import_react.default.createElement(import_Cancel.default, null),
        onClick: resetForm,
        sx: { borderRadius: 1.5, color: BRAND_DARK, borderColor: (0, import_styles3.alpha)(BRAND_DARK, 0.3) }
      },
      "Cancel"
    ), error && /* @__PURE__ */ import_react.default.createElement(import_material.Alert, { severity: "error", sx: { py: 0, flexGrow: 1 } }, error), message && /* @__PURE__ */ import_react.default.createElement(import_material.Alert, { severity: "success", sx: { py: 0, flexGrow: 1 } }, message))), /* @__PURE__ */ import_react.default.createElement(import_material.Paper, { elevation: 0, sx: { borderRadius: 2, border: `1px solid ${(0, import_styles3.alpha)(BRAND_DARK, 0.1)}`, overflow: "hidden" } }, /* @__PURE__ */ import_react.default.createElement(import_material.Box, { sx: { px: 3, py: 2, borderBottom: `1px solid ${(0, import_styles3.alpha)(BRAND_DARK, 0.08)}` } }, /* @__PURE__ */ import_react.default.createElement(
      import_material.Stack,
      {
        direction: { xs: "column", md: "row" },
        spacing: 2,
        alignItems: { xs: "stretch", md: "center" },
        justifyContent: "space-between"
      },
      /* @__PURE__ */ import_react.default.createElement(import_material.Box, null, /* @__PURE__ */ import_react.default.createElement(import_material.Typography, { variant: "subtitle1", fontWeight: 700, sx: { color: BRAND_DARK } }, "Saved Desired Quantities", !loading && /* @__PURE__ */ import_react.default.createElement(import_material.Typography, { component: "span", variant: "caption", sx: { ml: 1, color: (0, import_styles3.alpha)(BRAND_DARK, 0.45), fontWeight: 500 } }, "(", selectedUserTargets.length, " of ", targets.length, " record", targets.length === 1 ? "" : "s", ")")), !loading && targetFilters.user && /* @__PURE__ */ import_react.default.createElement(import_material.Typography, { variant: "caption", sx: { color: (0, import_styles3.alpha)(BRAND_DARK, 0.55), fontWeight: 600 } }, selectedUserSummary.totalQuantity.toLocaleString(), " daily quota across ", selectedUserSummary.sellers, " seller", selectedUserSummary.sellers === 1 ? "" : "s", " and ", selectedUserSummary.categories, " categor", selectedUserSummary.categories === 1 ? "y" : "ies")),
      /* @__PURE__ */ import_react.default.createElement(import_material.Stack, { direction: { xs: "column", sm: "row" }, spacing: 1.5, sx: { minWidth: { md: 680 } } }, /* @__PURE__ */ import_react.default.createElement(
        import_material.Autocomplete,
        {
          options: users,
          getOptionLabel: getUserLabel,
          value: targetFilters.user,
          onChange: (_, value) => setTargetFilters((prev) => ({ ...prev, user: value })),
          isOptionEqualToValue: (option, value) => option._id === value._id,
          sx: { minWidth: { xs: "100%", sm: 280 }, flex: 1 },
          renderInput: (params) => /* @__PURE__ */ import_react.default.createElement(import_material.TextField, { ...params, label: "View assignments for user", size: "small", sx: inputSx })
        }
      ), /* @__PURE__ */ import_react.default.createElement(
        import_material.TextField,
        {
          label: "Search seller, category, range",
          size: "small",
          value: targetFilters.search,
          onChange: (event) => setTargetFilters((prev) => ({ ...prev, search: event.target.value })),
          sx: { minWidth: { xs: "100%", sm: 260 }, flex: 1, ...inputSx }
        }
      ), (targetFilters.user || targetFilters.search) && /* @__PURE__ */ import_react.default.createElement(
        import_material.Button,
        {
          variant: "outlined",
          onClick: () => setTargetFilters({ user: null, search: "" }),
          sx: { borderRadius: 1.5, color: BRAND_DARK, borderColor: (0, import_styles3.alpha)(BRAND_DARK, 0.3), whiteSpace: "nowrap" }
        },
        "Clear"
      ))
    )), loading ? /* @__PURE__ */ import_react.default.createElement(import_material.Box, { sx: { p: 4, textAlign: "center" } }, /* @__PURE__ */ import_react.default.createElement(import_material.CircularProgress, { size: 28, sx: { color: BRAND_YELLOW_DARK } })) : targets.length === 0 ? /* @__PURE__ */ import_react.default.createElement(import_material.Box, { sx: { p: 4, textAlign: "center" } }, /* @__PURE__ */ import_react.default.createElement(import_material.Typography, { variant: "body2", sx: { color: (0, import_styles3.alpha)(BRAND_DARK, 0.45) } }, "No desired quantities saved yet.")) : selectedUserTargets.length === 0 ? /* @__PURE__ */ import_react.default.createElement(import_material.Box, { sx: { p: 4, textAlign: "center" } }, /* @__PURE__ */ import_react.default.createElement(import_material.Typography, { variant: "body2", sx: { color: (0, import_styles3.alpha)(BRAND_DARK, 0.45) } }, "No saved desired quantities match the selected filters.")) : /* @__PURE__ */ import_react.default.createElement(import_material.TableContainer, null, /* @__PURE__ */ import_react.default.createElement(import_material.Table, { size: "small" }, /* @__PURE__ */ import_react.default.createElement(import_material.TableHead, null, /* @__PURE__ */ import_react.default.createElement(import_material.TableRow, null, /* @__PURE__ */ import_react.default.createElement(import_material.TableCell, { sx: tableHeaderCellSx }, "User"), /* @__PURE__ */ import_react.default.createElement(import_material.TableCell, { sx: tableHeaderCellSx }, "Department"), /* @__PURE__ */ import_react.default.createElement(import_material.TableCell, { sx: tableHeaderCellSx }, "Seller"), /* @__PURE__ */ import_react.default.createElement(import_material.TableCell, { sx: tableHeaderCellSx }, "Marketplace"), /* @__PURE__ */ import_react.default.createElement(import_material.TableCell, { sx: tableHeaderCellSx }, "Category"), /* @__PURE__ */ import_react.default.createElement(import_material.TableCell, { sx: tableHeaderCellSx }, "Range"), /* @__PURE__ */ import_react.default.createElement(import_material.TableCell, { sx: tableHeaderCellSx, align: "right" }, "Daily Desired Quantity"), /* @__PURE__ */ import_react.default.createElement(import_material.TableCell, { sx: tableHeaderCellSx, align: "center" }, "Actions"))), /* @__PURE__ */ import_react.default.createElement(import_material.TableBody, null, selectedUserTargets.map((target) => {
      const isEditing = editingId === target._id;
      return /* @__PURE__ */ import_react.default.createElement(import_material.TableRow, { key: target._id, sx: { ...tableBodyRowSx, ...isEditing ? { "& td": { backgroundColor: `${(0, import_styles3.alpha)(BRAND_YELLOW, 0.14)} !important` } } : {} } }, /* @__PURE__ */ import_react.default.createElement(import_material.TableCell, { sx: tableBodyCellSx }, getUserLabel(target.user)), /* @__PURE__ */ import_react.default.createElement(import_material.TableCell, { sx: tableBodyCellSx }, target.user?.department || "-"), /* @__PURE__ */ import_react.default.createElement(import_material.TableCell, { sx: tableBodyCellSx }, getSellerLabel(target.seller)), /* @__PURE__ */ import_react.default.createElement(import_material.TableCell, { sx: tableBodyCellSx }, target.marketplace || "-"), /* @__PURE__ */ import_react.default.createElement(import_material.TableCell, { sx: tableBodyCellSx }, target.category?.name || "-"), /* @__PURE__ */ import_react.default.createElement(import_material.TableCell, { sx: tableBodyCellSx }, target.range?.name || "All ranges"), /* @__PURE__ */ import_react.default.createElement(import_material.TableCell, { sx: { ...tableBodyCellSx, fontWeight: 700 }, align: "right" }, Number(target.dailyDesiredQuantity || 0).toLocaleString()), /* @__PURE__ */ import_react.default.createElement(import_material.TableCell, { sx: tableBodyCellSx, align: "center" }, /* @__PURE__ */ import_react.default.createElement(import_material.Stack, { direction: "row", spacing: 0.5, justifyContent: "center" }, /* @__PURE__ */ import_react.default.createElement(import_material.Tooltip, { title: "Edit" }, /* @__PURE__ */ import_react.default.createElement("span", null, /* @__PURE__ */ import_react.default.createElement(import_material.IconButton, { size: "small", onClick: () => handleEdit(target), sx: { color: BRAND_DARK } }, /* @__PURE__ */ import_react.default.createElement(import_Edit.default, { fontSize: "small" })))), /* @__PURE__ */ import_react.default.createElement(import_material.Tooltip, { title: "Delete" }, /* @__PURE__ */ import_react.default.createElement("span", null, /* @__PURE__ */ import_react.default.createElement(import_material.IconButton, { size: "small", onClick: () => handleDelete(target._id), disabled: deleteId === target._id, sx: { color: "#c0392b" } }, deleteId === target._id ? /* @__PURE__ */ import_react.default.createElement(import_material.CircularProgress, { size: 16 }) : /* @__PURE__ */ import_react.default.createElement(import_Delete.default, { fontSize: "small" })))))));
    }))))));
  }
})();
