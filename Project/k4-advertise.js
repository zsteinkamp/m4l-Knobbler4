var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
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

// node_modules/jsbi/dist/jsbi-cjs.js
var require_jsbi_cjs = __commonJS({
  "node_modules/jsbi/dist/jsbi-cjs.js"(exports2, module2) {
    "use strict";
    var JSBI = class _JSBI extends Array {
      constructor(a, b) {
        if (a > _JSBI.__kMaxLength) throw new RangeError("Maximum BigInt size exceeded");
        super(a), this.sign = b;
      }
      static BigInt(a) {
        var b = Math.floor, c = Number.isFinite;
        if ("number" == typeof a) {
          if (0 === a) return _JSBI.__zero();
          if ((0 | a) === a) return 0 > a ? _JSBI.__oneDigit(-a, true) : _JSBI.__oneDigit(a, false);
          if (!c(a) || b(a) !== a) throw new RangeError("The number " + a + " cannot be converted to BigInt because it is not an integer");
          return _JSBI.__fromDouble(a);
        }
        if ("string" == typeof a) {
          const b2 = _JSBI.__fromString(a);
          if (null === b2) throw new SyntaxError("Cannot convert " + a + " to a BigInt");
          return b2;
        }
        if ("boolean" == typeof a) return true === a ? _JSBI.__oneDigit(1, false) : _JSBI.__zero();
        if ("object" == typeof a) {
          if (a.constructor === _JSBI) return a;
          const b2 = _JSBI.__toPrimitive(a);
          return _JSBI.BigInt(b2);
        }
        throw new TypeError("Cannot convert " + a + " to a BigInt");
      }
      toDebugString() {
        const a = ["BigInt["];
        for (const b of this) a.push((b ? (b >>> 0).toString(16) : b) + ", ");
        return a.push("]"), a.join("");
      }
      toString(a = 10) {
        if (2 > a || 36 < a) throw new RangeError("toString() radix argument must be between 2 and 36");
        return 0 === this.length ? "0" : 0 == (a & a - 1) ? _JSBI.__toStringBasePowerOfTwo(this, a) : _JSBI.__toStringGeneric(this, a, false);
      }
      static toNumber(a) {
        var b = Math.clz32;
        const c = a.length;
        if (0 === c) return 0;
        if (1 === c) {
          const b2 = a.__unsignedDigit(0);
          return a.sign ? -b2 : b2;
        }
        const d = a.__digit(c - 1), e = b(d), f = 32 * c - e;
        if (1024 < f) return a.sign ? -Infinity : 1 / 0;
        let g = f - 1, h = d, i = c - 1;
        const j = e + 1;
        let k = 32 === j ? 0 : h << j;
        k >>>= 12;
        const l = j - 12;
        let m = 12 <= j ? 0 : h << 20 + j, n = 20 + j;
        0 < l && 0 < i && (i--, h = a.__digit(i), k |= h >>> 32 - l, m = h << l, n = l), 0 < n && 0 < i && (i--, h = a.__digit(i), m |= h >>> 32 - n, n -= 32);
        const o = _JSBI.__decideRounding(a, n, i, h);
        if ((1 === o || 0 === o && 1 == (1 & m)) && (m = m + 1 >>> 0, 0 == m && (k++, 0 != k >>> 20 && (k = 0, g++, 1023 < g)))) return a.sign ? -Infinity : 1 / 0;
        const p = a.sign ? -2147483648 : 0;
        return g = g + 1023 << 20, _JSBI.__kBitConversionInts[1] = p | g | k, _JSBI.__kBitConversionInts[0] = m, _JSBI.__kBitConversionDouble[0];
      }
      static unaryMinus(a) {
        if (0 === a.length) return a;
        const b = a.__copy();
        return b.sign = !a.sign, b;
      }
      static bitwiseNot(a) {
        return a.sign ? _JSBI.__absoluteSubOne(a).__trim() : _JSBI.__absoluteAddOne(a, true);
      }
      static exponentiate(a, b) {
        if (b.sign) throw new RangeError("Exponent must be positive");
        if (0 === b.length) return _JSBI.__oneDigit(1, false);
        if (0 === a.length) return a;
        if (1 === a.length && 1 === a.__digit(0)) return a.sign && 0 == (1 & b.__digit(0)) ? _JSBI.unaryMinus(a) : a;
        if (1 < b.length) throw new RangeError("BigInt too big");
        let c = b.__unsignedDigit(0);
        if (1 === c) return a;
        if (c >= _JSBI.__kMaxLengthBits) throw new RangeError("BigInt too big");
        if (1 === a.length && 2 === a.__digit(0)) {
          const b2 = 1 + (c >>> 5), d2 = a.sign && 0 != (1 & c), e2 = new _JSBI(b2, d2);
          e2.__initializeDigits();
          const f = 1 << (31 & c);
          return e2.__setDigit(b2 - 1, f), e2;
        }
        let d = null, e = a;
        for (0 != (1 & c) && (d = a), c >>= 1; 0 !== c; c >>= 1) e = _JSBI.multiply(e, e), 0 != (1 & c) && (null === d ? d = e : d = _JSBI.multiply(d, e));
        return d;
      }
      static multiply(a, b) {
        if (0 === a.length) return a;
        if (0 === b.length) return b;
        let c = a.length + b.length;
        32 <= a.__clzmsd() + b.__clzmsd() && c--;
        const d = new _JSBI(c, a.sign !== b.sign);
        d.__initializeDigits();
        for (let c2 = 0; c2 < a.length; c2++) _JSBI.__multiplyAccumulate(b, a.__digit(c2), d, c2);
        return d.__trim();
      }
      static divide(a, b) {
        if (0 === b.length) throw new RangeError("Division by zero");
        if (0 > _JSBI.__absoluteCompare(a, b)) return _JSBI.__zero();
        const c = a.sign !== b.sign, d = b.__unsignedDigit(0);
        let e;
        if (1 === b.length && 65535 >= d) {
          if (1 === d) return c === a.sign ? a : _JSBI.unaryMinus(a);
          e = _JSBI.__absoluteDivSmall(a, d, null);
        } else e = _JSBI.__absoluteDivLarge(a, b, true, false);
        return e.sign = c, e.__trim();
      }
      static remainder(a, b) {
        if (0 === b.length) throw new RangeError("Division by zero");
        if (0 > _JSBI.__absoluteCompare(a, b)) return a;
        const c = b.__unsignedDigit(0);
        if (1 === b.length && 65535 >= c) {
          if (1 === c) return _JSBI.__zero();
          const b2 = _JSBI.__absoluteModSmall(a, c);
          return 0 === b2 ? _JSBI.__zero() : _JSBI.__oneDigit(b2, a.sign);
        }
        const d = _JSBI.__absoluteDivLarge(a, b, false, true);
        return d.sign = a.sign, d.__trim();
      }
      static add(a, b) {
        const c = a.sign;
        return c === b.sign ? _JSBI.__absoluteAdd(a, b, c) : 0 <= _JSBI.__absoluteCompare(a, b) ? _JSBI.__absoluteSub(a, b, c) : _JSBI.__absoluteSub(b, a, !c);
      }
      static subtract(a, b) {
        const c = a.sign;
        return c === b.sign ? 0 <= _JSBI.__absoluteCompare(a, b) ? _JSBI.__absoluteSub(a, b, c) : _JSBI.__absoluteSub(b, a, !c) : _JSBI.__absoluteAdd(a, b, c);
      }
      static leftShift(a, b) {
        return 0 === b.length || 0 === a.length ? a : b.sign ? _JSBI.__rightShiftByAbsolute(a, b) : _JSBI.__leftShiftByAbsolute(a, b);
      }
      static signedRightShift(a, b) {
        return 0 === b.length || 0 === a.length ? a : b.sign ? _JSBI.__leftShiftByAbsolute(a, b) : _JSBI.__rightShiftByAbsolute(a, b);
      }
      static unsignedRightShift() {
        throw new TypeError("BigInts have no unsigned right shift; use >> instead");
      }
      static lessThan(a, b) {
        return 0 > _JSBI.__compareToBigInt(a, b);
      }
      static lessThanOrEqual(a, b) {
        return 0 >= _JSBI.__compareToBigInt(a, b);
      }
      static greaterThan(a, b) {
        return 0 < _JSBI.__compareToBigInt(a, b);
      }
      static greaterThanOrEqual(a, b) {
        return 0 <= _JSBI.__compareToBigInt(a, b);
      }
      static equal(a, b) {
        if (a.sign !== b.sign) return false;
        if (a.length !== b.length) return false;
        for (let c = 0; c < a.length; c++) if (a.__digit(c) !== b.__digit(c)) return false;
        return true;
      }
      static bitwiseAnd(a, b) {
        var c = Math.max;
        if (!a.sign && !b.sign) return _JSBI.__absoluteAnd(a, b).__trim();
        if (a.sign && b.sign) {
          const d = c(a.length, b.length) + 1;
          let e = _JSBI.__absoluteSubOne(a, d);
          const f = _JSBI.__absoluteSubOne(b);
          return e = _JSBI.__absoluteOr(e, f, e), _JSBI.__absoluteAddOne(e, true, e).__trim();
        }
        return a.sign && ([a, b] = [b, a]), _JSBI.__absoluteAndNot(a, _JSBI.__absoluteSubOne(b)).__trim();
      }
      static bitwiseXor(a, b) {
        var c = Math.max;
        if (!a.sign && !b.sign) return _JSBI.__absoluteXor(a, b).__trim();
        if (a.sign && b.sign) {
          const d2 = c(a.length, b.length), e2 = _JSBI.__absoluteSubOne(a, d2), f = _JSBI.__absoluteSubOne(b);
          return _JSBI.__absoluteXor(e2, f, e2).__trim();
        }
        const d = c(a.length, b.length) + 1;
        a.sign && ([a, b] = [b, a]);
        let e = _JSBI.__absoluteSubOne(b, d);
        return e = _JSBI.__absoluteXor(e, a, e), _JSBI.__absoluteAddOne(e, true, e).__trim();
      }
      static bitwiseOr(a, b) {
        var c = Math.max;
        const d = c(a.length, b.length);
        if (!a.sign && !b.sign) return _JSBI.__absoluteOr(a, b).__trim();
        if (a.sign && b.sign) {
          let c2 = _JSBI.__absoluteSubOne(a, d);
          const e2 = _JSBI.__absoluteSubOne(b);
          return c2 = _JSBI.__absoluteAnd(c2, e2, c2), _JSBI.__absoluteAddOne(c2, true, c2).__trim();
        }
        a.sign && ([a, b] = [b, a]);
        let e = _JSBI.__absoluteSubOne(b, d);
        return e = _JSBI.__absoluteAndNot(e, a, e), _JSBI.__absoluteAddOne(e, true, e).__trim();
      }
      static ADD(a, b) {
        if (a = _JSBI.__toPrimitive(a), b = _JSBI.__toPrimitive(b), "string" == typeof a) return "string" != typeof b && (b = b.toString()), a + b;
        if ("string" == typeof b) return a.toString() + b;
        if (a = _JSBI.__toNumeric(a), b = _JSBI.__toNumeric(b), _JSBI.__isBigInt(a) && _JSBI.__isBigInt(b)) return _JSBI.add(a, b);
        if ("number" == typeof a && "number" == typeof b) return a + b;
        throw new TypeError("Cannot mix BigInt and other types, use explicit conversions");
      }
      static LT(a, b) {
        return _JSBI.__compare(a, b, 0);
      }
      static LE(a, b) {
        return _JSBI.__compare(a, b, 1);
      }
      static GT(a, b) {
        return _JSBI.__compare(a, b, 2);
      }
      static GE(a, b) {
        return _JSBI.__compare(a, b, 3);
      }
      static EQ(a, b) {
        for (; ; ) {
          if (_JSBI.__isBigInt(a)) return _JSBI.__isBigInt(b) ? _JSBI.equal(a, b) : _JSBI.EQ(b, a);
          if ("number" == typeof a) {
            if (_JSBI.__isBigInt(b)) return _JSBI.__equalToNumber(b, a);
            if ("object" != typeof b) return a == b;
            b = _JSBI.__toPrimitive(b);
          } else if ("string" == typeof a) {
            if (_JSBI.__isBigInt(b)) return a = _JSBI.__fromString(a), null !== a && _JSBI.equal(a, b);
            if ("object" != typeof b) return a == b;
            b = _JSBI.__toPrimitive(b);
          } else if ("boolean" == typeof a) {
            if (_JSBI.__isBigInt(b)) return _JSBI.__equalToNumber(b, +a);
            if ("object" != typeof b) return a == b;
            b = _JSBI.__toPrimitive(b);
          } else if ("symbol" == typeof a) {
            if (_JSBI.__isBigInt(b)) return false;
            if ("object" != typeof b) return a == b;
            b = _JSBI.__toPrimitive(b);
          } else if ("object" == typeof a) {
            if ("object" == typeof b && b.constructor !== _JSBI) return a == b;
            a = _JSBI.__toPrimitive(a);
          } else return a == b;
        }
      }
      static __zero() {
        return new _JSBI(0, false);
      }
      static __oneDigit(a, b) {
        const c = new _JSBI(1, b);
        return c.__setDigit(0, a), c;
      }
      __copy() {
        const a = new _JSBI(this.length, this.sign);
        for (let b = 0; b < this.length; b++) a[b] = this[b];
        return a;
      }
      __trim() {
        let a = this.length, b = this[a - 1];
        for (; 0 === b; ) a--, b = this[a - 1], this.pop();
        return 0 === a && (this.sign = false), this;
      }
      __initializeDigits() {
        for (let a = 0; a < this.length; a++) this[a] = 0;
      }
      static __decideRounding(a, b, c, d) {
        if (0 < b) return -1;
        let e;
        if (0 > b) e = -b - 1;
        else {
          if (0 === c) return -1;
          c--, d = a.__digit(c), e = 31;
        }
        let f = 1 << e;
        if (0 == (d & f)) return -1;
        if (f -= 1, 0 != (d & f)) return 1;
        for (; 0 < c; ) if (c--, 0 !== a.__digit(c)) return 1;
        return 0;
      }
      static __fromDouble(a) {
        _JSBI.__kBitConversionDouble[0] = a;
        const b = 2047 & _JSBI.__kBitConversionInts[1] >>> 20, c = b - 1023, d = (c >>> 5) + 1, e = new _JSBI(d, 0 > a);
        let f = 1048575 & _JSBI.__kBitConversionInts[1] | 1048576, g = _JSBI.__kBitConversionInts[0];
        const h = 20, i = 31 & c;
        let j, k = 0;
        if (i < 20) {
          const a2 = h - i;
          k = a2 + 32, j = f >>> a2, f = f << 32 - a2 | g >>> a2, g <<= 32 - a2;
        } else if (i === 20) k = 32, j = f, f = g;
        else {
          const a2 = i - h;
          k = 32 - a2, j = f << a2 | g >>> 32 - a2, f = g << a2;
        }
        e.__setDigit(d - 1, j);
        for (let b2 = d - 2; 0 <= b2; b2--) 0 < k ? (k -= 32, j = f, f = g) : j = 0, e.__setDigit(b2, j);
        return e.__trim();
      }
      static __isWhitespace(a) {
        return !!(13 >= a && 9 <= a) || (159 >= a ? 32 == a : 131071 >= a ? 160 == a || 5760 == a : 196607 >= a ? (a &= 131071, 10 >= a || 40 == a || 41 == a || 47 == a || 95 == a || 4096 == a) : 65279 == a);
      }
      static __fromString(a, b = 0) {
        let c = 0;
        const e = a.length;
        let f = 0;
        if (f === e) return _JSBI.__zero();
        let g = a.charCodeAt(f);
        for (; _JSBI.__isWhitespace(g); ) {
          if (++f === e) return _JSBI.__zero();
          g = a.charCodeAt(f);
        }
        if (43 === g) {
          if (++f === e) return null;
          g = a.charCodeAt(f), c = 1;
        } else if (45 === g) {
          if (++f === e) return null;
          g = a.charCodeAt(f), c = -1;
        }
        if (0 === b) {
          if (b = 10, 48 === g) {
            if (++f === e) return _JSBI.__zero();
            if (g = a.charCodeAt(f), 88 === g || 120 === g) {
              if (b = 16, ++f === e) return null;
              g = a.charCodeAt(f);
            } else if (79 === g || 111 === g) {
              if (b = 8, ++f === e) return null;
              g = a.charCodeAt(f);
            } else if (66 === g || 98 === g) {
              if (b = 2, ++f === e) return null;
              g = a.charCodeAt(f);
            }
          }
        } else if (16 === b && 48 === g) {
          if (++f === e) return _JSBI.__zero();
          if (g = a.charCodeAt(f), 88 === g || 120 === g) {
            if (++f === e) return null;
            g = a.charCodeAt(f);
          }
        }
        for (; 48 === g; ) {
          if (++f === e) return _JSBI.__zero();
          g = a.charCodeAt(f);
        }
        const h = e - f;
        let i = _JSBI.__kMaxBitsPerChar[b], j = _JSBI.__kBitsPerCharTableMultiplier - 1;
        if (h > 1073741824 / i) return null;
        const k = i * h + j >>> _JSBI.__kBitsPerCharTableShift, l = new _JSBI(k + 31 >>> 5, false), n = 10 > b ? b : 10, o = 10 < b ? b - 10 : 0;
        if (0 == (b & b - 1)) {
          i >>= _JSBI.__kBitsPerCharTableShift;
          const b2 = [], c2 = [];
          let d = false;
          do {
            let h2 = 0, j2 = 0;
            for (; ; ) {
              let b3;
              if (g - 48 >>> 0 < n) b3 = g - 48;
              else if ((32 | g) - 97 >>> 0 < o) b3 = (32 | g) - 87;
              else {
                d = true;
                break;
              }
              if (j2 += i, h2 = h2 << i | b3, ++f === e) {
                d = true;
                break;
              }
              if (g = a.charCodeAt(f), 32 < j2 + i) break;
            }
            b2.push(h2), c2.push(j2);
          } while (!d);
          _JSBI.__fillFromParts(l, b2, c2);
        } else {
          l.__initializeDigits();
          let c2 = false, h2 = 0;
          do {
            let k2 = 0, p = 1;
            for (; ; ) {
              let i2;
              if (g - 48 >>> 0 < n) i2 = g - 48;
              else if ((32 | g) - 97 >>> 0 < o) i2 = (32 | g) - 87;
              else {
                c2 = true;
                break;
              }
              const d = p * b;
              if (4294967295 < d) break;
              if (p = d, k2 = k2 * b + i2, h2++, ++f === e) {
                c2 = true;
                break;
              }
              g = a.charCodeAt(f);
            }
            j = 32 * _JSBI.__kBitsPerCharTableMultiplier - 1;
            const q = i * h2 + j >>> _JSBI.__kBitsPerCharTableShift + 5;
            l.__inplaceMultiplyAdd(p, k2, q);
          } while (!c2);
        }
        for (; f !== e; ) {
          if (!_JSBI.__isWhitespace(g)) return null;
          g = a.charCodeAt(f++);
        }
        return 0 != c && 10 !== b ? null : (l.sign = -1 == c, l.__trim());
      }
      static __fillFromParts(a, b, c) {
        let d = 0, e = 0, f = 0;
        for (let g = b.length - 1; 0 <= g; g--) {
          const h = b[g], i = c[g];
          e |= h << f, f += i, 32 === f ? (a.__setDigit(d++, e), f = 0, e = 0) : 32 < f && (a.__setDigit(d++, e), f -= 32, e = h >>> i - f);
        }
        if (0 !== e) {
          if (d >= a.length) throw new Error("implementation bug");
          a.__setDigit(d++, e);
        }
        for (; d < a.length; d++) a.__setDigit(d, 0);
      }
      static __toStringBasePowerOfTwo(a, b) {
        var c = Math.clz32;
        const d = a.length;
        let e = b - 1;
        e = (85 & e >>> 1) + (85 & e), e = (51 & e >>> 2) + (51 & e), e = (15 & e >>> 4) + (15 & e);
        const f = e, g = b - 1, h = a.__digit(d - 1), i = c(h);
        let j = 0 | (32 * d - i + f - 1) / f;
        if (a.sign && j++, 268435456 < j) throw new Error("string too long");
        const k = Array(j);
        let l = j - 1, m = 0, n = 0;
        for (let c2 = 0; c2 < d - 1; c2++) {
          const b2 = a.__digit(c2), d2 = (m | b2 << n) & g;
          k[l--] = _JSBI.__kConversionChars[d2];
          const e2 = f - n;
          for (m = b2 >>> e2, n = 32 - e2; n >= f; ) k[l--] = _JSBI.__kConversionChars[m & g], m >>>= f, n -= f;
        }
        const o = (m | h << n) & g;
        for (k[l--] = _JSBI.__kConversionChars[o], m = h >>> f - n; 0 !== m; ) k[l--] = _JSBI.__kConversionChars[m & g], m >>>= f;
        if (a.sign && (k[l--] = "-"), -1 != l) throw new Error("implementation bug");
        return k.join("");
      }
      static __toStringGeneric(a, b, c) {
        var d = Math.clz32;
        const e = a.length;
        if (0 === e) return "";
        if (1 === e) {
          let d2 = a.__unsignedDigit(0).toString(b);
          return false === c && a.sign && (d2 = "-" + d2), d2;
        }
        const f = 32 * e - d(a.__digit(e - 1)), g = _JSBI.__kMaxBitsPerChar[b], h = g - 1;
        let i = f * _JSBI.__kBitsPerCharTableMultiplier;
        i += h - 1, i = 0 | i / h;
        const j = i + 1 >> 1, k = _JSBI.exponentiate(_JSBI.__oneDigit(b, false), _JSBI.__oneDigit(j, false));
        let l, m;
        const n = k.__unsignedDigit(0);
        if (1 === k.length && 65535 >= n) {
          l = new _JSBI(a.length, false), l.__initializeDigits();
          let c2 = 0;
          for (let b2 = 2 * a.length - 1; 0 <= b2; b2--) {
            const d2 = c2 << 16 | a.__halfDigit(b2);
            l.__setHalfDigit(b2, 0 | d2 / n), c2 = 0 | d2 % n;
          }
          m = c2.toString(b);
        } else {
          const c2 = _JSBI.__absoluteDivLarge(a, k, true, true);
          l = c2.quotient;
          const d2 = c2.remainder.__trim();
          m = _JSBI.__toStringGeneric(d2, b, true);
        }
        l.__trim();
        let o = _JSBI.__toStringGeneric(l, b, true);
        for (; m.length < j; ) m = "0" + m;
        return false === c && a.sign && (o = "-" + o), o + m;
      }
      static __unequalSign(a) {
        return a ? -1 : 1;
      }
      static __absoluteGreater(a) {
        return a ? -1 : 1;
      }
      static __absoluteLess(a) {
        return a ? 1 : -1;
      }
      static __compareToBigInt(a, b) {
        const c = a.sign;
        if (c !== b.sign) return _JSBI.__unequalSign(c);
        const d = _JSBI.__absoluteCompare(a, b);
        return 0 < d ? _JSBI.__absoluteGreater(c) : 0 > d ? _JSBI.__absoluteLess(c) : 0;
      }
      static __compareToNumber(a, b) {
        if (b | true) {
          const c = a.sign, d = 0 > b;
          if (c !== d) return _JSBI.__unequalSign(c);
          if (0 === a.length) {
            if (d) throw new Error("implementation bug");
            return 0 === b ? 0 : -1;
          }
          if (1 < a.length) return _JSBI.__absoluteGreater(c);
          const e = Math.abs(b), f = a.__unsignedDigit(0);
          return f > e ? _JSBI.__absoluteGreater(c) : f < e ? _JSBI.__absoluteLess(c) : 0;
        }
        return _JSBI.__compareToDouble(a, b);
      }
      static __compareToDouble(a, b) {
        var c = Math.clz32;
        if (b !== b) return b;
        if (b === 1 / 0) return -1;
        if (b === -Infinity) return 1;
        const d = a.sign;
        if (d !== 0 > b) return _JSBI.__unequalSign(d);
        if (0 === b) throw new Error("implementation bug: should be handled elsewhere");
        if (0 === a.length) return -1;
        _JSBI.__kBitConversionDouble[0] = b;
        const e = 2047 & _JSBI.__kBitConversionInts[1] >>> 20;
        if (2047 == e) throw new Error("implementation bug: handled elsewhere");
        const f = e - 1023;
        if (0 > f) return _JSBI.__absoluteGreater(d);
        const g = a.length;
        let h = a.__digit(g - 1);
        const i = c(h), j = 32 * g - i, k = f + 1;
        if (j < k) return _JSBI.__absoluteLess(d);
        if (j > k) return _JSBI.__absoluteGreater(d);
        let l = 1048576 | 1048575 & _JSBI.__kBitConversionInts[1], m = _JSBI.__kBitConversionInts[0];
        const n = 20, o = 31 - i;
        if (o !== (j - 1) % 31) throw new Error("implementation bug");
        let p, q = 0;
        if (20 > o) {
          const a2 = n - o;
          q = a2 + 32, p = l >>> a2, l = l << 32 - a2 | m >>> a2, m <<= 32 - a2;
        } else if (20 === o) q = 32, p = l, l = m;
        else {
          const a2 = o - n;
          q = 32 - a2, p = l << a2 | m >>> 32 - a2, l = m << a2;
        }
        if (h >>>= 0, p >>>= 0, h > p) return _JSBI.__absoluteGreater(d);
        if (h < p) return _JSBI.__absoluteLess(d);
        for (let c2 = g - 2; 0 <= c2; c2--) {
          0 < q ? (q -= 32, p = l >>> 0, l = m, m = 0) : p = 0;
          const b2 = a.__unsignedDigit(c2);
          if (b2 > p) return _JSBI.__absoluteGreater(d);
          if (b2 < p) return _JSBI.__absoluteLess(d);
        }
        if (0 !== l || 0 !== m) {
          if (0 === q) throw new Error("implementation bug");
          return _JSBI.__absoluteLess(d);
        }
        return 0;
      }
      static __equalToNumber(a, b) {
        var c = Math.abs;
        return b | 0 === b ? 0 === b ? 0 === a.length : 1 === a.length && a.sign === 0 > b && a.__unsignedDigit(0) === c(b) : 0 === _JSBI.__compareToDouble(a, b);
      }
      static __comparisonResultToBool(a, b) {
        switch (b) {
          case 0:
            return 0 > a;
          case 1:
            return 0 >= a;
          case 2:
            return 0 < a;
          case 3:
            return 0 <= a;
        }
        throw new Error("unreachable");
      }
      static __compare(a, b, c) {
        if (a = _JSBI.__toPrimitive(a), b = _JSBI.__toPrimitive(b), "string" == typeof a && "string" == typeof b) switch (c) {
          case 0:
            return a < b;
          case 1:
            return a <= b;
          case 2:
            return a > b;
          case 3:
            return a >= b;
        }
        if (_JSBI.__isBigInt(a) && "string" == typeof b) return b = _JSBI.__fromString(b), null !== b && _JSBI.__comparisonResultToBool(_JSBI.__compareToBigInt(a, b), c);
        if ("string" == typeof a && _JSBI.__isBigInt(b)) return a = _JSBI.__fromString(a), null !== a && _JSBI.__comparisonResultToBool(_JSBI.__compareToBigInt(a, b), c);
        if (a = _JSBI.__toNumeric(a), b = _JSBI.__toNumeric(b), _JSBI.__isBigInt(a)) {
          if (_JSBI.__isBigInt(b)) return _JSBI.__comparisonResultToBool(_JSBI.__compareToBigInt(a, b), c);
          if ("number" != typeof b) throw new Error("implementation bug");
          return _JSBI.__comparisonResultToBool(_JSBI.__compareToNumber(a, b), c);
        }
        if ("number" != typeof a) throw new Error("implementation bug");
        if (_JSBI.__isBigInt(b)) return _JSBI.__comparisonResultToBool(_JSBI.__compareToNumber(b, a), 2 ^ c);
        if ("number" != typeof b) throw new Error("implementation bug");
        return 0 === c ? a < b : 1 === c ? a <= b : 2 === c ? a > b : 3 === c ? a >= b : void 0;
      }
      __clzmsd() {
        return Math.clz32(this[this.length - 1]);
      }
      static __absoluteAdd(a, b, c) {
        if (a.length < b.length) return _JSBI.__absoluteAdd(b, a, c);
        if (0 === a.length) return a;
        if (0 === b.length) return a.sign === c ? a : _JSBI.unaryMinus(a);
        let d = a.length;
        (0 === a.__clzmsd() || b.length === a.length && 0 === b.__clzmsd()) && d++;
        const e = new _JSBI(d, c);
        let f = 0, g = 0;
        for (; g < b.length; g++) {
          const c2 = b.__digit(g), d2 = a.__digit(g), h = (65535 & d2) + (65535 & c2) + f, i = (d2 >>> 16) + (c2 >>> 16) + (h >>> 16);
          f = i >>> 16, e.__setDigit(g, 65535 & h | i << 16);
        }
        for (; g < a.length; g++) {
          const b2 = a.__digit(g), c2 = (65535 & b2) + f, d2 = (b2 >>> 16) + (c2 >>> 16);
          f = d2 >>> 16, e.__setDigit(g, 65535 & c2 | d2 << 16);
        }
        return g < e.length && e.__setDigit(g, f), e.__trim();
      }
      static __absoluteSub(a, b, c) {
        if (0 === a.length) return a;
        if (0 === b.length) return a.sign === c ? a : _JSBI.unaryMinus(a);
        const d = new _JSBI(a.length, c);
        let e = 0, f = 0;
        for (; f < b.length; f++) {
          const c2 = a.__digit(f), g = b.__digit(f), h = (65535 & c2) - (65535 & g) - e;
          e = 1 & h >>> 16;
          const i = (c2 >>> 16) - (g >>> 16) - e;
          e = 1 & i >>> 16, d.__setDigit(f, 65535 & h | i << 16);
        }
        for (; f < a.length; f++) {
          const b2 = a.__digit(f), c2 = (65535 & b2) - e;
          e = 1 & c2 >>> 16;
          const g = (b2 >>> 16) - e;
          e = 1 & g >>> 16, d.__setDigit(f, 65535 & c2 | g << 16);
        }
        return d.__trim();
      }
      static __absoluteAddOne(a, b, c = null) {
        const d = a.length;
        null === c ? c = new _JSBI(d, b) : c.sign = b;
        let e = true;
        for (let f, g = 0; g < d; g++) {
          f = a.__digit(g);
          const b2 = -1 === f;
          e && (f = 0 | f + 1), e = b2, c.__setDigit(g, f);
        }
        return e && c.__setDigitGrow(d, 1), c;
      }
      static __absoluteSubOne(a, b) {
        const c = a.length;
        b = b || c;
        const d = new _JSBI(b, false);
        let e = true;
        for (let f, g = 0; g < c; g++) {
          f = a.__digit(g);
          const b2 = 0 === f;
          e && (f = 0 | f - 1), e = b2, d.__setDigit(g, f);
        }
        for (let e2 = c; e2 < b; e2++) d.__setDigit(e2, 0);
        return d;
      }
      static __absoluteAnd(a, b, c = null) {
        let d = a.length, e = b.length, f = e;
        if (d < e) {
          f = d;
          const c2 = a, g2 = d;
          a = b, d = e, b = c2, e = g2;
        }
        let g = f;
        null === c ? c = new _JSBI(g, false) : g = c.length;
        let h = 0;
        for (; h < f; h++) c.__setDigit(h, a.__digit(h) & b.__digit(h));
        for (; h < g; h++) c.__setDigit(h, 0);
        return c;
      }
      static __absoluteAndNot(a, b, c = null) {
        const d = a.length, e = b.length;
        let f = e;
        d < e && (f = d);
        let g = d;
        null === c ? c = new _JSBI(g, false) : g = c.length;
        let h = 0;
        for (; h < f; h++) c.__setDigit(h, a.__digit(h) & ~b.__digit(h));
        for (; h < d; h++) c.__setDigit(h, a.__digit(h));
        for (; h < g; h++) c.__setDigit(h, 0);
        return c;
      }
      static __absoluteOr(a, b, c = null) {
        let d = a.length, e = b.length, f = e;
        if (d < e) {
          f = d;
          const c2 = a, g2 = d;
          a = b, d = e, b = c2, e = g2;
        }
        let g = d;
        null === c ? c = new _JSBI(g, false) : g = c.length;
        let h = 0;
        for (; h < f; h++) c.__setDigit(h, a.__digit(h) | b.__digit(h));
        for (; h < d; h++) c.__setDigit(h, a.__digit(h));
        for (; h < g; h++) c.__setDigit(h, 0);
        return c;
      }
      static __absoluteXor(a, b, c = null) {
        let d = a.length, e = b.length, f = e;
        if (d < e) {
          f = d;
          const c2 = a, g2 = d;
          a = b, d = e, b = c2, e = g2;
        }
        let g = d;
        null === c ? c = new _JSBI(g, false) : g = c.length;
        let h = 0;
        for (; h < f; h++) c.__setDigit(h, a.__digit(h) ^ b.__digit(h));
        for (; h < d; h++) c.__setDigit(h, a.__digit(h));
        for (; h < g; h++) c.__setDigit(h, 0);
        return c;
      }
      static __absoluteCompare(a, b) {
        const c = a.length - b.length;
        if (0 != c) return c;
        let d = a.length - 1;
        for (; 0 <= d && a.__digit(d) === b.__digit(d); ) d--;
        return 0 > d ? 0 : a.__unsignedDigit(d) > b.__unsignedDigit(d) ? 1 : -1;
      }
      static __multiplyAccumulate(a, b, c, d) {
        var e = Math.imul;
        if (0 === b) return;
        const f = 65535 & b, g = b >>> 16;
        let h = 0, j = 0, k = 0;
        for (let l = 0; l < a.length; l++, d++) {
          let b2 = c.__digit(d), i = 65535 & b2, m = b2 >>> 16;
          const n = a.__digit(l), o = 65535 & n, p = n >>> 16, q = e(o, f), r = e(o, g), s = e(p, f), t = e(p, g);
          i += j + (65535 & q), m += k + h + (i >>> 16) + (q >>> 16) + (65535 & r) + (65535 & s), h = m >>> 16, j = (r >>> 16) + (s >>> 16) + (65535 & t) + h, h = j >>> 16, j &= 65535, k = t >>> 16, b2 = 65535 & i | m << 16, c.__setDigit(d, b2);
        }
        for (; 0 != h || 0 !== j || 0 !== k; d++) {
          let a2 = c.__digit(d);
          const b2 = (65535 & a2) + j, e2 = (a2 >>> 16) + (b2 >>> 16) + k + h;
          j = 0, k = 0, h = e2 >>> 16, a2 = 65535 & b2 | e2 << 16, c.__setDigit(d, a2);
        }
      }
      static __internalMultiplyAdd(a, b, c, d, e) {
        var f = Math.imul;
        let g = c, h = 0;
        for (let j = 0; j < d; j++) {
          const c2 = a.__digit(j), d2 = f(65535 & c2, b), i = (65535 & d2) + h + g;
          g = i >>> 16;
          const k = f(c2 >>> 16, b), l = (65535 & k) + (d2 >>> 16) + g;
          g = l >>> 16, h = k >>> 16, e.__setDigit(j, l << 16 | 65535 & i);
        }
        if (e.length > d) for (e.__setDigit(d++, g + h); d < e.length; ) e.__setDigit(d++, 0);
        else if (0 !== g + h) throw new Error("implementation bug");
      }
      __inplaceMultiplyAdd(a, b, c) {
        var e = Math.imul;
        c > this.length && (c = this.length);
        const f = 65535 & a, g = a >>> 16;
        let h = 0, j = 65535 & b, k = b >>> 16;
        for (let l = 0; l < c; l++) {
          const a2 = this.__digit(l), b2 = 65535 & a2, c2 = a2 >>> 16, d = e(b2, f), i = e(b2, g), m = e(c2, f), n = e(c2, g), o = j + (65535 & d), p = k + h + (o >>> 16) + (d >>> 16) + (65535 & i) + (65535 & m);
          j = (i >>> 16) + (m >>> 16) + (65535 & n) + (p >>> 16), h = j >>> 16, j &= 65535, k = n >>> 16;
          this.__setDigit(l, 65535 & o | p << 16);
        }
        if (0 != h || 0 !== j || 0 !== k) throw new Error("implementation bug");
      }
      static __absoluteDivSmall(a, b, c) {
        null === c && (c = new _JSBI(a.length, false));
        let d = 0;
        for (let e, f = 2 * a.length - 1; 0 <= f; f -= 2) {
          e = (d << 16 | a.__halfDigit(f)) >>> 0;
          const g = 0 | e / b;
          d = 0 | e % b, e = (d << 16 | a.__halfDigit(f - 1)) >>> 0;
          const h = 0 | e / b;
          d = 0 | e % b, c.__setDigit(f >>> 1, g << 16 | h);
        }
        return c;
      }
      static __absoluteModSmall(a, b) {
        let c = 0;
        for (let d = 2 * a.length - 1; 0 <= d; d--) {
          const e = (c << 16 | a.__halfDigit(d)) >>> 0;
          c = 0 | e % b;
        }
        return c;
      }
      static __absoluteDivLarge(a, b, d, e) {
        var f = Math.imul;
        const g = b.__halfDigitLength(), h = b.length, c = a.__halfDigitLength() - g;
        let i = null;
        d && (i = new _JSBI(c + 2 >>> 1, false), i.__initializeDigits());
        const k = new _JSBI(g + 2 >>> 1, false);
        k.__initializeDigits();
        const l = _JSBI.__clz16(b.__halfDigit(g - 1));
        0 < l && (b = _JSBI.__specialLeftShift(b, l, 0));
        const m = _JSBI.__specialLeftShift(a, l, 1), n = b.__halfDigit(g - 1);
        let o = 0;
        for (let l2, p = c; 0 <= p; p--) {
          l2 = 65535;
          const a2 = m.__halfDigit(p + g);
          if (a2 !== n) {
            const c2 = (a2 << 16 | m.__halfDigit(p + g - 1)) >>> 0;
            l2 = 0 | c2 / n;
            let d2 = 0 | c2 % n;
            const e3 = b.__halfDigit(g - 2), h2 = m.__halfDigit(p + g - 2);
            for (; f(l2, e3) >>> 0 > (d2 << 16 | h2) >>> 0 && (l2--, d2 += n, !(65535 < d2)); ) ;
          }
          _JSBI.__internalMultiplyAdd(b, l2, 0, h, k);
          let e2 = m.__inplaceSub(k, p, g + 1);
          0 !== e2 && (e2 = m.__inplaceAdd(b, p, g), m.__setHalfDigit(p + g, m.__halfDigit(p + g) + e2), l2--), d && (1 & p ? o = l2 << 16 : i.__setDigit(p >>> 1, o | l2));
        }
        return e ? (m.__inplaceRightShift(l), d ? { quotient: i, remainder: m } : m) : d ? i : void 0;
      }
      static __clz16(a) {
        return Math.clz32(a) - 16;
      }
      __inplaceAdd(a, b, c) {
        let d = 0;
        for (let e = 0; e < c; e++) {
          const c2 = this.__halfDigit(b + e) + a.__halfDigit(e) + d;
          d = c2 >>> 16, this.__setHalfDigit(b + e, c2);
        }
        return d;
      }
      __inplaceSub(a, b, c) {
        let d = 0;
        if (1 & b) {
          b >>= 1;
          let e = this.__digit(b), f = 65535 & e, g = 0;
          for (; g < c - 1 >>> 1; g++) {
            const c2 = a.__digit(g), h2 = (e >>> 16) - (65535 & c2) - d;
            d = 1 & h2 >>> 16, this.__setDigit(b + g, h2 << 16 | 65535 & f), e = this.__digit(b + g + 1), f = (65535 & e) - (c2 >>> 16) - d, d = 1 & f >>> 16;
          }
          const h = a.__digit(g), i = (e >>> 16) - (65535 & h) - d;
          d = 1 & i >>> 16, this.__setDigit(b + g, i << 16 | 65535 & f);
          if (b + g + 1 >= this.length) throw new RangeError("out of bounds");
          0 == (1 & c) && (e = this.__digit(b + g + 1), f = (65535 & e) - (h >>> 16) - d, d = 1 & f >>> 16, this.__setDigit(b + a.length, 4294901760 & e | 65535 & f));
        } else {
          b >>= 1;
          let e = 0;
          for (; e < a.length - 1; e++) {
            const c2 = this.__digit(b + e), f2 = a.__digit(e), g2 = (65535 & c2) - (65535 & f2) - d;
            d = 1 & g2 >>> 16;
            const h2 = (c2 >>> 16) - (f2 >>> 16) - d;
            d = 1 & h2 >>> 16, this.__setDigit(b + e, h2 << 16 | 65535 & g2);
          }
          const f = this.__digit(b + e), g = a.__digit(e), h = (65535 & f) - (65535 & g) - d;
          d = 1 & h >>> 16;
          let i = 0;
          0 == (1 & c) && (i = (f >>> 16) - (g >>> 16) - d, d = 1 & i >>> 16), this.__setDigit(b + e, i << 16 | 65535 & h);
        }
        return d;
      }
      __inplaceRightShift(a) {
        if (0 === a) return;
        let b = this.__digit(0) >>> a;
        const c = this.length - 1;
        for (let e = 0; e < c; e++) {
          const c2 = this.__digit(e + 1);
          this.__setDigit(e, c2 << 32 - a | b), b = c2 >>> a;
        }
        this.__setDigit(c, b);
      }
      static __specialLeftShift(a, b, c) {
        const d = a.length, e = new _JSBI(d + c, false);
        if (0 === b) {
          for (let b2 = 0; b2 < d; b2++) e.__setDigit(b2, a.__digit(b2));
          return 0 < c && e.__setDigit(d, 0), e;
        }
        let f = 0;
        for (let g = 0; g < d; g++) {
          const c2 = a.__digit(g);
          e.__setDigit(g, c2 << b | f), f = c2 >>> 32 - b;
        }
        return 0 < c && e.__setDigit(d, f), e;
      }
      static __leftShiftByAbsolute(a, b) {
        const c = _JSBI.__toShiftAmount(b);
        if (0 > c) throw new RangeError("BigInt too big");
        const e = c >>> 5, f = 31 & c, g = a.length, h = 0 !== f && 0 != a.__digit(g - 1) >>> 32 - f, j = g + e + (h ? 1 : 0), k = new _JSBI(j, a.sign);
        if (0 === f) {
          let b2 = 0;
          for (; b2 < e; b2++) k.__setDigit(b2, 0);
          for (; b2 < j; b2++) k.__setDigit(b2, a.__digit(b2 - e));
        } else {
          let b2 = 0;
          for (let a2 = 0; a2 < e; a2++) k.__setDigit(a2, 0);
          for (let c2 = 0; c2 < g; c2++) {
            const g2 = a.__digit(c2);
            k.__setDigit(c2 + e, g2 << f | b2), b2 = g2 >>> 32 - f;
          }
          if (h) k.__setDigit(g + e, b2);
          else if (0 != b2) throw new Error("implementation bug");
        }
        return k.__trim();
      }
      static __rightShiftByAbsolute(a, b) {
        const c = a.length, d = a.sign, e = _JSBI.__toShiftAmount(b);
        if (0 > e) return _JSBI.__rightShiftByMaximum(d);
        const f = e >>> 5, g = 31 & e;
        let h = c - f;
        if (0 >= h) return _JSBI.__rightShiftByMaximum(d);
        let i = false;
        if (d) {
          if (0 != (a.__digit(f) & (1 << g) - 1)) i = true;
          else for (let b2 = 0; b2 < f; b2++) if (0 !== a.__digit(b2)) {
            i = true;
            break;
          }
        }
        if (i && 0 === g) {
          const b2 = a.__digit(c - 1);
          0 == ~b2 && h++;
        }
        let j = new _JSBI(h, d);
        if (0 === g) for (let b2 = f; b2 < c; b2++) j.__setDigit(b2 - f, a.__digit(b2));
        else {
          let b2 = a.__digit(f) >>> g;
          const d2 = c - f - 1;
          for (let c2 = 0; c2 < d2; c2++) {
            const e2 = a.__digit(c2 + f + 1);
            j.__setDigit(c2, e2 << 32 - g | b2), b2 = e2 >>> g;
          }
          j.__setDigit(d2, b2);
        }
        return i && (j = _JSBI.__absoluteAddOne(j, true, j)), j.__trim();
      }
      static __rightShiftByMaximum(a) {
        return a ? _JSBI.__oneDigit(1, true) : _JSBI.__zero();
      }
      static __toShiftAmount(a) {
        if (1 < a.length) return -1;
        const b = a.__unsignedDigit(0);
        return b > _JSBI.__kMaxLengthBits ? -1 : b;
      }
      static __toPrimitive(a, b = "default") {
        if ("object" != typeof a) return a;
        if (a.constructor === _JSBI) return a;
        const c = a[Symbol.toPrimitive];
        if (c) {
          const a2 = c(b);
          if ("object" != typeof a2) return a2;
          throw new TypeError("Cannot convert object to primitive value");
        }
        const d = a.valueOf;
        if (d) {
          const b2 = d.call(a);
          if ("object" != typeof b2) return b2;
        }
        const e = a.toString;
        if (e) {
          const b2 = e.call(a);
          if ("object" != typeof b2) return b2;
        }
        throw new TypeError("Cannot convert object to primitive value");
      }
      static __toNumeric(a) {
        return _JSBI.__isBigInt(a) ? a : +a;
      }
      static __isBigInt(a) {
        return "object" == typeof a && a.constructor === _JSBI;
      }
      __digit(a) {
        return this[a];
      }
      __unsignedDigit(a) {
        return this[a] >>> 0;
      }
      __setDigit(a, b) {
        this[a] = 0 | b;
      }
      __setDigitGrow(a, b) {
        this[a] = 0 | b;
      }
      __halfDigitLength() {
        const a = this.length;
        return 65535 >= this.__unsignedDigit(a - 1) ? 2 * a - 1 : 2 * a;
      }
      __halfDigit(a) {
        return 65535 & this[a >>> 1] >>> ((1 & a) << 4);
      }
      __setHalfDigit(a, b) {
        const c = a >>> 1, d = this.__digit(c), e = 1 & a ? 65535 & d | b << 16 : 4294901760 & d | 65535 & b;
        this.__setDigit(c, e);
      }
      static __digitPow(a, b) {
        let c = 1;
        for (; 0 < b; ) 1 & b && (c *= a), b >>>= 1, a *= a;
        return c;
      }
    };
    JSBI.__kMaxLength = 33554432, JSBI.__kMaxLengthBits = JSBI.__kMaxLength << 5, JSBI.__kMaxBitsPerChar = [0, 0, 32, 51, 64, 75, 83, 90, 96, 102, 107, 111, 115, 119, 122, 126, 128, 131, 134, 136, 139, 141, 143, 145, 147, 149, 151, 153, 154, 156, 158, 159, 160, 162, 163, 165, 166], JSBI.__kBitsPerCharTableShift = 5, JSBI.__kBitsPerCharTableMultiplier = 1 << JSBI.__kBitsPerCharTableShift, JSBI.__kConversionChars = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"], JSBI.__kBitConversionBuffer = new ArrayBuffer(8), JSBI.__kBitConversionDouble = new Float64Array(JSBI.__kBitConversionBuffer), JSBI.__kBitConversionInts = new Int32Array(JSBI.__kBitConversionBuffer), module2.exports = JSBI;
  }
});

// node_modules/dbus-next/lib/constants.js
var require_constants = __commonJS({
  "node_modules/dbus-next/lib/constants.js"(exports2, module2) {
    var NameFlag = class {
    };
    NameFlag.ALLOW_REPLACEMENT = 1;
    NameFlag.REPLACE_EXISTING = 2;
    NameFlag.DO_NOT_QUEUE = 4;
    var RequestNameReply = class {
    };
    RequestNameReply.PRIMARY_OWNER = 1;
    RequestNameReply.IN_QUEUE = 2;
    RequestNameReply.EXISTS = 3;
    RequestNameReply.ALREADY_OWNER = 4;
    var ReleaseNameReply = class {
    };
    ReleaseNameReply.RELEASED = 1;
    ReleaseNameReply.NON_EXISTENT = 2;
    ReleaseNameReply.NOT_OWNER = 3;
    var MessageType = class {
    };
    MessageType.METHOD_CALL = 1;
    MessageType.METHOD_RETURN = 2;
    MessageType.ERROR = 3;
    MessageType.SIGNAL = 4;
    var MessageFlag = class {
    };
    MessageFlag.NO_REPLY_EXPECTED = 1;
    MessageFlag.NO_AUTO_START = 2;
    var MAX_INT64_STR = "9223372036854775807";
    var MIN_INT64_STR = "-9223372036854775807";
    var MAX_UINT64_STR = "18446744073709551615";
    var MIN_UINT64_STR = "0";
    var _JSBIConstants = {};
    function _getJSBIConstants() {
      if (Object.keys(_JSBIConstants).length !== 0) {
        return _JSBIConstants;
      }
      const JSBI = require_jsbi_cjs();
      _JSBIConstants.MAX_INT64 = JSBI.BigInt(MAX_INT64_STR);
      _JSBIConstants.MIN_INT64 = JSBI.BigInt(MIN_INT64_STR);
      _JSBIConstants.MAX_UINT64 = JSBI.BigInt(MAX_UINT64_STR);
      _JSBIConstants.MIN_UINT64 = JSBI.BigInt(MIN_UINT64_STR);
      return _JSBIConstants;
    }
    var _BigIntConstants = {};
    function _getBigIntConstants() {
      if (Object.keys(_BigIntConstants).length !== 0) {
        return _BigIntConstants;
      }
      _BigIntConstants.MAX_INT64 = BigInt(MAX_INT64_STR);
      _BigIntConstants.MIN_INT64 = BigInt(MIN_INT64_STR);
      _BigIntConstants.MAX_UINT64 = BigInt(MAX_UINT64_STR);
      _BigIntConstants.MIN_UINT64 = BigInt(MIN_UINT64_STR);
      return _BigIntConstants;
    }
    module2.exports = {
      MAX_INT64_STR,
      MIN_INT64_STR,
      MAX_UINT64_STR,
      MIN_UINT64_STR,
      NameFlag,
      RequestNameReply,
      ReleaseNameReply,
      MessageType,
      MessageFlag,
      headerTypeName: [
        null,
        "path",
        "interface",
        "member",
        "errorName",
        "replySerial",
        "destination",
        "sender",
        "signature",
        "unixFd"
      ],
      // TODO: merge to single hash? e.g path -> [1, 'o']
      fieldSignature: {
        path: "o",
        interface: "s",
        member: "s",
        errorName: "s",
        replySerial: "u",
        destination: "s",
        sender: "s",
        signature: "g",
        unixFd: "u"
      },
      headerTypeId: {
        path: 1,
        interface: 2,
        member: 3,
        errorName: 4,
        replySerial: 5,
        destination: 6,
        sender: 7,
        signature: 8,
        unixFd: 9
      },
      protocolVersion: 1,
      endianness: {
        le: 108,
        be: 66
      },
      messageSignature: "yyyyuua(yv)",
      defaultAuthMethods: ["EXTERNAL", "DBUS_COOKIE_SHA1", "ANONYMOUS"],
      _getJSBIConstants,
      _getBigIntConstants
    };
  }
});

// node_modules/dbus-next/lib/variant.js
var require_variant = __commonJS({
  "node_modules/dbus-next/lib/variant.js"(exports2, module2) {
    var Variant = class {
      /**
      * Construct a new `Variant` with the given signature and value.
      * @param {string} signature - a DBus type signature for the `Variant`.
      * @param {any} value - the value of the `Variant` with type specified by the type signature.
      */
      constructor(signature, value) {
        this.signature = signature;
        this.value = value;
      }
    };
    module2.exports = {
      Variant
    };
  }
});

// node_modules/dbus-next/lib/validators.js
var require_validators = __commonJS({
  "node_modules/dbus-next/lib/validators.js"(exports2, module2) {
    var busNameRe = /^[A-Za-z_-][A-Za-z0-9_-]*$/;
    function isBusNameValid(name) {
      if (typeof name !== "string") {
        return false;
      }
      if (name.startsWith(":")) {
        return true;
      }
      return !!(name.length > 0 && name.length <= 255 && name[0] !== "." && name.indexOf(".") !== -1 && name.split(".").every((n) => n && busNameRe.test(n)));
    }
    function assertBusNameValid(name) {
      if (!isBusNameValid(name)) {
        throw new Error(`Invalid bus name: ${name}`);
      }
    }
    var pathRe = /^[A-Za-z0-9_]+$/;
    function isObjectPathValid(path) {
      return !!(typeof path === "string" && path && path[0] === "/" && (path.length === 1 || path[path.length - 1] !== "/" && path.split("/").slice(1).every((p) => p && pathRe.test(p))));
    }
    function assertObjectPathValid(path) {
      if (!isObjectPathValid(path)) {
        throw new Error(`Invalid object path: ${path}`);
      }
    }
    var elementRe = /^[A-Za-z_][A-Za-z0-9_]*$/;
    function isInterfaceNameValid(name) {
      return !!(typeof name === "string" && name && name.length > 0 && name.length <= 255 && name[0] !== "." && name.indexOf(".") !== -1 && name.split(".").every((n) => n && elementRe.test(n)));
    }
    function assertInterfaceNameValid(name) {
      if (!isInterfaceNameValid(name)) {
        throw new Error(`Invalid interface name: ${name}`);
      }
    }
    function isMemberNameValid(name) {
      return !!(typeof name === "string" && name && name.length > 0 && name.length <= 255 && elementRe.test(name));
    }
    function assertMemberNameValid(name) {
      if (!assertMemberNameValid) {
        throw new Error(`Invalid member name: ${name}`);
      }
    }
    module2.exports = {
      isBusNameValid,
      assertBusNameValid,
      isObjectPathValid,
      assertObjectPathValid,
      isInterfaceNameValid,
      assertInterfaceNameValid,
      isMemberNameValid,
      assertMemberNameValid
    };
  }
});

// node_modules/dbus-next/lib/message-type.js
var require_message_type = __commonJS({
  "node_modules/dbus-next/lib/message-type.js"(exports2, module2) {
    var {
      assertBusNameValid,
      assertInterfaceNameValid,
      assertObjectPathValid,
      assertMemberNameValid
    } = require_validators();
    var {
      METHOD_CALL,
      METHOD_RETURN,
      ERROR,
      SIGNAL
    } = require_constants().MessageType;
    var Message = class _Message {
      /**
       * Construct a new `Message` to send on the bus.
       */
      constructor(msg) {
        this.type = msg.type ? msg.type : METHOD_CALL;
        this._sent = false;
        this._serial = isNaN(msg.serial) ? null : msg.serial;
        this.path = msg.path;
        this.interface = msg.interface;
        this.member = msg.member;
        this.errorName = msg.errorName;
        this.replySerial = msg.replySerial;
        this.destination = msg.destination;
        this.sender = msg.sender;
        this.signature = msg.signature || "";
        this.body = msg.body || [];
        this.flags = msg.flags || 0;
        if (this.destination) {
          assertBusNameValid(this.destination);
        }
        if (this.interface) {
          assertInterfaceNameValid(this.interface);
        }
        if (this.path) {
          assertObjectPathValid(this.path);
        }
        if (this.member) {
          assertMemberNameValid(this.member);
        }
        if (this.errorName) {
          assertInterfaceNameValid(this.errorName);
        }
        const requireFields = (...fields) => {
          for (const field of fields) {
            if (this[field] === void 0) {
              throw new Error(`Message is missing a required field: ${field}`);
            }
          }
        };
        switch (this.type) {
          case METHOD_CALL:
            requireFields("path", "member");
            break;
          case SIGNAL:
            requireFields("path", "member", "interface");
            break;
          case ERROR:
            requireFields("errorName", "replySerial");
            break;
          case METHOD_RETURN:
            requireFields("replySerial");
            break;
          default:
            throw new Error(`Got unknown message type: ${this.type}`);
        }
      }
      /**
        * @member {int} - The serial of the message to track through the bus.  You
        * must use {@link MessageBus#newSerial} to get this serial. If not set, it
        * will be set automatically when the message is sent.
        */
      get serial() {
        return this._serial;
      }
      set serial(value) {
        this._sent = false;
        this._serial = value;
      }
      /**
       * Construct a new `Message` of type `ERROR` in reply to the given `Message`.
       *
       * @param {Message} msg - The `Message` this error is in reply to.
       * @param {string} errorName - The name of the error. Must be a valid
       * interface name.
       * @param {string} [errorText='An error occurred.'] - An error message for
       * the error.
       */
      static newError(msg, errorName, errorText = "An error occurred.") {
        assertInterfaceNameValid(errorName);
        return new _Message({
          type: ERROR,
          replySerial: msg.serial,
          destination: msg.sender,
          errorName,
          signature: "s",
          body: [errorText]
        });
      }
      /**
       * Construct a new `Message` of type `METHOD_RETURN` in reply to the given
       * message.
       *
       * @param {Message} msg - The `Message` this `Message` is in reply to.
       * @param {string} signature - The signature for the message body.
       * @param {Array} body - The body of the message as an array of arguments.
       * Must match the signature.
       */
      static newMethodReturn(msg, signature = "", body = []) {
        return new _Message({
          type: METHOD_RETURN,
          replySerial: msg.serial,
          destination: msg.sender,
          signature,
          body
        });
      }
      /**
       * Construct a new `Message` of type `SIGNAL` to broadcast on the bus.
       *
       * @param {string} path - The object path of this signal.
       * @param {string} iface - The interface of this signal.
       * @param {string} signature - The signature of the message body.
       * @param {Array] body - The body of the message as an array of arguments.
       * Must match the signature.
       */
      static newSignal(path, iface, name, signature = "", body = []) {
        return new _Message({
          type: SIGNAL,
          interface: iface,
          path,
          member: name,
          signature,
          body
        });
      }
    };
    module2.exports = {
      Message
    };
  }
});

// node_modules/dbus-next/lib/signature.js
var require_signature = __commonJS({
  "node_modules/dbus-next/lib/signature.js"(exports2, module2) {
    var match = {
      "{": "}",
      "(": ")"
    };
    var knownTypes = {};
    "(){}ybnqiuxtdsogarvehm*?@&^".split("").forEach(function(c) {
      knownTypes[c] = true;
    });
    function parseSignature(signature) {
      let index = 0;
      function next() {
        if (index < signature.length) {
          const c2 = signature[index];
          ++index;
          return c2;
        }
        return null;
      }
      function parseOne(c2) {
        function checkNotEnd(c3) {
          if (!c3) {
            throw new Error("Bad signature: unexpected end");
          }
          return c3;
        }
        if (!knownTypes[c2]) {
          throw new Error(`Unknown type: "${c2}" in signature "${signature}"`);
        }
        let ele;
        const res = { type: c2, child: [] };
        switch (c2) {
          case "a":
            ele = next();
            checkNotEnd(ele);
            res.child.push(parseOne(ele));
            return res;
          case "{":
          // dict entry
          case "(":
            while ((ele = next()) !== null && ele !== match[c2]) {
              res.child.push(parseOne(ele));
            }
            checkNotEnd(ele);
            return res;
        }
        return res;
      }
      const ret = [];
      let c;
      while ((c = next()) !== null) {
        ret.push(parseOne(c));
      }
      return ret;
    }
    function collapseSignature(value) {
      if (value.child.length === 0) {
        return value.type;
      }
      let type = value.type;
      for (let i = 0; i < value.child.length; ++i) {
        type += collapseSignature(value.child[i]);
      }
      if (type[0] === "{") {
        type += "}";
      } else if (type[0] === "(") {
        type += ")";
      }
      return type;
    }
    module2.exports = {
      parseSignature,
      collapseSignature
    };
  }
});

// node_modules/dbus-next/lib/service/interface.js
var require_interface = __commonJS({
  "node_modules/dbus-next/lib/service/interface.js"(exports2, module2) {
    var { parseSignature, collapseSignature } = require_signature();
    var variant = require_variant();
    var Variant = variant.Variant;
    var ACCESS_READ = "read";
    var ACCESS_WRITE = "write";
    var ACCESS_READWRITE = "readwrite";
    var EventEmitter = require("events");
    var {
      assertInterfaceNameValid,
      assertMemberNameValid
    } = require_validators();
    function property(options) {
      options.access = options.access || ACCESS_READWRITE;
      if (!options.signature) {
        throw new Error("missing signature for property");
      }
      options.signatureTree = parseSignature(options.signature);
      return function(descriptor) {
        options.name = options.name || descriptor.key;
        assertMemberNameValid(options.name);
        descriptor.finisher = function(klass) {
          klass.prototype.$properties = klass.prototype.$properties || [];
          klass.prototype.$properties[descriptor.key] = options;
        };
        return descriptor;
      };
    }
    function method(options) {
      options.disabled = !!options.disabled;
      options.inSignature = options.inSignature || "";
      options.outSignature = options.outSignature || "";
      options.inSignatureTree = parseSignature(options.inSignature);
      options.outSignatureTree = parseSignature(options.outSignature);
      return function(descriptor) {
        options.name = options.name || descriptor.key;
        assertMemberNameValid(options.name);
        options.fn = descriptor.descriptor.value;
        descriptor.finisher = function(klass) {
          klass.prototype.$methods = klass.prototype.$methods || [];
          klass.prototype.$methods[descriptor.key] = options;
        };
        return descriptor;
      };
    }
    function signal(options) {
      options.signature = options.signature || "";
      options.signatureTree = parseSignature(options.signature);
      return function(descriptor) {
        options.name = options.name || descriptor.key;
        assertMemberNameValid(options.name);
        options.fn = descriptor.descriptor.value;
        descriptor.descriptor.value = function() {
          if (options.disabled) {
            throw new Error("tried to call a disabled signal");
          }
          const result = options.fn.apply(this, arguments);
          this.$emitter.emit("signal", options, result);
        };
        descriptor.finisher = function(klass) {
          klass.prototype.$signals = klass.prototype.$signals || [];
          klass.prototype.$signals[descriptor.key] = options;
        };
        return descriptor;
      };
    }
    var Interface = class {
      /**
       * Create an interface. This should be called with the name of the interface
       * in the class that extends it.
       */
      constructor(name) {
        assertInterfaceNameValid(name);
        this.$name = name;
        this.$emitter = new EventEmitter();
      }
      /**
       * An alternative to the decorator functions to configure
       * [`Interface`]{@link module:interface~Interface} DBus members when
       * decorators cannot be supported.
       *
       * *Calling this method twice on the same `Interface` or mixing this method
       * with the decorator interface will result in undefined behavior that may be
       * specified at a future time.*
       *
       * @static
       * @example
       * ConfiguredInterface.configureMembers({
       *   properties: {
       *     SomeProperty: {
       *       signature: 's'
       *     }
       *   },
       *   methods: {
       *     Echo: {
       *       inSignature: 'v',
       *       outSignature: 'v'
       *     }
       *   },
       *   signals: {
       *     HelloWorld: {
       *       signature: 'ss'
       *     }
       *   }
       * });
       *
       * @param members {Object} - Member configuration object.
       * @param members.properties {Object} - The class methods to define as
       * properties. The key should be a method defined on the class and the value
       * should be the options for a [property]{@link module:interface.property}
       * decorator.
       * @param members.methods {Object} - The class methods to define as DBus
       * methods. The key should be a method defined on the class and the value
       * should be the options for a [method]{@link module:interface.method}
       * decorator.
       * @param members.signals {Object} - The class methods to define as signals.
       * The key should be a method defined on the class and hte value should be
       * options for a [signal]{@link module:interface.signal} decorator.
       */
      static configureMembers(members) {
        const properties = members.properties || {};
        const methods = members.methods || {};
        const signals = members.signals || {};
        this.prototype.$properties = {};
        this.prototype.$methods = {};
        this.prototype.$signals = {};
        for (const k of Object.keys(properties)) {
          const options = properties[k];
          options.name = options.name || k;
          options.access = options.access || ACCESS_READWRITE;
          if (!options.signature) {
            throw new Error("missing signature for property");
          }
          options.signatureTree = parseSignature(options.signature);
          assertMemberNameValid(options.name);
          this.prototype.$properties[options.name] = options;
        }
        for (const k of Object.keys(methods)) {
          const options = methods[k];
          options.name = options.name || k;
          assertMemberNameValid(options.name);
          options.disabled = !!options.disabled;
          options.inSignature = options.inSignature || "";
          options.outSignature = options.outSignature || "";
          options.inSignatureTree = parseSignature(options.inSignature);
          options.outSignatureTree = parseSignature(options.outSignature);
          options.fn = this.prototype[k];
          this.prototype.$methods[options.name] = options;
        }
        for (const k of Object.keys(signals)) {
          const options = signals[k];
          options.name = options.name || k;
          assertMemberNameValid(options.name);
          options.fn = this.prototype[k];
          options.signature = options.signature || "";
          options.signatureTree = parseSignature(options.signature);
          this.prototype[k] = function() {
            if (options.disabled) {
              throw new Error("tried to call a disabled signal");
            }
            const result = options.fn.apply(this, arguments);
            this.$emitter.emit("signal", options, result);
          };
          this.prototype.$signals[options.name] = options;
        }
      }
      /**
       * Emit the `PropertiesChanged` signal on an [`Interface`s]{@link
       * module:interface~Interface} associated standard
       * `org.freedesktop.DBus.Properties` interface with a map of new values and
       * invalidated properties. Pass the properties as JavaScript values.
       *
       * @static
       * @example
       * Interface.emitPropertiesChanged({ SomeProperty: 'bar' }, ['InvalidedProperty']);
       *
       * @param {module:interface~Interface} - the `Interface` to emit the `PropertiesChanged` signal on
       * @param {Object} - A map of property names and new property values that are changed.
       * @param {string[]} - A list of invalidated properties.
       */
      static emitPropertiesChanged(iface, changedProperties, invalidatedProperties = []) {
        if (!Array.isArray(invalidatedProperties) || !invalidatedProperties.every((p) => typeof p === "string")) {
          throw new Error("invalidated properties must be an array of strings");
        }
        const properties = iface.$properties || {};
        const changedPropertiesVariants = {};
        for (const p of Object.keys(changedProperties)) {
          if (properties[p] === void 0) {
            throw new Error(`got properties changed with unknown property: ${p}`);
          }
          changedPropertiesVariants[p] = new Variant(properties[p].signature, changedProperties[p]);
        }
        iface.$emitter.emit("properties-changed", changedPropertiesVariants, invalidatedProperties);
      }
      $introspect() {
        const xml = {
          $: {
            name: this.$name
          }
        };
        const properties = this.$properties || {};
        for (const p of Object.keys(properties) || []) {
          const property2 = properties[p];
          if (property2.disabled) {
            continue;
          }
          xml.property = xml.property || [];
          xml.property.push({
            $: {
              name: property2.name,
              type: property2.signature,
              access: property2.access
            }
          });
        }
        const methods = this.$methods || {};
        for (const m of Object.keys(methods) || []) {
          const method2 = methods[m];
          if (method2.disabled) {
            continue;
          }
          xml.method = xml.method || [];
          const methodXml = {
            $: {
              name: method2.name
            },
            arg: [],
            annotation: []
          };
          for (const signature of method2.inSignatureTree) {
            methodXml.arg.push({
              $: {
                direction: "in",
                type: collapseSignature(signature)
              }
            });
          }
          for (const signature of method2.outSignatureTree) {
            methodXml.arg.push({
              $: {
                direction: "out",
                type: collapseSignature(signature)
              }
            });
          }
          if (method2.noReply) {
            methodXml.annotation.push({
              $: {
                name: "org.freedesktop.DBus.Method.NoReply",
                value: "true"
              }
            });
          }
          xml.method.push(methodXml);
        }
        const signals = this.$signals || {};
        for (const s of Object.keys(signals) || []) {
          const signal2 = signals[s];
          if (signal2.disabled) {
            continue;
          }
          xml.signal = xml.signal || [];
          const signalXml = {
            $: {
              name: signal2.name
            },
            arg: []
          };
          for (const signature of signal2.signatureTree) {
            signalXml.arg.push({
              $: {
                type: collapseSignature(signature)
              }
            });
          }
          xml.signal.push(signalXml);
        }
        return xml;
      }
    };
    module2.exports = {
      ACCESS_READ,
      ACCESS_WRITE,
      ACCESS_READWRITE,
      property,
      method,
      signal,
      Interface
    };
  }
});

// node_modules/dbus-next/lib/errors.js
var require_errors = __commonJS({
  "node_modules/dbus-next/lib/errors.js"(exports2, module2) {
    var { assertInterfaceNameValid } = require_validators();
    var DBusError = class extends Error {
      /**
       * Construct a new `DBusError` with the given type and text.
       */
      constructor(type, text, reply = null) {
        assertInterfaceNameValid(type);
        text = text || "";
        super(text);
        this.name = "DBusError";
        this.type = type;
        this.text = text;
        this.reply = reply;
      }
    };
    module2.exports = {
      DBusError
    };
  }
});

// node_modules/dbus-next/lib/service/handlers.js
var require_handlers = __commonJS({
  "node_modules/dbus-next/lib/service/handlers.js"(exports2, module2) {
    var fs = require("fs");
    var variant = require_variant();
    var Variant = variant.Variant;
    var { Message } = require_message_type();
    var {
      isObjectPathValid,
      isInterfaceNameValid,
      isMemberNameValid
    } = require_validators();
    var {
      ACCESS_READ,
      ACCESS_WRITE,
      ACCESS_READWRITE
    } = require_interface();
    var constants = require_constants();
    var {
      METHOD_RETURN
    } = constants.MessageType;
    var { DBusError } = require_errors();
    var INVALID_ARGS = "org.freedesktop.DBus.Error.InvalidArgs";
    function sendServiceError(bus2, msg, errorMessage) {
      bus2.send(Message.newError(msg, "com.github.dbus_next.ServiceError", `Service error: ${errorMessage}`));
      return true;
    }
    function handleIntrospect(bus2, msg, path) {
      bus2.send(Message.newMethodReturn(msg, "s", [bus2._introspect(path)]));
    }
    function handleGetProperty(bus2, msg, path) {
      const [ifaceName, prop] = msg.body;
      if (!bus2._serviceObjects[path]) {
        bus2.send(Message.newError(msg, INVALID_ARGS, `Path not exported on bus: '${path}'`));
        return;
      }
      const obj = bus2._getServiceObject(path);
      const iface = obj.interfaces[ifaceName];
      if (!iface) {
        bus2.send(Message.newError(msg, INVALID_ARGS, `No such interface: '${ifaceName}'`));
        return;
      }
      const properties = iface.$properties || {};
      let options = null;
      let propertyKey = null;
      for (const k of Object.keys(properties)) {
        if (properties[k].name === prop && !properties[k].disabled) {
          options = properties[k];
          propertyKey = k;
          break;
        }
      }
      if (options === null) {
        bus2.send(Message.newError(msg, INVALID_ARGS, `No such property: '${prop}'`));
        return;
      }
      let propertyValue = null;
      try {
        propertyValue = iface[propertyKey];
      } catch (e) {
        if (e.name === "DBusError") {
          bus2.send(Message.newError(msg, e.type, e.text));
        } else {
          sendServiceError(bus2, msg, `The service threw an error.
${e.stack}`);
        }
        return true;
      }
      if (propertyValue instanceof DBusError) {
        bus2.send(Message.newError(msg, propertyValue.type, propertyValue.text));
        return true;
      } else if (propertyValue === void 0) {
        return sendServiceError(bus2, msg, "tried to get a property that is not set: " + prop);
      }
      if (!(options.access === ACCESS_READWRITE || options.access === ACCESS_READ)) {
        bus2.send(Message.newError(msg, INVALID_ARGS, `Property does not have read access: '${prop}'`));
      }
      const body = new Variant(options.signature, propertyValue);
      bus2.send(Message.newMethodReturn(msg, "v", [body]));
    }
    function handleGetAllProperties(bus2, msg, path) {
      const ifaceName = msg.body[0];
      if (!bus2._serviceObjects[path]) {
        bus2.send(Message.newError(msg, INVALID_ARGS, `Path not exported on bus: '${path}'`));
        return;
      }
      const obj = bus2._getServiceObject(path);
      const iface = obj.interfaces[ifaceName];
      const result = {};
      if (iface) {
        const properties = iface.$properties || {};
        for (const k of Object.keys(properties)) {
          const p = properties[k];
          if (!(p.access === ACCESS_READ || p.access === ACCESS_READWRITE) || p.disabled) {
            continue;
          }
          let value;
          try {
            value = iface[k];
          } catch (e) {
            if (e.name === "DBusError") {
              bus2.send(Message.newError(msg, e.type, e.text));
            } else {
              sendServiceError(bus2, msg, `The service threw an error.
${e.stack}`);
            }
            return true;
          }
          if (value instanceof DBusError) {
            bus2.send(Message.newError(msg, value.type, value.text));
            return true;
          } else if (value === void 0) {
            return sendServiceError(bus2, msg, "tried to get a property that is not set: " + p);
          }
          result[p.name] = new Variant(p.signature, value);
        }
      }
      bus2.send(Message.newMethodReturn(msg, "a{sv}", [result]));
    }
    function handleSetProperty(bus2, msg, path) {
      const [ifaceName, prop, value] = msg.body;
      if (!bus2._serviceObjects[path]) {
        bus2.send(Message.newError(msg, INVALID_ARGS, `Path not exported on bus: '${path}'`));
        return;
      }
      const obj = bus2._getServiceObject(path);
      const iface = obj.interfaces[ifaceName];
      if (!iface) {
        bus2.send(Message.newError(msg, INVALID_ARGS, `Interface not found: '${ifaceName}'`));
        return;
      }
      const properties = iface.$properties || {};
      let options = null;
      let propertyKey = null;
      for (const k of Object.keys(properties)) {
        if (properties[k].name === prop && !properties[k].disabled) {
          options = properties[k];
          propertyKey = k;
          break;
        }
      }
      if (options === null) {
        bus2.send(Message.newError(msg, INVALID_ARGS, `No such property: '${prop}'`));
        return;
      }
      if (!(options.access === ACCESS_WRITE || options.access === ACCESS_READWRITE)) {
        bus2.send(Message.newError(msg, INVALID_ARGS, `Property does not have write access: '${prop}'`));
      }
      if (value.signature !== options.signature) {
        bus2.send(Message.newError(msg, INVALID_ARGS, `Cannot set property '${prop}' with signature '${value.signature}' (expected '${options.signature}')`));
        return;
      }
      try {
        iface[propertyKey] = value.value;
      } catch (e) {
        if (e.name === "DBusError") {
          bus2.send(Message.newError(msg, e.type, e.text));
        } else {
          sendServiceError(bus2, msg, `The service threw an error.
${e.stack}`);
        }
        return true;
      }
      bus2.send(Message.newMethodReturn(msg, "", []));
    }
    function handleStdIfaces(bus2, msg) {
      const {
        member,
        path,
        signature
      } = msg;
      const ifaceName = msg.interface;
      if (!isInterfaceNameValid(ifaceName)) {
        bus2.send(Message.newError(msg, INVALID_ARGS, `Invalid interface name: '${ifaceName}'`));
        return true;
      }
      if (!isMemberNameValid(member)) {
        bus2.send(Message.newError(msg, INVALID_ARGS, `Invalid member name: '${member}'`));
        return true;
      }
      if (!isObjectPathValid(path)) {
        bus2.send(Message.newError(msg, INVALID_ARGS, `Invalid path name: '${path}'`));
        return true;
      }
      if (ifaceName === "org.freedesktop.DBus.Introspectable" && member === "Introspect" && !signature) {
        handleIntrospect(bus2, msg, path);
        return true;
      } else if (ifaceName === "org.freedesktop.DBus.Properties") {
        if (member === "Get" && signature === "ss") {
          handleGetProperty(bus2, msg, path);
          return true;
        } else if (member === "Set" && signature === "ssv") {
          handleSetProperty(bus2, msg, path);
          return true;
        } else if (member === "GetAll") {
          handleGetAllProperties(bus2, msg, path);
          return true;
        }
      } else if (ifaceName === "org.freedesktop.DBus.Peer") {
        if (member === "Ping" && !signature) {
          bus2._connection.message({
            type: METHOD_RETURN,
            serial: bus2._serial++,
            replySerial: msg.serial,
            destination: msg.sender
          });
          return true;
        } else if (member === "GetMachineId" && !signature) {
          const machineId = fs.readFileSync("/var/lib/dbus/machine-id").toString().trim();
          bus2._connection.message({
            type: METHOD_RETURN,
            serial: bus2._serial++,
            replySerial: msg.serial,
            destination: msg.sender,
            signature: "s",
            body: [machineId]
          });
          return true;
        }
      }
      return false;
    }
    function handleMessage(msg, bus2) {
      let {
        path,
        member,
        signature
      } = msg;
      const ifaceName = msg.interface;
      signature = signature || "";
      if (handleStdIfaces(bus2, msg)) {
        return true;
      }
      if (!bus2._serviceObjects[path]) {
        return false;
      }
      const obj = bus2._getServiceObject(path);
      const iface = obj.interfaces[ifaceName];
      if (!iface) {
        return false;
      }
      const methods = iface.$methods || {};
      for (const m of Object.keys(methods)) {
        const method = methods[m];
        let result = null;
        const handleError = (e) => {
          if (e.name === "DBusError") {
            bus2.send(Message.newError(msg, e.type, e.text));
          } else {
            sendServiceError(bus2, msg, `The service threw an error.
${e.stack}`);
          }
        };
        if (method.name === member && method.inSignature === signature) {
          try {
            result = method.fn.apply(iface, msg.body);
          } catch (e) {
            handleError(e);
            return true;
          }
          const sendReply = (body) => {
            if (method.noReply) return;
            if (body === void 0) {
              body = [];
            } else if (method.outSignatureTree.length === 1) {
              body = [body];
            } else if (method.outSignatureTree.length === 0) {
              return sendServiceError(bus2, msg, `method ${iface.$name}.${method.name} was not expected to return a body.`);
            } else if (!Array.isArray(body)) {
              return sendServiceError(bus2, msg, `method ${iface.$name}.${method.name} expected to return multiple arguments in an array (signature: '${method.outSignature}')`);
            }
            if (method.outSignatureTree.length !== body.length) {
              return sendServiceError(bus2, msg, `method ${iface.$name}.${m} returned the wrong number of arguments (got ${body.length} expected ${method.outSignatureTree.length}) for signature '${method.outSignature}'`);
            }
            bus2.send(Message.newMethodReturn(msg, method.outSignature, body));
          };
          if (result && result.constructor === Promise) {
            result.then(sendReply).catch(handleError);
          } else {
            sendReply(result);
          }
          return true;
        }
      }
      return false;
    }
    module2.exports = handleMessage;
  }
});

// node_modules/dbus-next/lib/service/object.js
var require_object = __commonJS({
  "node_modules/dbus-next/lib/service/object.js"(exports2, module2) {
    var { Message } = require_message_type();
    var Interface = require_interface().Interface;
    var assertObjectPathValid = require_validators().assertObjectPathValid;
    var ServiceObject = class _ServiceObject {
      constructor(path, bus2) {
        assertObjectPathValid(path);
        this.path = path;
        this.bus = bus2;
        this.interfaces = {};
        this._handlers = {};
      }
      addInterface(iface) {
        if (!(iface instanceof Interface)) {
          throw new Error(`object.addInterface takes an Interface as the first argument (got ${iface})`);
        }
        if (this.interfaces[iface.$name]) {
          throw new Error(`an interface with name '${iface.$name}' is already exported on this object`);
        }
        this.interfaces[iface.$name] = iface;
        const that = this;
        const propertiesChangedHandler = function(changedProperties, invalidatedProperties) {
          const body = [
            iface.$name,
            changedProperties,
            invalidatedProperties
          ];
          that.bus.send(Message.newSignal(that.path, "org.freedesktop.DBus.Properties", "PropertiesChanged", "sa{sv}as", body));
        };
        const signalHandler = function(options, result) {
          const {
            signature,
            signatureTree,
            name
          } = options;
          if (result === void 0) {
            result = [];
          } else if (signatureTree.length === 1) {
            result = [result];
          } else if (!Array.isArray(result)) {
            throw new Error(`signal ${iface.$name}.${name} expected to return multiple arguments in an array (signature: '${signature}')`);
          }
          if (signatureTree.length !== result.length) {
            throw new Error(`signal ${iface.$name}.${name} returned the wrong number of arguments (got ${result.length} expected ${signatureTree.length}) for signature '${signature}'`);
          }
          that.bus.send(Message.newSignal(that.path, iface.$name, name, signature, result));
        };
        this._handlers[iface.$name] = {
          propertiesChanged: propertiesChangedHandler,
          signal: signalHandler
        };
        iface.$emitter.on("signal", signalHandler);
        iface.$emitter.on("properties-changed", propertiesChangedHandler);
      }
      removeInterface(iface) {
        if (!(iface instanceof Interface)) {
          throw new Error(`object.removeInterface takes an Interface as the first argument (got ${iface})`);
        }
        if (!this.interfaces[iface.$name]) {
          throw new Error(`Interface ${iface.$name} not exported on this object`);
        }
        const handlers = this._handlers[iface.$name];
        iface.$emitter.removeListener("signal", handlers.signal);
        iface.$emitter.removeListener("properties-changed", handlers.propertiesChanged);
        delete this._handlers[iface.$name];
        delete this.interfaces[iface.$name];
      }
      introspect() {
        const interfaces = _ServiceObject.defaultInterfaces();
        for (const i of Object.keys(this.interfaces)) {
          const iface = this.interfaces[i];
          interfaces.push(iface.$introspect());
        }
        return interfaces;
      }
      static defaultInterfaces() {
        return [
          {
            $: { name: "org.freedesktop.DBus.Introspectable" },
            method: [
              {
                $: { name: "Introspect" },
                arg: [
                  {
                    $: { name: "data", direction: "out", type: "s" }
                  }
                ]
              }
            ]
          },
          {
            $: { name: "org.freedesktop.DBus.Peer" },
            method: [
              {
                $: { name: "GetMachineId" },
                arg: [
                  { $: { direction: "out", name: "machine_uuid", type: "s" } }
                ]
              },
              {
                $: { name: "Ping" }
              }
            ]
          },
          {
            $: { name: "org.freedesktop.DBus.Properties" },
            method: [
              {
                $: { name: "Get" },
                arg: [
                  { $: { direction: "in", type: "s" } },
                  { $: { direction: "in", type: "s" } },
                  { $: { direction: "out", type: "v" } }
                ]
              },
              {
                $: { name: "Set" },
                arg: [
                  { $: { direction: "in", type: "s" } },
                  { $: { direction: "in", type: "s" } },
                  { $: { direction: "in", type: "v" } }
                ]
              },
              {
                $: { name: "GetAll" },
                arg: [
                  { $: { direction: "in", type: "s" } },
                  { $: { direction: "out", type: "a{sv}" } }
                ]
              }
            ],
            signal: [
              {
                $: { name: "PropertiesChanged" },
                arg: [
                  { $: { type: "s" } },
                  { $: { type: "a{sv}" } },
                  { $: { type: "as" } }
                ]
              }
            ]
          }
        ];
      }
    };
    module2.exports = ServiceObject;
  }
});

// node_modules/xml2js/lib/defaults.js
var require_defaults = __commonJS({
  "node_modules/xml2js/lib/defaults.js"(exports2) {
    (function() {
      exports2.defaults = {
        "0.1": {
          explicitCharkey: false,
          trim: true,
          normalize: true,
          normalizeTags: false,
          attrkey: "@",
          charkey: "#",
          explicitArray: false,
          ignoreAttrs: false,
          mergeAttrs: false,
          explicitRoot: false,
          validator: null,
          xmlns: false,
          explicitChildren: false,
          childkey: "@@",
          charsAsChildren: false,
          includeWhiteChars: false,
          async: false,
          strict: true,
          attrNameProcessors: null,
          attrValueProcessors: null,
          tagNameProcessors: null,
          valueProcessors: null,
          emptyTag: ""
        },
        "0.2": {
          explicitCharkey: false,
          trim: false,
          normalize: false,
          normalizeTags: false,
          attrkey: "$",
          charkey: "_",
          explicitArray: true,
          ignoreAttrs: false,
          mergeAttrs: false,
          explicitRoot: true,
          validator: null,
          xmlns: false,
          explicitChildren: false,
          preserveChildrenOrder: false,
          childkey: "$$",
          charsAsChildren: false,
          includeWhiteChars: false,
          async: false,
          strict: true,
          attrNameProcessors: null,
          attrValueProcessors: null,
          tagNameProcessors: null,
          valueProcessors: null,
          rootName: "root",
          xmldec: {
            "version": "1.0",
            "encoding": "UTF-8",
            "standalone": true
          },
          doctype: null,
          renderOpts: {
            "pretty": true,
            "indent": "  ",
            "newline": "\n"
          },
          headless: false,
          chunkSize: 1e4,
          emptyTag: "",
          cdata: false
        }
      };
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/Utility.js
var require_Utility = __commonJS({
  "node_modules/xmlbuilder/lib/Utility.js"(exports2, module2) {
    (function() {
      var assign, getValue, isArray, isEmpty, isFunction, isObject, isPlainObject, slice = [].slice, hasProp = {}.hasOwnProperty;
      assign = function() {
        var i, key, len, source, sources, target;
        target = arguments[0], sources = 2 <= arguments.length ? slice.call(arguments, 1) : [];
        if (isFunction(Object.assign)) {
          Object.assign.apply(null, arguments);
        } else {
          for (i = 0, len = sources.length; i < len; i++) {
            source = sources[i];
            if (source != null) {
              for (key in source) {
                if (!hasProp.call(source, key)) continue;
                target[key] = source[key];
              }
            }
          }
        }
        return target;
      };
      isFunction = function(val) {
        return !!val && Object.prototype.toString.call(val) === "[object Function]";
      };
      isObject = function(val) {
        var ref;
        return !!val && ((ref = typeof val) === "function" || ref === "object");
      };
      isArray = function(val) {
        if (isFunction(Array.isArray)) {
          return Array.isArray(val);
        } else {
          return Object.prototype.toString.call(val) === "[object Array]";
        }
      };
      isEmpty = function(val) {
        var key;
        if (isArray(val)) {
          return !val.length;
        } else {
          for (key in val) {
            if (!hasProp.call(val, key)) continue;
            return false;
          }
          return true;
        }
      };
      isPlainObject = function(val) {
        var ctor, proto;
        return isObject(val) && (proto = Object.getPrototypeOf(val)) && (ctor = proto.constructor) && typeof ctor === "function" && ctor instanceof ctor && Function.prototype.toString.call(ctor) === Function.prototype.toString.call(Object);
      };
      getValue = function(obj) {
        if (isFunction(obj.valueOf)) {
          return obj.valueOf();
        } else {
          return obj;
        }
      };
      module2.exports.assign = assign;
      module2.exports.isFunction = isFunction;
      module2.exports.isObject = isObject;
      module2.exports.isArray = isArray;
      module2.exports.isEmpty = isEmpty;
      module2.exports.isPlainObject = isPlainObject;
      module2.exports.getValue = getValue;
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLDOMImplementation.js
var require_XMLDOMImplementation = __commonJS({
  "node_modules/xmlbuilder/lib/XMLDOMImplementation.js"(exports2, module2) {
    (function() {
      var XMLDOMImplementation;
      module2.exports = XMLDOMImplementation = function() {
        function XMLDOMImplementation2() {
        }
        XMLDOMImplementation2.prototype.hasFeature = function(feature, version) {
          return true;
        };
        XMLDOMImplementation2.prototype.createDocumentType = function(qualifiedName, publicId, systemId) {
          throw new Error("This DOM method is not implemented.");
        };
        XMLDOMImplementation2.prototype.createDocument = function(namespaceURI, qualifiedName, doctype) {
          throw new Error("This DOM method is not implemented.");
        };
        XMLDOMImplementation2.prototype.createHTMLDocument = function(title) {
          throw new Error("This DOM method is not implemented.");
        };
        XMLDOMImplementation2.prototype.getFeature = function(feature, version) {
          throw new Error("This DOM method is not implemented.");
        };
        return XMLDOMImplementation2;
      }();
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLDOMErrorHandler.js
var require_XMLDOMErrorHandler = __commonJS({
  "node_modules/xmlbuilder/lib/XMLDOMErrorHandler.js"(exports2, module2) {
    (function() {
      var XMLDOMErrorHandler;
      module2.exports = XMLDOMErrorHandler = function() {
        function XMLDOMErrorHandler2() {
        }
        XMLDOMErrorHandler2.prototype.handleError = function(error) {
          throw new Error(error);
        };
        return XMLDOMErrorHandler2;
      }();
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLDOMStringList.js
var require_XMLDOMStringList = __commonJS({
  "node_modules/xmlbuilder/lib/XMLDOMStringList.js"(exports2, module2) {
    (function() {
      var XMLDOMStringList;
      module2.exports = XMLDOMStringList = function() {
        function XMLDOMStringList2(arr) {
          this.arr = arr || [];
        }
        Object.defineProperty(XMLDOMStringList2.prototype, "length", {
          get: function() {
            return this.arr.length;
          }
        });
        XMLDOMStringList2.prototype.item = function(index) {
          return this.arr[index] || null;
        };
        XMLDOMStringList2.prototype.contains = function(str) {
          return this.arr.indexOf(str) !== -1;
        };
        return XMLDOMStringList2;
      }();
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLDOMConfiguration.js
var require_XMLDOMConfiguration = __commonJS({
  "node_modules/xmlbuilder/lib/XMLDOMConfiguration.js"(exports2, module2) {
    (function() {
      var XMLDOMConfiguration, XMLDOMErrorHandler, XMLDOMStringList;
      XMLDOMErrorHandler = require_XMLDOMErrorHandler();
      XMLDOMStringList = require_XMLDOMStringList();
      module2.exports = XMLDOMConfiguration = function() {
        function XMLDOMConfiguration2() {
          var clonedSelf;
          this.defaultParams = {
            "canonical-form": false,
            "cdata-sections": false,
            "comments": false,
            "datatype-normalization": false,
            "element-content-whitespace": true,
            "entities": true,
            "error-handler": new XMLDOMErrorHandler(),
            "infoset": true,
            "validate-if-schema": false,
            "namespaces": true,
            "namespace-declarations": true,
            "normalize-characters": false,
            "schema-location": "",
            "schema-type": "",
            "split-cdata-sections": true,
            "validate": false,
            "well-formed": true
          };
          this.params = clonedSelf = Object.create(this.defaultParams);
        }
        Object.defineProperty(XMLDOMConfiguration2.prototype, "parameterNames", {
          get: function() {
            return new XMLDOMStringList(Object.keys(this.defaultParams));
          }
        });
        XMLDOMConfiguration2.prototype.getParameter = function(name) {
          if (this.params.hasOwnProperty(name)) {
            return this.params[name];
          } else {
            return null;
          }
        };
        XMLDOMConfiguration2.prototype.canSetParameter = function(name, value) {
          return true;
        };
        XMLDOMConfiguration2.prototype.setParameter = function(name, value) {
          if (value != null) {
            return this.params[name] = value;
          } else {
            return delete this.params[name];
          }
        };
        return XMLDOMConfiguration2;
      }();
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/NodeType.js
var require_NodeType = __commonJS({
  "node_modules/xmlbuilder/lib/NodeType.js"(exports2, module2) {
    (function() {
      module2.exports = {
        Element: 1,
        Attribute: 2,
        Text: 3,
        CData: 4,
        EntityReference: 5,
        EntityDeclaration: 6,
        ProcessingInstruction: 7,
        Comment: 8,
        Document: 9,
        DocType: 10,
        DocumentFragment: 11,
        NotationDeclaration: 12,
        Declaration: 201,
        Raw: 202,
        AttributeDeclaration: 203,
        ElementDeclaration: 204,
        Dummy: 205
      };
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLAttribute.js
var require_XMLAttribute = __commonJS({
  "node_modules/xmlbuilder/lib/XMLAttribute.js"(exports2, module2) {
    (function() {
      var NodeType, XMLAttribute, XMLNode;
      NodeType = require_NodeType();
      XMLNode = require_XMLNode();
      module2.exports = XMLAttribute = function() {
        function XMLAttribute2(parent, name, value) {
          this.parent = parent;
          if (this.parent) {
            this.options = this.parent.options;
            this.stringify = this.parent.stringify;
          }
          if (name == null) {
            throw new Error("Missing attribute name. " + this.debugInfo(name));
          }
          this.name = this.stringify.name(name);
          this.value = this.stringify.attValue(value);
          this.type = NodeType.Attribute;
          this.isId = false;
          this.schemaTypeInfo = null;
        }
        Object.defineProperty(XMLAttribute2.prototype, "nodeType", {
          get: function() {
            return this.type;
          }
        });
        Object.defineProperty(XMLAttribute2.prototype, "ownerElement", {
          get: function() {
            return this.parent;
          }
        });
        Object.defineProperty(XMLAttribute2.prototype, "textContent", {
          get: function() {
            return this.value;
          },
          set: function(value) {
            return this.value = value || "";
          }
        });
        Object.defineProperty(XMLAttribute2.prototype, "namespaceURI", {
          get: function() {
            return "";
          }
        });
        Object.defineProperty(XMLAttribute2.prototype, "prefix", {
          get: function() {
            return "";
          }
        });
        Object.defineProperty(XMLAttribute2.prototype, "localName", {
          get: function() {
            return this.name;
          }
        });
        Object.defineProperty(XMLAttribute2.prototype, "specified", {
          get: function() {
            return true;
          }
        });
        XMLAttribute2.prototype.clone = function() {
          return Object.create(this);
        };
        XMLAttribute2.prototype.toString = function(options) {
          return this.options.writer.attribute(this, this.options.writer.filterOptions(options));
        };
        XMLAttribute2.prototype.debugInfo = function(name) {
          name = name || this.name;
          if (name == null) {
            return "parent: <" + this.parent.name + ">";
          } else {
            return "attribute: {" + name + "}, parent: <" + this.parent.name + ">";
          }
        };
        XMLAttribute2.prototype.isEqualNode = function(node) {
          if (node.namespaceURI !== this.namespaceURI) {
            return false;
          }
          if (node.prefix !== this.prefix) {
            return false;
          }
          if (node.localName !== this.localName) {
            return false;
          }
          if (node.value !== this.value) {
            return false;
          }
          return true;
        };
        return XMLAttribute2;
      }();
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLNamedNodeMap.js
var require_XMLNamedNodeMap = __commonJS({
  "node_modules/xmlbuilder/lib/XMLNamedNodeMap.js"(exports2, module2) {
    (function() {
      var XMLNamedNodeMap;
      module2.exports = XMLNamedNodeMap = function() {
        function XMLNamedNodeMap2(nodes) {
          this.nodes = nodes;
        }
        Object.defineProperty(XMLNamedNodeMap2.prototype, "length", {
          get: function() {
            return Object.keys(this.nodes).length || 0;
          }
        });
        XMLNamedNodeMap2.prototype.clone = function() {
          return this.nodes = null;
        };
        XMLNamedNodeMap2.prototype.getNamedItem = function(name) {
          return this.nodes[name];
        };
        XMLNamedNodeMap2.prototype.setNamedItem = function(node) {
          var oldNode;
          oldNode = this.nodes[node.nodeName];
          this.nodes[node.nodeName] = node;
          return oldNode || null;
        };
        XMLNamedNodeMap2.prototype.removeNamedItem = function(name) {
          var oldNode;
          oldNode = this.nodes[name];
          delete this.nodes[name];
          return oldNode || null;
        };
        XMLNamedNodeMap2.prototype.item = function(index) {
          return this.nodes[Object.keys(this.nodes)[index]] || null;
        };
        XMLNamedNodeMap2.prototype.getNamedItemNS = function(namespaceURI, localName) {
          throw new Error("This DOM method is not implemented.");
        };
        XMLNamedNodeMap2.prototype.setNamedItemNS = function(node) {
          throw new Error("This DOM method is not implemented.");
        };
        XMLNamedNodeMap2.prototype.removeNamedItemNS = function(namespaceURI, localName) {
          throw new Error("This DOM method is not implemented.");
        };
        return XMLNamedNodeMap2;
      }();
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLElement.js
var require_XMLElement = __commonJS({
  "node_modules/xmlbuilder/lib/XMLElement.js"(exports2, module2) {
    (function() {
      var NodeType, XMLAttribute, XMLElement, XMLNamedNodeMap, XMLNode, getValue, isFunction, isObject, ref, extend = function(child, parent) {
        for (var key in parent) {
          if (hasProp.call(parent, key)) child[key] = parent[key];
        }
        function ctor() {
          this.constructor = child;
        }
        ctor.prototype = parent.prototype;
        child.prototype = new ctor();
        child.__super__ = parent.prototype;
        return child;
      }, hasProp = {}.hasOwnProperty;
      ref = require_Utility(), isObject = ref.isObject, isFunction = ref.isFunction, getValue = ref.getValue;
      XMLNode = require_XMLNode();
      NodeType = require_NodeType();
      XMLAttribute = require_XMLAttribute();
      XMLNamedNodeMap = require_XMLNamedNodeMap();
      module2.exports = XMLElement = function(superClass) {
        extend(XMLElement2, superClass);
        function XMLElement2(parent, name, attributes) {
          var child, j, len, ref1;
          XMLElement2.__super__.constructor.call(this, parent);
          if (name == null) {
            throw new Error("Missing element name. " + this.debugInfo());
          }
          this.name = this.stringify.name(name);
          this.type = NodeType.Element;
          this.attribs = {};
          this.schemaTypeInfo = null;
          if (attributes != null) {
            this.attribute(attributes);
          }
          if (parent.type === NodeType.Document) {
            this.isRoot = true;
            this.documentObject = parent;
            parent.rootObject = this;
            if (parent.children) {
              ref1 = parent.children;
              for (j = 0, len = ref1.length; j < len; j++) {
                child = ref1[j];
                if (child.type === NodeType.DocType) {
                  child.name = this.name;
                  break;
                }
              }
            }
          }
        }
        Object.defineProperty(XMLElement2.prototype, "tagName", {
          get: function() {
            return this.name;
          }
        });
        Object.defineProperty(XMLElement2.prototype, "namespaceURI", {
          get: function() {
            return "";
          }
        });
        Object.defineProperty(XMLElement2.prototype, "prefix", {
          get: function() {
            return "";
          }
        });
        Object.defineProperty(XMLElement2.prototype, "localName", {
          get: function() {
            return this.name;
          }
        });
        Object.defineProperty(XMLElement2.prototype, "id", {
          get: function() {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
        });
        Object.defineProperty(XMLElement2.prototype, "className", {
          get: function() {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
        });
        Object.defineProperty(XMLElement2.prototype, "classList", {
          get: function() {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
        });
        Object.defineProperty(XMLElement2.prototype, "attributes", {
          get: function() {
            if (!this.attributeMap || !this.attributeMap.nodes) {
              this.attributeMap = new XMLNamedNodeMap(this.attribs);
            }
            return this.attributeMap;
          }
        });
        XMLElement2.prototype.clone = function() {
          var att, attName, clonedSelf, ref1;
          clonedSelf = Object.create(this);
          if (clonedSelf.isRoot) {
            clonedSelf.documentObject = null;
          }
          clonedSelf.attribs = {};
          ref1 = this.attribs;
          for (attName in ref1) {
            if (!hasProp.call(ref1, attName)) continue;
            att = ref1[attName];
            clonedSelf.attribs[attName] = att.clone();
          }
          clonedSelf.children = [];
          this.children.forEach(function(child) {
            var clonedChild;
            clonedChild = child.clone();
            clonedChild.parent = clonedSelf;
            return clonedSelf.children.push(clonedChild);
          });
          return clonedSelf;
        };
        XMLElement2.prototype.attribute = function(name, value) {
          var attName, attValue;
          if (name != null) {
            name = getValue(name);
          }
          if (isObject(name)) {
            for (attName in name) {
              if (!hasProp.call(name, attName)) continue;
              attValue = name[attName];
              this.attribute(attName, attValue);
            }
          } else {
            if (isFunction(value)) {
              value = value.apply();
            }
            if (this.options.keepNullAttributes && value == null) {
              this.attribs[name] = new XMLAttribute(this, name, "");
            } else if (value != null) {
              this.attribs[name] = new XMLAttribute(this, name, value);
            }
          }
          return this;
        };
        XMLElement2.prototype.removeAttribute = function(name) {
          var attName, j, len;
          if (name == null) {
            throw new Error("Missing attribute name. " + this.debugInfo());
          }
          name = getValue(name);
          if (Array.isArray(name)) {
            for (j = 0, len = name.length; j < len; j++) {
              attName = name[j];
              delete this.attribs[attName];
            }
          } else {
            delete this.attribs[name];
          }
          return this;
        };
        XMLElement2.prototype.toString = function(options) {
          return this.options.writer.element(this, this.options.writer.filterOptions(options));
        };
        XMLElement2.prototype.att = function(name, value) {
          return this.attribute(name, value);
        };
        XMLElement2.prototype.a = function(name, value) {
          return this.attribute(name, value);
        };
        XMLElement2.prototype.getAttribute = function(name) {
          if (this.attribs.hasOwnProperty(name)) {
            return this.attribs[name].value;
          } else {
            return null;
          }
        };
        XMLElement2.prototype.setAttribute = function(name, value) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLElement2.prototype.getAttributeNode = function(name) {
          if (this.attribs.hasOwnProperty(name)) {
            return this.attribs[name];
          } else {
            return null;
          }
        };
        XMLElement2.prototype.setAttributeNode = function(newAttr) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLElement2.prototype.removeAttributeNode = function(oldAttr) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLElement2.prototype.getElementsByTagName = function(name) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLElement2.prototype.getAttributeNS = function(namespaceURI, localName) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLElement2.prototype.setAttributeNS = function(namespaceURI, qualifiedName, value) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLElement2.prototype.removeAttributeNS = function(namespaceURI, localName) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLElement2.prototype.getAttributeNodeNS = function(namespaceURI, localName) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLElement2.prototype.setAttributeNodeNS = function(newAttr) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLElement2.prototype.getElementsByTagNameNS = function(namespaceURI, localName) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLElement2.prototype.hasAttribute = function(name) {
          return this.attribs.hasOwnProperty(name);
        };
        XMLElement2.prototype.hasAttributeNS = function(namespaceURI, localName) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLElement2.prototype.setIdAttribute = function(name, isId) {
          if (this.attribs.hasOwnProperty(name)) {
            return this.attribs[name].isId;
          } else {
            return isId;
          }
        };
        XMLElement2.prototype.setIdAttributeNS = function(namespaceURI, localName, isId) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLElement2.prototype.setIdAttributeNode = function(idAttr, isId) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLElement2.prototype.getElementsByTagName = function(tagname) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLElement2.prototype.getElementsByTagNameNS = function(namespaceURI, localName) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLElement2.prototype.getElementsByClassName = function(classNames) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLElement2.prototype.isEqualNode = function(node) {
          var i, j, ref1;
          if (!XMLElement2.__super__.isEqualNode.apply(this, arguments).isEqualNode(node)) {
            return false;
          }
          if (node.namespaceURI !== this.namespaceURI) {
            return false;
          }
          if (node.prefix !== this.prefix) {
            return false;
          }
          if (node.localName !== this.localName) {
            return false;
          }
          if (node.attribs.length !== this.attribs.length) {
            return false;
          }
          for (i = j = 0, ref1 = this.attribs.length - 1; 0 <= ref1 ? j <= ref1 : j >= ref1; i = 0 <= ref1 ? ++j : --j) {
            if (!this.attribs[i].isEqualNode(node.attribs[i])) {
              return false;
            }
          }
          return true;
        };
        return XMLElement2;
      }(XMLNode);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLCharacterData.js
var require_XMLCharacterData = __commonJS({
  "node_modules/xmlbuilder/lib/XMLCharacterData.js"(exports2, module2) {
    (function() {
      var XMLCharacterData, XMLNode, extend = function(child, parent) {
        for (var key in parent) {
          if (hasProp.call(parent, key)) child[key] = parent[key];
        }
        function ctor() {
          this.constructor = child;
        }
        ctor.prototype = parent.prototype;
        child.prototype = new ctor();
        child.__super__ = parent.prototype;
        return child;
      }, hasProp = {}.hasOwnProperty;
      XMLNode = require_XMLNode();
      module2.exports = XMLCharacterData = function(superClass) {
        extend(XMLCharacterData2, superClass);
        function XMLCharacterData2(parent) {
          XMLCharacterData2.__super__.constructor.call(this, parent);
          this.value = "";
        }
        Object.defineProperty(XMLCharacterData2.prototype, "data", {
          get: function() {
            return this.value;
          },
          set: function(value) {
            return this.value = value || "";
          }
        });
        Object.defineProperty(XMLCharacterData2.prototype, "length", {
          get: function() {
            return this.value.length;
          }
        });
        Object.defineProperty(XMLCharacterData2.prototype, "textContent", {
          get: function() {
            return this.value;
          },
          set: function(value) {
            return this.value = value || "";
          }
        });
        XMLCharacterData2.prototype.clone = function() {
          return Object.create(this);
        };
        XMLCharacterData2.prototype.substringData = function(offset, count) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLCharacterData2.prototype.appendData = function(arg) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLCharacterData2.prototype.insertData = function(offset, arg) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLCharacterData2.prototype.deleteData = function(offset, count) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLCharacterData2.prototype.replaceData = function(offset, count, arg) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLCharacterData2.prototype.isEqualNode = function(node) {
          if (!XMLCharacterData2.__super__.isEqualNode.apply(this, arguments).isEqualNode(node)) {
            return false;
          }
          if (node.data !== this.data) {
            return false;
          }
          return true;
        };
        return XMLCharacterData2;
      }(XMLNode);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLCData.js
var require_XMLCData = __commonJS({
  "node_modules/xmlbuilder/lib/XMLCData.js"(exports2, module2) {
    (function() {
      var NodeType, XMLCData, XMLCharacterData, extend = function(child, parent) {
        for (var key in parent) {
          if (hasProp.call(parent, key)) child[key] = parent[key];
        }
        function ctor() {
          this.constructor = child;
        }
        ctor.prototype = parent.prototype;
        child.prototype = new ctor();
        child.__super__ = parent.prototype;
        return child;
      }, hasProp = {}.hasOwnProperty;
      NodeType = require_NodeType();
      XMLCharacterData = require_XMLCharacterData();
      module2.exports = XMLCData = function(superClass) {
        extend(XMLCData2, superClass);
        function XMLCData2(parent, text) {
          XMLCData2.__super__.constructor.call(this, parent);
          if (text == null) {
            throw new Error("Missing CDATA text. " + this.debugInfo());
          }
          this.name = "#cdata-section";
          this.type = NodeType.CData;
          this.value = this.stringify.cdata(text);
        }
        XMLCData2.prototype.clone = function() {
          return Object.create(this);
        };
        XMLCData2.prototype.toString = function(options) {
          return this.options.writer.cdata(this, this.options.writer.filterOptions(options));
        };
        return XMLCData2;
      }(XMLCharacterData);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLComment.js
var require_XMLComment = __commonJS({
  "node_modules/xmlbuilder/lib/XMLComment.js"(exports2, module2) {
    (function() {
      var NodeType, XMLCharacterData, XMLComment, extend = function(child, parent) {
        for (var key in parent) {
          if (hasProp.call(parent, key)) child[key] = parent[key];
        }
        function ctor() {
          this.constructor = child;
        }
        ctor.prototype = parent.prototype;
        child.prototype = new ctor();
        child.__super__ = parent.prototype;
        return child;
      }, hasProp = {}.hasOwnProperty;
      NodeType = require_NodeType();
      XMLCharacterData = require_XMLCharacterData();
      module2.exports = XMLComment = function(superClass) {
        extend(XMLComment2, superClass);
        function XMLComment2(parent, text) {
          XMLComment2.__super__.constructor.call(this, parent);
          if (text == null) {
            throw new Error("Missing comment text. " + this.debugInfo());
          }
          this.name = "#comment";
          this.type = NodeType.Comment;
          this.value = this.stringify.comment(text);
        }
        XMLComment2.prototype.clone = function() {
          return Object.create(this);
        };
        XMLComment2.prototype.toString = function(options) {
          return this.options.writer.comment(this, this.options.writer.filterOptions(options));
        };
        return XMLComment2;
      }(XMLCharacterData);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLDeclaration.js
var require_XMLDeclaration = __commonJS({
  "node_modules/xmlbuilder/lib/XMLDeclaration.js"(exports2, module2) {
    (function() {
      var NodeType, XMLDeclaration, XMLNode, isObject, extend = function(child, parent) {
        for (var key in parent) {
          if (hasProp.call(parent, key)) child[key] = parent[key];
        }
        function ctor() {
          this.constructor = child;
        }
        ctor.prototype = parent.prototype;
        child.prototype = new ctor();
        child.__super__ = parent.prototype;
        return child;
      }, hasProp = {}.hasOwnProperty;
      isObject = require_Utility().isObject;
      XMLNode = require_XMLNode();
      NodeType = require_NodeType();
      module2.exports = XMLDeclaration = function(superClass) {
        extend(XMLDeclaration2, superClass);
        function XMLDeclaration2(parent, version, encoding, standalone) {
          var ref;
          XMLDeclaration2.__super__.constructor.call(this, parent);
          if (isObject(version)) {
            ref = version, version = ref.version, encoding = ref.encoding, standalone = ref.standalone;
          }
          if (!version) {
            version = "1.0";
          }
          this.type = NodeType.Declaration;
          this.version = this.stringify.xmlVersion(version);
          if (encoding != null) {
            this.encoding = this.stringify.xmlEncoding(encoding);
          }
          if (standalone != null) {
            this.standalone = this.stringify.xmlStandalone(standalone);
          }
        }
        XMLDeclaration2.prototype.toString = function(options) {
          return this.options.writer.declaration(this, this.options.writer.filterOptions(options));
        };
        return XMLDeclaration2;
      }(XMLNode);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLDTDAttList.js
var require_XMLDTDAttList = __commonJS({
  "node_modules/xmlbuilder/lib/XMLDTDAttList.js"(exports2, module2) {
    (function() {
      var NodeType, XMLDTDAttList, XMLNode, extend = function(child, parent) {
        for (var key in parent) {
          if (hasProp.call(parent, key)) child[key] = parent[key];
        }
        function ctor() {
          this.constructor = child;
        }
        ctor.prototype = parent.prototype;
        child.prototype = new ctor();
        child.__super__ = parent.prototype;
        return child;
      }, hasProp = {}.hasOwnProperty;
      XMLNode = require_XMLNode();
      NodeType = require_NodeType();
      module2.exports = XMLDTDAttList = function(superClass) {
        extend(XMLDTDAttList2, superClass);
        function XMLDTDAttList2(parent, elementName, attributeName, attributeType, defaultValueType, defaultValue) {
          XMLDTDAttList2.__super__.constructor.call(this, parent);
          if (elementName == null) {
            throw new Error("Missing DTD element name. " + this.debugInfo());
          }
          if (attributeName == null) {
            throw new Error("Missing DTD attribute name. " + this.debugInfo(elementName));
          }
          if (!attributeType) {
            throw new Error("Missing DTD attribute type. " + this.debugInfo(elementName));
          }
          if (!defaultValueType) {
            throw new Error("Missing DTD attribute default. " + this.debugInfo(elementName));
          }
          if (defaultValueType.indexOf("#") !== 0) {
            defaultValueType = "#" + defaultValueType;
          }
          if (!defaultValueType.match(/^(#REQUIRED|#IMPLIED|#FIXED|#DEFAULT)$/)) {
            throw new Error("Invalid default value type; expected: #REQUIRED, #IMPLIED, #FIXED or #DEFAULT. " + this.debugInfo(elementName));
          }
          if (defaultValue && !defaultValueType.match(/^(#FIXED|#DEFAULT)$/)) {
            throw new Error("Default value only applies to #FIXED or #DEFAULT. " + this.debugInfo(elementName));
          }
          this.elementName = this.stringify.name(elementName);
          this.type = NodeType.AttributeDeclaration;
          this.attributeName = this.stringify.name(attributeName);
          this.attributeType = this.stringify.dtdAttType(attributeType);
          if (defaultValue) {
            this.defaultValue = this.stringify.dtdAttDefault(defaultValue);
          }
          this.defaultValueType = defaultValueType;
        }
        XMLDTDAttList2.prototype.toString = function(options) {
          return this.options.writer.dtdAttList(this, this.options.writer.filterOptions(options));
        };
        return XMLDTDAttList2;
      }(XMLNode);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLDTDEntity.js
var require_XMLDTDEntity = __commonJS({
  "node_modules/xmlbuilder/lib/XMLDTDEntity.js"(exports2, module2) {
    (function() {
      var NodeType, XMLDTDEntity, XMLNode, isObject, extend = function(child, parent) {
        for (var key in parent) {
          if (hasProp.call(parent, key)) child[key] = parent[key];
        }
        function ctor() {
          this.constructor = child;
        }
        ctor.prototype = parent.prototype;
        child.prototype = new ctor();
        child.__super__ = parent.prototype;
        return child;
      }, hasProp = {}.hasOwnProperty;
      isObject = require_Utility().isObject;
      XMLNode = require_XMLNode();
      NodeType = require_NodeType();
      module2.exports = XMLDTDEntity = function(superClass) {
        extend(XMLDTDEntity2, superClass);
        function XMLDTDEntity2(parent, pe, name, value) {
          XMLDTDEntity2.__super__.constructor.call(this, parent);
          if (name == null) {
            throw new Error("Missing DTD entity name. " + this.debugInfo(name));
          }
          if (value == null) {
            throw new Error("Missing DTD entity value. " + this.debugInfo(name));
          }
          this.pe = !!pe;
          this.name = this.stringify.name(name);
          this.type = NodeType.EntityDeclaration;
          if (!isObject(value)) {
            this.value = this.stringify.dtdEntityValue(value);
            this.internal = true;
          } else {
            if (!value.pubID && !value.sysID) {
              throw new Error("Public and/or system identifiers are required for an external entity. " + this.debugInfo(name));
            }
            if (value.pubID && !value.sysID) {
              throw new Error("System identifier is required for a public external entity. " + this.debugInfo(name));
            }
            this.internal = false;
            if (value.pubID != null) {
              this.pubID = this.stringify.dtdPubID(value.pubID);
            }
            if (value.sysID != null) {
              this.sysID = this.stringify.dtdSysID(value.sysID);
            }
            if (value.nData != null) {
              this.nData = this.stringify.dtdNData(value.nData);
            }
            if (this.pe && this.nData) {
              throw new Error("Notation declaration is not allowed in a parameter entity. " + this.debugInfo(name));
            }
          }
        }
        Object.defineProperty(XMLDTDEntity2.prototype, "publicId", {
          get: function() {
            return this.pubID;
          }
        });
        Object.defineProperty(XMLDTDEntity2.prototype, "systemId", {
          get: function() {
            return this.sysID;
          }
        });
        Object.defineProperty(XMLDTDEntity2.prototype, "notationName", {
          get: function() {
            return this.nData || null;
          }
        });
        Object.defineProperty(XMLDTDEntity2.prototype, "inputEncoding", {
          get: function() {
            return null;
          }
        });
        Object.defineProperty(XMLDTDEntity2.prototype, "xmlEncoding", {
          get: function() {
            return null;
          }
        });
        Object.defineProperty(XMLDTDEntity2.prototype, "xmlVersion", {
          get: function() {
            return null;
          }
        });
        XMLDTDEntity2.prototype.toString = function(options) {
          return this.options.writer.dtdEntity(this, this.options.writer.filterOptions(options));
        };
        return XMLDTDEntity2;
      }(XMLNode);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLDTDElement.js
var require_XMLDTDElement = __commonJS({
  "node_modules/xmlbuilder/lib/XMLDTDElement.js"(exports2, module2) {
    (function() {
      var NodeType, XMLDTDElement, XMLNode, extend = function(child, parent) {
        for (var key in parent) {
          if (hasProp.call(parent, key)) child[key] = parent[key];
        }
        function ctor() {
          this.constructor = child;
        }
        ctor.prototype = parent.prototype;
        child.prototype = new ctor();
        child.__super__ = parent.prototype;
        return child;
      }, hasProp = {}.hasOwnProperty;
      XMLNode = require_XMLNode();
      NodeType = require_NodeType();
      module2.exports = XMLDTDElement = function(superClass) {
        extend(XMLDTDElement2, superClass);
        function XMLDTDElement2(parent, name, value) {
          XMLDTDElement2.__super__.constructor.call(this, parent);
          if (name == null) {
            throw new Error("Missing DTD element name. " + this.debugInfo());
          }
          if (!value) {
            value = "(#PCDATA)";
          }
          if (Array.isArray(value)) {
            value = "(" + value.join(",") + ")";
          }
          this.name = this.stringify.name(name);
          this.type = NodeType.ElementDeclaration;
          this.value = this.stringify.dtdElementValue(value);
        }
        XMLDTDElement2.prototype.toString = function(options) {
          return this.options.writer.dtdElement(this, this.options.writer.filterOptions(options));
        };
        return XMLDTDElement2;
      }(XMLNode);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLDTDNotation.js
var require_XMLDTDNotation = __commonJS({
  "node_modules/xmlbuilder/lib/XMLDTDNotation.js"(exports2, module2) {
    (function() {
      var NodeType, XMLDTDNotation, XMLNode, extend = function(child, parent) {
        for (var key in parent) {
          if (hasProp.call(parent, key)) child[key] = parent[key];
        }
        function ctor() {
          this.constructor = child;
        }
        ctor.prototype = parent.prototype;
        child.prototype = new ctor();
        child.__super__ = parent.prototype;
        return child;
      }, hasProp = {}.hasOwnProperty;
      XMLNode = require_XMLNode();
      NodeType = require_NodeType();
      module2.exports = XMLDTDNotation = function(superClass) {
        extend(XMLDTDNotation2, superClass);
        function XMLDTDNotation2(parent, name, value) {
          XMLDTDNotation2.__super__.constructor.call(this, parent);
          if (name == null) {
            throw new Error("Missing DTD notation name. " + this.debugInfo(name));
          }
          if (!value.pubID && !value.sysID) {
            throw new Error("Public or system identifiers are required for an external entity. " + this.debugInfo(name));
          }
          this.name = this.stringify.name(name);
          this.type = NodeType.NotationDeclaration;
          if (value.pubID != null) {
            this.pubID = this.stringify.dtdPubID(value.pubID);
          }
          if (value.sysID != null) {
            this.sysID = this.stringify.dtdSysID(value.sysID);
          }
        }
        Object.defineProperty(XMLDTDNotation2.prototype, "publicId", {
          get: function() {
            return this.pubID;
          }
        });
        Object.defineProperty(XMLDTDNotation2.prototype, "systemId", {
          get: function() {
            return this.sysID;
          }
        });
        XMLDTDNotation2.prototype.toString = function(options) {
          return this.options.writer.dtdNotation(this, this.options.writer.filterOptions(options));
        };
        return XMLDTDNotation2;
      }(XMLNode);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLDocType.js
var require_XMLDocType = __commonJS({
  "node_modules/xmlbuilder/lib/XMLDocType.js"(exports2, module2) {
    (function() {
      var NodeType, XMLDTDAttList, XMLDTDElement, XMLDTDEntity, XMLDTDNotation, XMLDocType, XMLNamedNodeMap, XMLNode, isObject, extend = function(child, parent) {
        for (var key in parent) {
          if (hasProp.call(parent, key)) child[key] = parent[key];
        }
        function ctor() {
          this.constructor = child;
        }
        ctor.prototype = parent.prototype;
        child.prototype = new ctor();
        child.__super__ = parent.prototype;
        return child;
      }, hasProp = {}.hasOwnProperty;
      isObject = require_Utility().isObject;
      XMLNode = require_XMLNode();
      NodeType = require_NodeType();
      XMLDTDAttList = require_XMLDTDAttList();
      XMLDTDEntity = require_XMLDTDEntity();
      XMLDTDElement = require_XMLDTDElement();
      XMLDTDNotation = require_XMLDTDNotation();
      XMLNamedNodeMap = require_XMLNamedNodeMap();
      module2.exports = XMLDocType = function(superClass) {
        extend(XMLDocType2, superClass);
        function XMLDocType2(parent, pubID, sysID) {
          var child, i, len, ref, ref1, ref2;
          XMLDocType2.__super__.constructor.call(this, parent);
          this.type = NodeType.DocType;
          if (parent.children) {
            ref = parent.children;
            for (i = 0, len = ref.length; i < len; i++) {
              child = ref[i];
              if (child.type === NodeType.Element) {
                this.name = child.name;
                break;
              }
            }
          }
          this.documentObject = parent;
          if (isObject(pubID)) {
            ref1 = pubID, pubID = ref1.pubID, sysID = ref1.sysID;
          }
          if (sysID == null) {
            ref2 = [pubID, sysID], sysID = ref2[0], pubID = ref2[1];
          }
          if (pubID != null) {
            this.pubID = this.stringify.dtdPubID(pubID);
          }
          if (sysID != null) {
            this.sysID = this.stringify.dtdSysID(sysID);
          }
        }
        Object.defineProperty(XMLDocType2.prototype, "entities", {
          get: function() {
            var child, i, len, nodes, ref;
            nodes = {};
            ref = this.children;
            for (i = 0, len = ref.length; i < len; i++) {
              child = ref[i];
              if (child.type === NodeType.EntityDeclaration && !child.pe) {
                nodes[child.name] = child;
              }
            }
            return new XMLNamedNodeMap(nodes);
          }
        });
        Object.defineProperty(XMLDocType2.prototype, "notations", {
          get: function() {
            var child, i, len, nodes, ref;
            nodes = {};
            ref = this.children;
            for (i = 0, len = ref.length; i < len; i++) {
              child = ref[i];
              if (child.type === NodeType.NotationDeclaration) {
                nodes[child.name] = child;
              }
            }
            return new XMLNamedNodeMap(nodes);
          }
        });
        Object.defineProperty(XMLDocType2.prototype, "publicId", {
          get: function() {
            return this.pubID;
          }
        });
        Object.defineProperty(XMLDocType2.prototype, "systemId", {
          get: function() {
            return this.sysID;
          }
        });
        Object.defineProperty(XMLDocType2.prototype, "internalSubset", {
          get: function() {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
        });
        XMLDocType2.prototype.element = function(name, value) {
          var child;
          child = new XMLDTDElement(this, name, value);
          this.children.push(child);
          return this;
        };
        XMLDocType2.prototype.attList = function(elementName, attributeName, attributeType, defaultValueType, defaultValue) {
          var child;
          child = new XMLDTDAttList(this, elementName, attributeName, attributeType, defaultValueType, defaultValue);
          this.children.push(child);
          return this;
        };
        XMLDocType2.prototype.entity = function(name, value) {
          var child;
          child = new XMLDTDEntity(this, false, name, value);
          this.children.push(child);
          return this;
        };
        XMLDocType2.prototype.pEntity = function(name, value) {
          var child;
          child = new XMLDTDEntity(this, true, name, value);
          this.children.push(child);
          return this;
        };
        XMLDocType2.prototype.notation = function(name, value) {
          var child;
          child = new XMLDTDNotation(this, name, value);
          this.children.push(child);
          return this;
        };
        XMLDocType2.prototype.toString = function(options) {
          return this.options.writer.docType(this, this.options.writer.filterOptions(options));
        };
        XMLDocType2.prototype.ele = function(name, value) {
          return this.element(name, value);
        };
        XMLDocType2.prototype.att = function(elementName, attributeName, attributeType, defaultValueType, defaultValue) {
          return this.attList(elementName, attributeName, attributeType, defaultValueType, defaultValue);
        };
        XMLDocType2.prototype.ent = function(name, value) {
          return this.entity(name, value);
        };
        XMLDocType2.prototype.pent = function(name, value) {
          return this.pEntity(name, value);
        };
        XMLDocType2.prototype.not = function(name, value) {
          return this.notation(name, value);
        };
        XMLDocType2.prototype.up = function() {
          return this.root() || this.documentObject;
        };
        XMLDocType2.prototype.isEqualNode = function(node) {
          if (!XMLDocType2.__super__.isEqualNode.apply(this, arguments).isEqualNode(node)) {
            return false;
          }
          if (node.name !== this.name) {
            return false;
          }
          if (node.publicId !== this.publicId) {
            return false;
          }
          if (node.systemId !== this.systemId) {
            return false;
          }
          return true;
        };
        return XMLDocType2;
      }(XMLNode);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLRaw.js
var require_XMLRaw = __commonJS({
  "node_modules/xmlbuilder/lib/XMLRaw.js"(exports2, module2) {
    (function() {
      var NodeType, XMLNode, XMLRaw, extend = function(child, parent) {
        for (var key in parent) {
          if (hasProp.call(parent, key)) child[key] = parent[key];
        }
        function ctor() {
          this.constructor = child;
        }
        ctor.prototype = parent.prototype;
        child.prototype = new ctor();
        child.__super__ = parent.prototype;
        return child;
      }, hasProp = {}.hasOwnProperty;
      NodeType = require_NodeType();
      XMLNode = require_XMLNode();
      module2.exports = XMLRaw = function(superClass) {
        extend(XMLRaw2, superClass);
        function XMLRaw2(parent, text) {
          XMLRaw2.__super__.constructor.call(this, parent);
          if (text == null) {
            throw new Error("Missing raw text. " + this.debugInfo());
          }
          this.type = NodeType.Raw;
          this.value = this.stringify.raw(text);
        }
        XMLRaw2.prototype.clone = function() {
          return Object.create(this);
        };
        XMLRaw2.prototype.toString = function(options) {
          return this.options.writer.raw(this, this.options.writer.filterOptions(options));
        };
        return XMLRaw2;
      }(XMLNode);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLText.js
var require_XMLText = __commonJS({
  "node_modules/xmlbuilder/lib/XMLText.js"(exports2, module2) {
    (function() {
      var NodeType, XMLCharacterData, XMLText, extend = function(child, parent) {
        for (var key in parent) {
          if (hasProp.call(parent, key)) child[key] = parent[key];
        }
        function ctor() {
          this.constructor = child;
        }
        ctor.prototype = parent.prototype;
        child.prototype = new ctor();
        child.__super__ = parent.prototype;
        return child;
      }, hasProp = {}.hasOwnProperty;
      NodeType = require_NodeType();
      XMLCharacterData = require_XMLCharacterData();
      module2.exports = XMLText = function(superClass) {
        extend(XMLText2, superClass);
        function XMLText2(parent, text) {
          XMLText2.__super__.constructor.call(this, parent);
          if (text == null) {
            throw new Error("Missing element text. " + this.debugInfo());
          }
          this.name = "#text";
          this.type = NodeType.Text;
          this.value = this.stringify.text(text);
        }
        Object.defineProperty(XMLText2.prototype, "isElementContentWhitespace", {
          get: function() {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
        });
        Object.defineProperty(XMLText2.prototype, "wholeText", {
          get: function() {
            var next, prev, str;
            str = "";
            prev = this.previousSibling;
            while (prev) {
              str = prev.data + str;
              prev = prev.previousSibling;
            }
            str += this.data;
            next = this.nextSibling;
            while (next) {
              str = str + next.data;
              next = next.nextSibling;
            }
            return str;
          }
        });
        XMLText2.prototype.clone = function() {
          return Object.create(this);
        };
        XMLText2.prototype.toString = function(options) {
          return this.options.writer.text(this, this.options.writer.filterOptions(options));
        };
        XMLText2.prototype.splitText = function(offset) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLText2.prototype.replaceWholeText = function(content) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        return XMLText2;
      }(XMLCharacterData);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLProcessingInstruction.js
var require_XMLProcessingInstruction = __commonJS({
  "node_modules/xmlbuilder/lib/XMLProcessingInstruction.js"(exports2, module2) {
    (function() {
      var NodeType, XMLCharacterData, XMLProcessingInstruction, extend = function(child, parent) {
        for (var key in parent) {
          if (hasProp.call(parent, key)) child[key] = parent[key];
        }
        function ctor() {
          this.constructor = child;
        }
        ctor.prototype = parent.prototype;
        child.prototype = new ctor();
        child.__super__ = parent.prototype;
        return child;
      }, hasProp = {}.hasOwnProperty;
      NodeType = require_NodeType();
      XMLCharacterData = require_XMLCharacterData();
      module2.exports = XMLProcessingInstruction = function(superClass) {
        extend(XMLProcessingInstruction2, superClass);
        function XMLProcessingInstruction2(parent, target, value) {
          XMLProcessingInstruction2.__super__.constructor.call(this, parent);
          if (target == null) {
            throw new Error("Missing instruction target. " + this.debugInfo());
          }
          this.type = NodeType.ProcessingInstruction;
          this.target = this.stringify.insTarget(target);
          this.name = this.target;
          if (value) {
            this.value = this.stringify.insValue(value);
          }
        }
        XMLProcessingInstruction2.prototype.clone = function() {
          return Object.create(this);
        };
        XMLProcessingInstruction2.prototype.toString = function(options) {
          return this.options.writer.processingInstruction(this, this.options.writer.filterOptions(options));
        };
        XMLProcessingInstruction2.prototype.isEqualNode = function(node) {
          if (!XMLProcessingInstruction2.__super__.isEqualNode.apply(this, arguments).isEqualNode(node)) {
            return false;
          }
          if (node.target !== this.target) {
            return false;
          }
          return true;
        };
        return XMLProcessingInstruction2;
      }(XMLCharacterData);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLDummy.js
var require_XMLDummy = __commonJS({
  "node_modules/xmlbuilder/lib/XMLDummy.js"(exports2, module2) {
    (function() {
      var NodeType, XMLDummy, XMLNode, extend = function(child, parent) {
        for (var key in parent) {
          if (hasProp.call(parent, key)) child[key] = parent[key];
        }
        function ctor() {
          this.constructor = child;
        }
        ctor.prototype = parent.prototype;
        child.prototype = new ctor();
        child.__super__ = parent.prototype;
        return child;
      }, hasProp = {}.hasOwnProperty;
      XMLNode = require_XMLNode();
      NodeType = require_NodeType();
      module2.exports = XMLDummy = function(superClass) {
        extend(XMLDummy2, superClass);
        function XMLDummy2(parent) {
          XMLDummy2.__super__.constructor.call(this, parent);
          this.type = NodeType.Dummy;
        }
        XMLDummy2.prototype.clone = function() {
          return Object.create(this);
        };
        XMLDummy2.prototype.toString = function(options) {
          return "";
        };
        return XMLDummy2;
      }(XMLNode);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLNodeList.js
var require_XMLNodeList = __commonJS({
  "node_modules/xmlbuilder/lib/XMLNodeList.js"(exports2, module2) {
    (function() {
      var XMLNodeList;
      module2.exports = XMLNodeList = function() {
        function XMLNodeList2(nodes) {
          this.nodes = nodes;
        }
        Object.defineProperty(XMLNodeList2.prototype, "length", {
          get: function() {
            return this.nodes.length || 0;
          }
        });
        XMLNodeList2.prototype.clone = function() {
          return this.nodes = null;
        };
        XMLNodeList2.prototype.item = function(index) {
          return this.nodes[index] || null;
        };
        return XMLNodeList2;
      }();
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/DocumentPosition.js
var require_DocumentPosition = __commonJS({
  "node_modules/xmlbuilder/lib/DocumentPosition.js"(exports2, module2) {
    (function() {
      module2.exports = {
        Disconnected: 1,
        Preceding: 2,
        Following: 4,
        Contains: 8,
        ContainedBy: 16,
        ImplementationSpecific: 32
      };
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLNode.js
var require_XMLNode = __commonJS({
  "node_modules/xmlbuilder/lib/XMLNode.js"(exports2, module2) {
    (function() {
      var DocumentPosition, NodeType, XMLCData, XMLComment, XMLDeclaration, XMLDocType, XMLDummy, XMLElement, XMLNamedNodeMap, XMLNode, XMLNodeList, XMLProcessingInstruction, XMLRaw, XMLText, getValue, isEmpty, isFunction, isObject, ref1, hasProp = {}.hasOwnProperty;
      ref1 = require_Utility(), isObject = ref1.isObject, isFunction = ref1.isFunction, isEmpty = ref1.isEmpty, getValue = ref1.getValue;
      XMLElement = null;
      XMLCData = null;
      XMLComment = null;
      XMLDeclaration = null;
      XMLDocType = null;
      XMLRaw = null;
      XMLText = null;
      XMLProcessingInstruction = null;
      XMLDummy = null;
      NodeType = null;
      XMLNodeList = null;
      XMLNamedNodeMap = null;
      DocumentPosition = null;
      module2.exports = XMLNode = function() {
        function XMLNode2(parent1) {
          this.parent = parent1;
          if (this.parent) {
            this.options = this.parent.options;
            this.stringify = this.parent.stringify;
          }
          this.value = null;
          this.children = [];
          this.baseURI = null;
          if (!XMLElement) {
            XMLElement = require_XMLElement();
            XMLCData = require_XMLCData();
            XMLComment = require_XMLComment();
            XMLDeclaration = require_XMLDeclaration();
            XMLDocType = require_XMLDocType();
            XMLRaw = require_XMLRaw();
            XMLText = require_XMLText();
            XMLProcessingInstruction = require_XMLProcessingInstruction();
            XMLDummy = require_XMLDummy();
            NodeType = require_NodeType();
            XMLNodeList = require_XMLNodeList();
            XMLNamedNodeMap = require_XMLNamedNodeMap();
            DocumentPosition = require_DocumentPosition();
          }
        }
        Object.defineProperty(XMLNode2.prototype, "nodeName", {
          get: function() {
            return this.name;
          }
        });
        Object.defineProperty(XMLNode2.prototype, "nodeType", {
          get: function() {
            return this.type;
          }
        });
        Object.defineProperty(XMLNode2.prototype, "nodeValue", {
          get: function() {
            return this.value;
          }
        });
        Object.defineProperty(XMLNode2.prototype, "parentNode", {
          get: function() {
            return this.parent;
          }
        });
        Object.defineProperty(XMLNode2.prototype, "childNodes", {
          get: function() {
            if (!this.childNodeList || !this.childNodeList.nodes) {
              this.childNodeList = new XMLNodeList(this.children);
            }
            return this.childNodeList;
          }
        });
        Object.defineProperty(XMLNode2.prototype, "firstChild", {
          get: function() {
            return this.children[0] || null;
          }
        });
        Object.defineProperty(XMLNode2.prototype, "lastChild", {
          get: function() {
            return this.children[this.children.length - 1] || null;
          }
        });
        Object.defineProperty(XMLNode2.prototype, "previousSibling", {
          get: function() {
            var i;
            i = this.parent.children.indexOf(this);
            return this.parent.children[i - 1] || null;
          }
        });
        Object.defineProperty(XMLNode2.prototype, "nextSibling", {
          get: function() {
            var i;
            i = this.parent.children.indexOf(this);
            return this.parent.children[i + 1] || null;
          }
        });
        Object.defineProperty(XMLNode2.prototype, "ownerDocument", {
          get: function() {
            return this.document() || null;
          }
        });
        Object.defineProperty(XMLNode2.prototype, "textContent", {
          get: function() {
            var child, j, len, ref2, str;
            if (this.nodeType === NodeType.Element || this.nodeType === NodeType.DocumentFragment) {
              str = "";
              ref2 = this.children;
              for (j = 0, len = ref2.length; j < len; j++) {
                child = ref2[j];
                if (child.textContent) {
                  str += child.textContent;
                }
              }
              return str;
            } else {
              return null;
            }
          },
          set: function(value) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
        });
        XMLNode2.prototype.setParent = function(parent) {
          var child, j, len, ref2, results;
          this.parent = parent;
          if (parent) {
            this.options = parent.options;
            this.stringify = parent.stringify;
          }
          ref2 = this.children;
          results = [];
          for (j = 0, len = ref2.length; j < len; j++) {
            child = ref2[j];
            results.push(child.setParent(this));
          }
          return results;
        };
        XMLNode2.prototype.element = function(name, attributes, text) {
          var childNode, item, j, k, key, lastChild, len, len1, ref2, ref3, val;
          lastChild = null;
          if (attributes === null && text == null) {
            ref2 = [{}, null], attributes = ref2[0], text = ref2[1];
          }
          if (attributes == null) {
            attributes = {};
          }
          attributes = getValue(attributes);
          if (!isObject(attributes)) {
            ref3 = [attributes, text], text = ref3[0], attributes = ref3[1];
          }
          if (name != null) {
            name = getValue(name);
          }
          if (Array.isArray(name)) {
            for (j = 0, len = name.length; j < len; j++) {
              item = name[j];
              lastChild = this.element(item);
            }
          } else if (isFunction(name)) {
            lastChild = this.element(name.apply());
          } else if (isObject(name)) {
            for (key in name) {
              if (!hasProp.call(name, key)) continue;
              val = name[key];
              if (isFunction(val)) {
                val = val.apply();
              }
              if (!this.options.ignoreDecorators && this.stringify.convertAttKey && key.indexOf(this.stringify.convertAttKey) === 0) {
                lastChild = this.attribute(key.substr(this.stringify.convertAttKey.length), val);
              } else if (!this.options.separateArrayItems && Array.isArray(val) && isEmpty(val)) {
                lastChild = this.dummy();
              } else if (isObject(val) && isEmpty(val)) {
                lastChild = this.element(key);
              } else if (!this.options.keepNullNodes && val == null) {
                lastChild = this.dummy();
              } else if (!this.options.separateArrayItems && Array.isArray(val)) {
                for (k = 0, len1 = val.length; k < len1; k++) {
                  item = val[k];
                  childNode = {};
                  childNode[key] = item;
                  lastChild = this.element(childNode);
                }
              } else if (isObject(val)) {
                if (!this.options.ignoreDecorators && this.stringify.convertTextKey && key.indexOf(this.stringify.convertTextKey) === 0) {
                  lastChild = this.element(val);
                } else {
                  lastChild = this.element(key);
                  lastChild.element(val);
                }
              } else {
                lastChild = this.element(key, val);
              }
            }
          } else if (!this.options.keepNullNodes && text === null) {
            lastChild = this.dummy();
          } else {
            if (!this.options.ignoreDecorators && this.stringify.convertTextKey && name.indexOf(this.stringify.convertTextKey) === 0) {
              lastChild = this.text(text);
            } else if (!this.options.ignoreDecorators && this.stringify.convertCDataKey && name.indexOf(this.stringify.convertCDataKey) === 0) {
              lastChild = this.cdata(text);
            } else if (!this.options.ignoreDecorators && this.stringify.convertCommentKey && name.indexOf(this.stringify.convertCommentKey) === 0) {
              lastChild = this.comment(text);
            } else if (!this.options.ignoreDecorators && this.stringify.convertRawKey && name.indexOf(this.stringify.convertRawKey) === 0) {
              lastChild = this.raw(text);
            } else if (!this.options.ignoreDecorators && this.stringify.convertPIKey && name.indexOf(this.stringify.convertPIKey) === 0) {
              lastChild = this.instruction(name.substr(this.stringify.convertPIKey.length), text);
            } else {
              lastChild = this.node(name, attributes, text);
            }
          }
          if (lastChild == null) {
            throw new Error("Could not create any elements with: " + name + ". " + this.debugInfo());
          }
          return lastChild;
        };
        XMLNode2.prototype.insertBefore = function(name, attributes, text) {
          var child, i, newChild, refChild, removed;
          if (name != null ? name.type : void 0) {
            newChild = name;
            refChild = attributes;
            newChild.setParent(this);
            if (refChild) {
              i = children.indexOf(refChild);
              removed = children.splice(i);
              children.push(newChild);
              Array.prototype.push.apply(children, removed);
            } else {
              children.push(newChild);
            }
            return newChild;
          } else {
            if (this.isRoot) {
              throw new Error("Cannot insert elements at root level. " + this.debugInfo(name));
            }
            i = this.parent.children.indexOf(this);
            removed = this.parent.children.splice(i);
            child = this.parent.element(name, attributes, text);
            Array.prototype.push.apply(this.parent.children, removed);
            return child;
          }
        };
        XMLNode2.prototype.insertAfter = function(name, attributes, text) {
          var child, i, removed;
          if (this.isRoot) {
            throw new Error("Cannot insert elements at root level. " + this.debugInfo(name));
          }
          i = this.parent.children.indexOf(this);
          removed = this.parent.children.splice(i + 1);
          child = this.parent.element(name, attributes, text);
          Array.prototype.push.apply(this.parent.children, removed);
          return child;
        };
        XMLNode2.prototype.remove = function() {
          var i, ref2;
          if (this.isRoot) {
            throw new Error("Cannot remove the root element. " + this.debugInfo());
          }
          i = this.parent.children.indexOf(this);
          [].splice.apply(this.parent.children, [i, i - i + 1].concat(ref2 = [])), ref2;
          return this.parent;
        };
        XMLNode2.prototype.node = function(name, attributes, text) {
          var child, ref2;
          if (name != null) {
            name = getValue(name);
          }
          attributes || (attributes = {});
          attributes = getValue(attributes);
          if (!isObject(attributes)) {
            ref2 = [attributes, text], text = ref2[0], attributes = ref2[1];
          }
          child = new XMLElement(this, name, attributes);
          if (text != null) {
            child.text(text);
          }
          this.children.push(child);
          return child;
        };
        XMLNode2.prototype.text = function(value) {
          var child;
          if (isObject(value)) {
            this.element(value);
          }
          child = new XMLText(this, value);
          this.children.push(child);
          return this;
        };
        XMLNode2.prototype.cdata = function(value) {
          var child;
          child = new XMLCData(this, value);
          this.children.push(child);
          return this;
        };
        XMLNode2.prototype.comment = function(value) {
          var child;
          child = new XMLComment(this, value);
          this.children.push(child);
          return this;
        };
        XMLNode2.prototype.commentBefore = function(value) {
          var child, i, removed;
          i = this.parent.children.indexOf(this);
          removed = this.parent.children.splice(i);
          child = this.parent.comment(value);
          Array.prototype.push.apply(this.parent.children, removed);
          return this;
        };
        XMLNode2.prototype.commentAfter = function(value) {
          var child, i, removed;
          i = this.parent.children.indexOf(this);
          removed = this.parent.children.splice(i + 1);
          child = this.parent.comment(value);
          Array.prototype.push.apply(this.parent.children, removed);
          return this;
        };
        XMLNode2.prototype.raw = function(value) {
          var child;
          child = new XMLRaw(this, value);
          this.children.push(child);
          return this;
        };
        XMLNode2.prototype.dummy = function() {
          var child;
          child = new XMLDummy(this);
          return child;
        };
        XMLNode2.prototype.instruction = function(target, value) {
          var insTarget, insValue, instruction, j, len;
          if (target != null) {
            target = getValue(target);
          }
          if (value != null) {
            value = getValue(value);
          }
          if (Array.isArray(target)) {
            for (j = 0, len = target.length; j < len; j++) {
              insTarget = target[j];
              this.instruction(insTarget);
            }
          } else if (isObject(target)) {
            for (insTarget in target) {
              if (!hasProp.call(target, insTarget)) continue;
              insValue = target[insTarget];
              this.instruction(insTarget, insValue);
            }
          } else {
            if (isFunction(value)) {
              value = value.apply();
            }
            instruction = new XMLProcessingInstruction(this, target, value);
            this.children.push(instruction);
          }
          return this;
        };
        XMLNode2.prototype.instructionBefore = function(target, value) {
          var child, i, removed;
          i = this.parent.children.indexOf(this);
          removed = this.parent.children.splice(i);
          child = this.parent.instruction(target, value);
          Array.prototype.push.apply(this.parent.children, removed);
          return this;
        };
        XMLNode2.prototype.instructionAfter = function(target, value) {
          var child, i, removed;
          i = this.parent.children.indexOf(this);
          removed = this.parent.children.splice(i + 1);
          child = this.parent.instruction(target, value);
          Array.prototype.push.apply(this.parent.children, removed);
          return this;
        };
        XMLNode2.prototype.declaration = function(version, encoding, standalone) {
          var doc, xmldec;
          doc = this.document();
          xmldec = new XMLDeclaration(doc, version, encoding, standalone);
          if (doc.children.length === 0) {
            doc.children.unshift(xmldec);
          } else if (doc.children[0].type === NodeType.Declaration) {
            doc.children[0] = xmldec;
          } else {
            doc.children.unshift(xmldec);
          }
          return doc.root() || doc;
        };
        XMLNode2.prototype.dtd = function(pubID, sysID) {
          var child, doc, doctype, i, j, k, len, len1, ref2, ref3;
          doc = this.document();
          doctype = new XMLDocType(doc, pubID, sysID);
          ref2 = doc.children;
          for (i = j = 0, len = ref2.length; j < len; i = ++j) {
            child = ref2[i];
            if (child.type === NodeType.DocType) {
              doc.children[i] = doctype;
              return doctype;
            }
          }
          ref3 = doc.children;
          for (i = k = 0, len1 = ref3.length; k < len1; i = ++k) {
            child = ref3[i];
            if (child.isRoot) {
              doc.children.splice(i, 0, doctype);
              return doctype;
            }
          }
          doc.children.push(doctype);
          return doctype;
        };
        XMLNode2.prototype.up = function() {
          if (this.isRoot) {
            throw new Error("The root node has no parent. Use doc() if you need to get the document object.");
          }
          return this.parent;
        };
        XMLNode2.prototype.root = function() {
          var node;
          node = this;
          while (node) {
            if (node.type === NodeType.Document) {
              return node.rootObject;
            } else if (node.isRoot) {
              return node;
            } else {
              node = node.parent;
            }
          }
        };
        XMLNode2.prototype.document = function() {
          var node;
          node = this;
          while (node) {
            if (node.type === NodeType.Document) {
              return node;
            } else {
              node = node.parent;
            }
          }
        };
        XMLNode2.prototype.end = function(options) {
          return this.document().end(options);
        };
        XMLNode2.prototype.prev = function() {
          var i;
          i = this.parent.children.indexOf(this);
          if (i < 1) {
            throw new Error("Already at the first node. " + this.debugInfo());
          }
          return this.parent.children[i - 1];
        };
        XMLNode2.prototype.next = function() {
          var i;
          i = this.parent.children.indexOf(this);
          if (i === -1 || i === this.parent.children.length - 1) {
            throw new Error("Already at the last node. " + this.debugInfo());
          }
          return this.parent.children[i + 1];
        };
        XMLNode2.prototype.importDocument = function(doc) {
          var clonedRoot;
          clonedRoot = doc.root().clone();
          clonedRoot.parent = this;
          clonedRoot.isRoot = false;
          this.children.push(clonedRoot);
          return this;
        };
        XMLNode2.prototype.debugInfo = function(name) {
          var ref2, ref3;
          name = name || this.name;
          if (name == null && !((ref2 = this.parent) != null ? ref2.name : void 0)) {
            return "";
          } else if (name == null) {
            return "parent: <" + this.parent.name + ">";
          } else if (!((ref3 = this.parent) != null ? ref3.name : void 0)) {
            return "node: <" + name + ">";
          } else {
            return "node: <" + name + ">, parent: <" + this.parent.name + ">";
          }
        };
        XMLNode2.prototype.ele = function(name, attributes, text) {
          return this.element(name, attributes, text);
        };
        XMLNode2.prototype.nod = function(name, attributes, text) {
          return this.node(name, attributes, text);
        };
        XMLNode2.prototype.txt = function(value) {
          return this.text(value);
        };
        XMLNode2.prototype.dat = function(value) {
          return this.cdata(value);
        };
        XMLNode2.prototype.com = function(value) {
          return this.comment(value);
        };
        XMLNode2.prototype.ins = function(target, value) {
          return this.instruction(target, value);
        };
        XMLNode2.prototype.doc = function() {
          return this.document();
        };
        XMLNode2.prototype.dec = function(version, encoding, standalone) {
          return this.declaration(version, encoding, standalone);
        };
        XMLNode2.prototype.e = function(name, attributes, text) {
          return this.element(name, attributes, text);
        };
        XMLNode2.prototype.n = function(name, attributes, text) {
          return this.node(name, attributes, text);
        };
        XMLNode2.prototype.t = function(value) {
          return this.text(value);
        };
        XMLNode2.prototype.d = function(value) {
          return this.cdata(value);
        };
        XMLNode2.prototype.c = function(value) {
          return this.comment(value);
        };
        XMLNode2.prototype.r = function(value) {
          return this.raw(value);
        };
        XMLNode2.prototype.i = function(target, value) {
          return this.instruction(target, value);
        };
        XMLNode2.prototype.u = function() {
          return this.up();
        };
        XMLNode2.prototype.importXMLBuilder = function(doc) {
          return this.importDocument(doc);
        };
        XMLNode2.prototype.replaceChild = function(newChild, oldChild) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLNode2.prototype.removeChild = function(oldChild) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLNode2.prototype.appendChild = function(newChild) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLNode2.prototype.hasChildNodes = function() {
          return this.children.length !== 0;
        };
        XMLNode2.prototype.cloneNode = function(deep) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLNode2.prototype.normalize = function() {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLNode2.prototype.isSupported = function(feature, version) {
          return true;
        };
        XMLNode2.prototype.hasAttributes = function() {
          return this.attribs.length !== 0;
        };
        XMLNode2.prototype.compareDocumentPosition = function(other) {
          var ref, res;
          ref = this;
          if (ref === other) {
            return 0;
          } else if (this.document() !== other.document()) {
            res = DocumentPosition.Disconnected | DocumentPosition.ImplementationSpecific;
            if (Math.random() < 0.5) {
              res |= DocumentPosition.Preceding;
            } else {
              res |= DocumentPosition.Following;
            }
            return res;
          } else if (ref.isAncestor(other)) {
            return DocumentPosition.Contains | DocumentPosition.Preceding;
          } else if (ref.isDescendant(other)) {
            return DocumentPosition.Contains | DocumentPosition.Following;
          } else if (ref.isPreceding(other)) {
            return DocumentPosition.Preceding;
          } else {
            return DocumentPosition.Following;
          }
        };
        XMLNode2.prototype.isSameNode = function(other) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLNode2.prototype.lookupPrefix = function(namespaceURI) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLNode2.prototype.isDefaultNamespace = function(namespaceURI) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLNode2.prototype.lookupNamespaceURI = function(prefix) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLNode2.prototype.isEqualNode = function(node) {
          var i, j, ref2;
          if (node.nodeType !== this.nodeType) {
            return false;
          }
          if (node.children.length !== this.children.length) {
            return false;
          }
          for (i = j = 0, ref2 = this.children.length - 1; 0 <= ref2 ? j <= ref2 : j >= ref2; i = 0 <= ref2 ? ++j : --j) {
            if (!this.children[i].isEqualNode(node.children[i])) {
              return false;
            }
          }
          return true;
        };
        XMLNode2.prototype.getFeature = function(feature, version) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLNode2.prototype.setUserData = function(key, data, handler) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLNode2.prototype.getUserData = function(key) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLNode2.prototype.contains = function(other) {
          if (!other) {
            return false;
          }
          return other === this || this.isDescendant(other);
        };
        XMLNode2.prototype.isDescendant = function(node) {
          var child, isDescendantChild, j, len, ref2;
          ref2 = this.children;
          for (j = 0, len = ref2.length; j < len; j++) {
            child = ref2[j];
            if (node === child) {
              return true;
            }
            isDescendantChild = child.isDescendant(node);
            if (isDescendantChild) {
              return true;
            }
          }
          return false;
        };
        XMLNode2.prototype.isAncestor = function(node) {
          return node.isDescendant(this);
        };
        XMLNode2.prototype.isPreceding = function(node) {
          var nodePos, thisPos;
          nodePos = this.treePosition(node);
          thisPos = this.treePosition(this);
          if (nodePos === -1 || thisPos === -1) {
            return false;
          } else {
            return nodePos < thisPos;
          }
        };
        XMLNode2.prototype.isFollowing = function(node) {
          var nodePos, thisPos;
          nodePos = this.treePosition(node);
          thisPos = this.treePosition(this);
          if (nodePos === -1 || thisPos === -1) {
            return false;
          } else {
            return nodePos > thisPos;
          }
        };
        XMLNode2.prototype.treePosition = function(node) {
          var found, pos;
          pos = 0;
          found = false;
          this.foreachTreeNode(this.document(), function(childNode) {
            pos++;
            if (!found && childNode === node) {
              return found = true;
            }
          });
          if (found) {
            return pos;
          } else {
            return -1;
          }
        };
        XMLNode2.prototype.foreachTreeNode = function(node, func) {
          var child, j, len, ref2, res;
          node || (node = this.document());
          ref2 = node.children;
          for (j = 0, len = ref2.length; j < len; j++) {
            child = ref2[j];
            if (res = func(child)) {
              return res;
            } else {
              res = this.foreachTreeNode(child, func);
              if (res) {
                return res;
              }
            }
          }
        };
        return XMLNode2;
      }();
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLStringifier.js
var require_XMLStringifier = __commonJS({
  "node_modules/xmlbuilder/lib/XMLStringifier.js"(exports2, module2) {
    (function() {
      var XMLStringifier, bind = function(fn, me) {
        return function() {
          return fn.apply(me, arguments);
        };
      }, hasProp = {}.hasOwnProperty;
      module2.exports = XMLStringifier = function() {
        function XMLStringifier2(options) {
          this.assertLegalName = bind(this.assertLegalName, this);
          this.assertLegalChar = bind(this.assertLegalChar, this);
          var key, ref, value;
          options || (options = {});
          this.options = options;
          if (!this.options.version) {
            this.options.version = "1.0";
          }
          ref = options.stringify || {};
          for (key in ref) {
            if (!hasProp.call(ref, key)) continue;
            value = ref[key];
            this[key] = value;
          }
        }
        XMLStringifier2.prototype.name = function(val) {
          if (this.options.noValidation) {
            return val;
          }
          return this.assertLegalName("" + val || "");
        };
        XMLStringifier2.prototype.text = function(val) {
          if (this.options.noValidation) {
            return val;
          }
          return this.assertLegalChar(this.textEscape("" + val || ""));
        };
        XMLStringifier2.prototype.cdata = function(val) {
          if (this.options.noValidation) {
            return val;
          }
          val = "" + val || "";
          val = val.replace("]]>", "]]]]><![CDATA[>");
          return this.assertLegalChar(val);
        };
        XMLStringifier2.prototype.comment = function(val) {
          if (this.options.noValidation) {
            return val;
          }
          val = "" + val || "";
          if (val.match(/--/)) {
            throw new Error("Comment text cannot contain double-hypen: " + val);
          }
          return this.assertLegalChar(val);
        };
        XMLStringifier2.prototype.raw = function(val) {
          if (this.options.noValidation) {
            return val;
          }
          return "" + val || "";
        };
        XMLStringifier2.prototype.attValue = function(val) {
          if (this.options.noValidation) {
            return val;
          }
          return this.assertLegalChar(this.attEscape(val = "" + val || ""));
        };
        XMLStringifier2.prototype.insTarget = function(val) {
          if (this.options.noValidation) {
            return val;
          }
          return this.assertLegalChar("" + val || "");
        };
        XMLStringifier2.prototype.insValue = function(val) {
          if (this.options.noValidation) {
            return val;
          }
          val = "" + val || "";
          if (val.match(/\?>/)) {
            throw new Error("Invalid processing instruction value: " + val);
          }
          return this.assertLegalChar(val);
        };
        XMLStringifier2.prototype.xmlVersion = function(val) {
          if (this.options.noValidation) {
            return val;
          }
          val = "" + val || "";
          if (!val.match(/1\.[0-9]+/)) {
            throw new Error("Invalid version number: " + val);
          }
          return val;
        };
        XMLStringifier2.prototype.xmlEncoding = function(val) {
          if (this.options.noValidation) {
            return val;
          }
          val = "" + val || "";
          if (!val.match(/^[A-Za-z](?:[A-Za-z0-9._-])*$/)) {
            throw new Error("Invalid encoding: " + val);
          }
          return this.assertLegalChar(val);
        };
        XMLStringifier2.prototype.xmlStandalone = function(val) {
          if (this.options.noValidation) {
            return val;
          }
          if (val) {
            return "yes";
          } else {
            return "no";
          }
        };
        XMLStringifier2.prototype.dtdPubID = function(val) {
          if (this.options.noValidation) {
            return val;
          }
          return this.assertLegalChar("" + val || "");
        };
        XMLStringifier2.prototype.dtdSysID = function(val) {
          if (this.options.noValidation) {
            return val;
          }
          return this.assertLegalChar("" + val || "");
        };
        XMLStringifier2.prototype.dtdElementValue = function(val) {
          if (this.options.noValidation) {
            return val;
          }
          return this.assertLegalChar("" + val || "");
        };
        XMLStringifier2.prototype.dtdAttType = function(val) {
          if (this.options.noValidation) {
            return val;
          }
          return this.assertLegalChar("" + val || "");
        };
        XMLStringifier2.prototype.dtdAttDefault = function(val) {
          if (this.options.noValidation) {
            return val;
          }
          return this.assertLegalChar("" + val || "");
        };
        XMLStringifier2.prototype.dtdEntityValue = function(val) {
          if (this.options.noValidation) {
            return val;
          }
          return this.assertLegalChar("" + val || "");
        };
        XMLStringifier2.prototype.dtdNData = function(val) {
          if (this.options.noValidation) {
            return val;
          }
          return this.assertLegalChar("" + val || "");
        };
        XMLStringifier2.prototype.convertAttKey = "@";
        XMLStringifier2.prototype.convertPIKey = "?";
        XMLStringifier2.prototype.convertTextKey = "#text";
        XMLStringifier2.prototype.convertCDataKey = "#cdata";
        XMLStringifier2.prototype.convertCommentKey = "#comment";
        XMLStringifier2.prototype.convertRawKey = "#raw";
        XMLStringifier2.prototype.assertLegalChar = function(str) {
          var regex, res;
          if (this.options.noValidation) {
            return str;
          }
          regex = "";
          if (this.options.version === "1.0") {
            regex = /[\0-\x08\x0B\f\x0E-\x1F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
            if (res = str.match(regex)) {
              throw new Error("Invalid character in string: " + str + " at index " + res.index);
            }
          } else if (this.options.version === "1.1") {
            regex = /[\0\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
            if (res = str.match(regex)) {
              throw new Error("Invalid character in string: " + str + " at index " + res.index);
            }
          }
          return str;
        };
        XMLStringifier2.prototype.assertLegalName = function(str) {
          var regex;
          if (this.options.noValidation) {
            return str;
          }
          this.assertLegalChar(str);
          regex = /^([:A-Z_a-z\xC0-\xD6\xD8-\xF6\xF8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDFFF])([\x2D\.0-:A-Z_a-z\xB7\xC0-\xD6\xD8-\xF6\xF8-\u037D\u037F-\u1FFF\u200C\u200D\u203F\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDFFF])*$/;
          if (!str.match(regex)) {
            throw new Error("Invalid character in name");
          }
          return str;
        };
        XMLStringifier2.prototype.textEscape = function(str) {
          var ampregex;
          if (this.options.noValidation) {
            return str;
          }
          ampregex = this.options.noDoubleEncoding ? /(?!&\S+;)&/g : /&/g;
          return str.replace(ampregex, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#xD;");
        };
        XMLStringifier2.prototype.attEscape = function(str) {
          var ampregex;
          if (this.options.noValidation) {
            return str;
          }
          ampregex = this.options.noDoubleEncoding ? /(?!&\S+;)&/g : /&/g;
          return str.replace(ampregex, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/\t/g, "&#x9;").replace(/\n/g, "&#xA;").replace(/\r/g, "&#xD;");
        };
        return XMLStringifier2;
      }();
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/WriterState.js
var require_WriterState = __commonJS({
  "node_modules/xmlbuilder/lib/WriterState.js"(exports2, module2) {
    (function() {
      module2.exports = {
        None: 0,
        OpenTag: 1,
        InsideTag: 2,
        CloseTag: 3
      };
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLWriterBase.js
var require_XMLWriterBase = __commonJS({
  "node_modules/xmlbuilder/lib/XMLWriterBase.js"(exports2, module2) {
    (function() {
      var NodeType, WriterState, XMLCData, XMLComment, XMLDTDAttList, XMLDTDElement, XMLDTDEntity, XMLDTDNotation, XMLDeclaration, XMLDocType, XMLDummy, XMLElement, XMLProcessingInstruction, XMLRaw, XMLText, XMLWriterBase, assign, hasProp = {}.hasOwnProperty;
      assign = require_Utility().assign;
      NodeType = require_NodeType();
      XMLDeclaration = require_XMLDeclaration();
      XMLDocType = require_XMLDocType();
      XMLCData = require_XMLCData();
      XMLComment = require_XMLComment();
      XMLElement = require_XMLElement();
      XMLRaw = require_XMLRaw();
      XMLText = require_XMLText();
      XMLProcessingInstruction = require_XMLProcessingInstruction();
      XMLDummy = require_XMLDummy();
      XMLDTDAttList = require_XMLDTDAttList();
      XMLDTDElement = require_XMLDTDElement();
      XMLDTDEntity = require_XMLDTDEntity();
      XMLDTDNotation = require_XMLDTDNotation();
      WriterState = require_WriterState();
      module2.exports = XMLWriterBase = function() {
        function XMLWriterBase2(options) {
          var key, ref, value;
          options || (options = {});
          this.options = options;
          ref = options.writer || {};
          for (key in ref) {
            if (!hasProp.call(ref, key)) continue;
            value = ref[key];
            this["_" + key] = this[key];
            this[key] = value;
          }
        }
        XMLWriterBase2.prototype.filterOptions = function(options) {
          var filteredOptions, ref, ref1, ref2, ref3, ref4, ref5, ref6;
          options || (options = {});
          options = assign({}, this.options, options);
          filteredOptions = {
            writer: this
          };
          filteredOptions.pretty = options.pretty || false;
          filteredOptions.allowEmpty = options.allowEmpty || false;
          filteredOptions.indent = (ref = options.indent) != null ? ref : "  ";
          filteredOptions.newline = (ref1 = options.newline) != null ? ref1 : "\n";
          filteredOptions.offset = (ref2 = options.offset) != null ? ref2 : 0;
          filteredOptions.dontPrettyTextNodes = (ref3 = (ref4 = options.dontPrettyTextNodes) != null ? ref4 : options.dontprettytextnodes) != null ? ref3 : 0;
          filteredOptions.spaceBeforeSlash = (ref5 = (ref6 = options.spaceBeforeSlash) != null ? ref6 : options.spacebeforeslash) != null ? ref5 : "";
          if (filteredOptions.spaceBeforeSlash === true) {
            filteredOptions.spaceBeforeSlash = " ";
          }
          filteredOptions.suppressPrettyCount = 0;
          filteredOptions.user = {};
          filteredOptions.state = WriterState.None;
          return filteredOptions;
        };
        XMLWriterBase2.prototype.indent = function(node, options, level) {
          var indentLevel;
          if (!options.pretty || options.suppressPrettyCount) {
            return "";
          } else if (options.pretty) {
            indentLevel = (level || 0) + options.offset + 1;
            if (indentLevel > 0) {
              return new Array(indentLevel).join(options.indent);
            }
          }
          return "";
        };
        XMLWriterBase2.prototype.endline = function(node, options, level) {
          if (!options.pretty || options.suppressPrettyCount) {
            return "";
          } else {
            return options.newline;
          }
        };
        XMLWriterBase2.prototype.attribute = function(att, options, level) {
          var r;
          this.openAttribute(att, options, level);
          r = " " + att.name + '="' + att.value + '"';
          this.closeAttribute(att, options, level);
          return r;
        };
        XMLWriterBase2.prototype.cdata = function(node, options, level) {
          var r;
          this.openNode(node, options, level);
          options.state = WriterState.OpenTag;
          r = this.indent(node, options, level) + "<![CDATA[";
          options.state = WriterState.InsideTag;
          r += node.value;
          options.state = WriterState.CloseTag;
          r += "]]>" + this.endline(node, options, level);
          options.state = WriterState.None;
          this.closeNode(node, options, level);
          return r;
        };
        XMLWriterBase2.prototype.comment = function(node, options, level) {
          var r;
          this.openNode(node, options, level);
          options.state = WriterState.OpenTag;
          r = this.indent(node, options, level) + "<!-- ";
          options.state = WriterState.InsideTag;
          r += node.value;
          options.state = WriterState.CloseTag;
          r += " -->" + this.endline(node, options, level);
          options.state = WriterState.None;
          this.closeNode(node, options, level);
          return r;
        };
        XMLWriterBase2.prototype.declaration = function(node, options, level) {
          var r;
          this.openNode(node, options, level);
          options.state = WriterState.OpenTag;
          r = this.indent(node, options, level) + "<?xml";
          options.state = WriterState.InsideTag;
          r += ' version="' + node.version + '"';
          if (node.encoding != null) {
            r += ' encoding="' + node.encoding + '"';
          }
          if (node.standalone != null) {
            r += ' standalone="' + node.standalone + '"';
          }
          options.state = WriterState.CloseTag;
          r += options.spaceBeforeSlash + "?>";
          r += this.endline(node, options, level);
          options.state = WriterState.None;
          this.closeNode(node, options, level);
          return r;
        };
        XMLWriterBase2.prototype.docType = function(node, options, level) {
          var child, i, len, r, ref;
          level || (level = 0);
          this.openNode(node, options, level);
          options.state = WriterState.OpenTag;
          r = this.indent(node, options, level);
          r += "<!DOCTYPE " + node.root().name;
          if (node.pubID && node.sysID) {
            r += ' PUBLIC "' + node.pubID + '" "' + node.sysID + '"';
          } else if (node.sysID) {
            r += ' SYSTEM "' + node.sysID + '"';
          }
          if (node.children.length > 0) {
            r += " [";
            r += this.endline(node, options, level);
            options.state = WriterState.InsideTag;
            ref = node.children;
            for (i = 0, len = ref.length; i < len; i++) {
              child = ref[i];
              r += this.writeChildNode(child, options, level + 1);
            }
            options.state = WriterState.CloseTag;
            r += "]";
          }
          options.state = WriterState.CloseTag;
          r += options.spaceBeforeSlash + ">";
          r += this.endline(node, options, level);
          options.state = WriterState.None;
          this.closeNode(node, options, level);
          return r;
        };
        XMLWriterBase2.prototype.element = function(node, options, level) {
          var att, child, childNodeCount, firstChildNode, i, j, len, len1, name, prettySuppressed, r, ref, ref1, ref2;
          level || (level = 0);
          prettySuppressed = false;
          r = "";
          this.openNode(node, options, level);
          options.state = WriterState.OpenTag;
          r += this.indent(node, options, level) + "<" + node.name;
          ref = node.attribs;
          for (name in ref) {
            if (!hasProp.call(ref, name)) continue;
            att = ref[name];
            r += this.attribute(att, options, level);
          }
          childNodeCount = node.children.length;
          firstChildNode = childNodeCount === 0 ? null : node.children[0];
          if (childNodeCount === 0 || node.children.every(function(e) {
            return (e.type === NodeType.Text || e.type === NodeType.Raw) && e.value === "";
          })) {
            if (options.allowEmpty) {
              r += ">";
              options.state = WriterState.CloseTag;
              r += "</" + node.name + ">" + this.endline(node, options, level);
            } else {
              options.state = WriterState.CloseTag;
              r += options.spaceBeforeSlash + "/>" + this.endline(node, options, level);
            }
          } else if (options.pretty && childNodeCount === 1 && (firstChildNode.type === NodeType.Text || firstChildNode.type === NodeType.Raw) && firstChildNode.value != null) {
            r += ">";
            options.state = WriterState.InsideTag;
            options.suppressPrettyCount++;
            prettySuppressed = true;
            r += this.writeChildNode(firstChildNode, options, level + 1);
            options.suppressPrettyCount--;
            prettySuppressed = false;
            options.state = WriterState.CloseTag;
            r += "</" + node.name + ">" + this.endline(node, options, level);
          } else {
            if (options.dontPrettyTextNodes) {
              ref1 = node.children;
              for (i = 0, len = ref1.length; i < len; i++) {
                child = ref1[i];
                if ((child.type === NodeType.Text || child.type === NodeType.Raw) && child.value != null) {
                  options.suppressPrettyCount++;
                  prettySuppressed = true;
                  break;
                }
              }
            }
            r += ">" + this.endline(node, options, level);
            options.state = WriterState.InsideTag;
            ref2 = node.children;
            for (j = 0, len1 = ref2.length; j < len1; j++) {
              child = ref2[j];
              r += this.writeChildNode(child, options, level + 1);
            }
            options.state = WriterState.CloseTag;
            r += this.indent(node, options, level) + "</" + node.name + ">";
            if (prettySuppressed) {
              options.suppressPrettyCount--;
            }
            r += this.endline(node, options, level);
            options.state = WriterState.None;
          }
          this.closeNode(node, options, level);
          return r;
        };
        XMLWriterBase2.prototype.writeChildNode = function(node, options, level) {
          switch (node.type) {
            case NodeType.CData:
              return this.cdata(node, options, level);
            case NodeType.Comment:
              return this.comment(node, options, level);
            case NodeType.Element:
              return this.element(node, options, level);
            case NodeType.Raw:
              return this.raw(node, options, level);
            case NodeType.Text:
              return this.text(node, options, level);
            case NodeType.ProcessingInstruction:
              return this.processingInstruction(node, options, level);
            case NodeType.Dummy:
              return "";
            case NodeType.Declaration:
              return this.declaration(node, options, level);
            case NodeType.DocType:
              return this.docType(node, options, level);
            case NodeType.AttributeDeclaration:
              return this.dtdAttList(node, options, level);
            case NodeType.ElementDeclaration:
              return this.dtdElement(node, options, level);
            case NodeType.EntityDeclaration:
              return this.dtdEntity(node, options, level);
            case NodeType.NotationDeclaration:
              return this.dtdNotation(node, options, level);
            default:
              throw new Error("Unknown XML node type: " + node.constructor.name);
          }
        };
        XMLWriterBase2.prototype.processingInstruction = function(node, options, level) {
          var r;
          this.openNode(node, options, level);
          options.state = WriterState.OpenTag;
          r = this.indent(node, options, level) + "<?";
          options.state = WriterState.InsideTag;
          r += node.target;
          if (node.value) {
            r += " " + node.value;
          }
          options.state = WriterState.CloseTag;
          r += options.spaceBeforeSlash + "?>";
          r += this.endline(node, options, level);
          options.state = WriterState.None;
          this.closeNode(node, options, level);
          return r;
        };
        XMLWriterBase2.prototype.raw = function(node, options, level) {
          var r;
          this.openNode(node, options, level);
          options.state = WriterState.OpenTag;
          r = this.indent(node, options, level);
          options.state = WriterState.InsideTag;
          r += node.value;
          options.state = WriterState.CloseTag;
          r += this.endline(node, options, level);
          options.state = WriterState.None;
          this.closeNode(node, options, level);
          return r;
        };
        XMLWriterBase2.prototype.text = function(node, options, level) {
          var r;
          this.openNode(node, options, level);
          options.state = WriterState.OpenTag;
          r = this.indent(node, options, level);
          options.state = WriterState.InsideTag;
          r += node.value;
          options.state = WriterState.CloseTag;
          r += this.endline(node, options, level);
          options.state = WriterState.None;
          this.closeNode(node, options, level);
          return r;
        };
        XMLWriterBase2.prototype.dtdAttList = function(node, options, level) {
          var r;
          this.openNode(node, options, level);
          options.state = WriterState.OpenTag;
          r = this.indent(node, options, level) + "<!ATTLIST";
          options.state = WriterState.InsideTag;
          r += " " + node.elementName + " " + node.attributeName + " " + node.attributeType;
          if (node.defaultValueType !== "#DEFAULT") {
            r += " " + node.defaultValueType;
          }
          if (node.defaultValue) {
            r += ' "' + node.defaultValue + '"';
          }
          options.state = WriterState.CloseTag;
          r += options.spaceBeforeSlash + ">" + this.endline(node, options, level);
          options.state = WriterState.None;
          this.closeNode(node, options, level);
          return r;
        };
        XMLWriterBase2.prototype.dtdElement = function(node, options, level) {
          var r;
          this.openNode(node, options, level);
          options.state = WriterState.OpenTag;
          r = this.indent(node, options, level) + "<!ELEMENT";
          options.state = WriterState.InsideTag;
          r += " " + node.name + " " + node.value;
          options.state = WriterState.CloseTag;
          r += options.spaceBeforeSlash + ">" + this.endline(node, options, level);
          options.state = WriterState.None;
          this.closeNode(node, options, level);
          return r;
        };
        XMLWriterBase2.prototype.dtdEntity = function(node, options, level) {
          var r;
          this.openNode(node, options, level);
          options.state = WriterState.OpenTag;
          r = this.indent(node, options, level) + "<!ENTITY";
          options.state = WriterState.InsideTag;
          if (node.pe) {
            r += " %";
          }
          r += " " + node.name;
          if (node.value) {
            r += ' "' + node.value + '"';
          } else {
            if (node.pubID && node.sysID) {
              r += ' PUBLIC "' + node.pubID + '" "' + node.sysID + '"';
            } else if (node.sysID) {
              r += ' SYSTEM "' + node.sysID + '"';
            }
            if (node.nData) {
              r += " NDATA " + node.nData;
            }
          }
          options.state = WriterState.CloseTag;
          r += options.spaceBeforeSlash + ">" + this.endline(node, options, level);
          options.state = WriterState.None;
          this.closeNode(node, options, level);
          return r;
        };
        XMLWriterBase2.prototype.dtdNotation = function(node, options, level) {
          var r;
          this.openNode(node, options, level);
          options.state = WriterState.OpenTag;
          r = this.indent(node, options, level) + "<!NOTATION";
          options.state = WriterState.InsideTag;
          r += " " + node.name;
          if (node.pubID && node.sysID) {
            r += ' PUBLIC "' + node.pubID + '" "' + node.sysID + '"';
          } else if (node.pubID) {
            r += ' PUBLIC "' + node.pubID + '"';
          } else if (node.sysID) {
            r += ' SYSTEM "' + node.sysID + '"';
          }
          options.state = WriterState.CloseTag;
          r += options.spaceBeforeSlash + ">" + this.endline(node, options, level);
          options.state = WriterState.None;
          this.closeNode(node, options, level);
          return r;
        };
        XMLWriterBase2.prototype.openNode = function(node, options, level) {
        };
        XMLWriterBase2.prototype.closeNode = function(node, options, level) {
        };
        XMLWriterBase2.prototype.openAttribute = function(att, options, level) {
        };
        XMLWriterBase2.prototype.closeAttribute = function(att, options, level) {
        };
        return XMLWriterBase2;
      }();
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLStringWriter.js
var require_XMLStringWriter = __commonJS({
  "node_modules/xmlbuilder/lib/XMLStringWriter.js"(exports2, module2) {
    (function() {
      var XMLStringWriter, XMLWriterBase, extend = function(child, parent) {
        for (var key in parent) {
          if (hasProp.call(parent, key)) child[key] = parent[key];
        }
        function ctor() {
          this.constructor = child;
        }
        ctor.prototype = parent.prototype;
        child.prototype = new ctor();
        child.__super__ = parent.prototype;
        return child;
      }, hasProp = {}.hasOwnProperty;
      XMLWriterBase = require_XMLWriterBase();
      module2.exports = XMLStringWriter = function(superClass) {
        extend(XMLStringWriter2, superClass);
        function XMLStringWriter2(options) {
          XMLStringWriter2.__super__.constructor.call(this, options);
        }
        XMLStringWriter2.prototype.document = function(doc, options) {
          var child, i, len, r, ref;
          options = this.filterOptions(options);
          r = "";
          ref = doc.children;
          for (i = 0, len = ref.length; i < len; i++) {
            child = ref[i];
            r += this.writeChildNode(child, options, 0);
          }
          if (options.pretty && r.slice(-options.newline.length) === options.newline) {
            r = r.slice(0, -options.newline.length);
          }
          return r;
        };
        return XMLStringWriter2;
      }(XMLWriterBase);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLDocument.js
var require_XMLDocument = __commonJS({
  "node_modules/xmlbuilder/lib/XMLDocument.js"(exports2, module2) {
    (function() {
      var NodeType, XMLDOMConfiguration, XMLDOMImplementation, XMLDocument, XMLNode, XMLStringWriter, XMLStringifier, isPlainObject, extend = function(child, parent) {
        for (var key in parent) {
          if (hasProp.call(parent, key)) child[key] = parent[key];
        }
        function ctor() {
          this.constructor = child;
        }
        ctor.prototype = parent.prototype;
        child.prototype = new ctor();
        child.__super__ = parent.prototype;
        return child;
      }, hasProp = {}.hasOwnProperty;
      isPlainObject = require_Utility().isPlainObject;
      XMLDOMImplementation = require_XMLDOMImplementation();
      XMLDOMConfiguration = require_XMLDOMConfiguration();
      XMLNode = require_XMLNode();
      NodeType = require_NodeType();
      XMLStringifier = require_XMLStringifier();
      XMLStringWriter = require_XMLStringWriter();
      module2.exports = XMLDocument = function(superClass) {
        extend(XMLDocument2, superClass);
        function XMLDocument2(options) {
          XMLDocument2.__super__.constructor.call(this, null);
          this.name = "#document";
          this.type = NodeType.Document;
          this.documentURI = null;
          this.domConfig = new XMLDOMConfiguration();
          options || (options = {});
          if (!options.writer) {
            options.writer = new XMLStringWriter();
          }
          this.options = options;
          this.stringify = new XMLStringifier(options);
        }
        Object.defineProperty(XMLDocument2.prototype, "implementation", {
          value: new XMLDOMImplementation()
        });
        Object.defineProperty(XMLDocument2.prototype, "doctype", {
          get: function() {
            var child, i, len, ref;
            ref = this.children;
            for (i = 0, len = ref.length; i < len; i++) {
              child = ref[i];
              if (child.type === NodeType.DocType) {
                return child;
              }
            }
            return null;
          }
        });
        Object.defineProperty(XMLDocument2.prototype, "documentElement", {
          get: function() {
            return this.rootObject || null;
          }
        });
        Object.defineProperty(XMLDocument2.prototype, "inputEncoding", {
          get: function() {
            return null;
          }
        });
        Object.defineProperty(XMLDocument2.prototype, "strictErrorChecking", {
          get: function() {
            return false;
          }
        });
        Object.defineProperty(XMLDocument2.prototype, "xmlEncoding", {
          get: function() {
            if (this.children.length !== 0 && this.children[0].type === NodeType.Declaration) {
              return this.children[0].encoding;
            } else {
              return null;
            }
          }
        });
        Object.defineProperty(XMLDocument2.prototype, "xmlStandalone", {
          get: function() {
            if (this.children.length !== 0 && this.children[0].type === NodeType.Declaration) {
              return this.children[0].standalone === "yes";
            } else {
              return false;
            }
          }
        });
        Object.defineProperty(XMLDocument2.prototype, "xmlVersion", {
          get: function() {
            if (this.children.length !== 0 && this.children[0].type === NodeType.Declaration) {
              return this.children[0].version;
            } else {
              return "1.0";
            }
          }
        });
        Object.defineProperty(XMLDocument2.prototype, "URL", {
          get: function() {
            return this.documentURI;
          }
        });
        Object.defineProperty(XMLDocument2.prototype, "origin", {
          get: function() {
            return null;
          }
        });
        Object.defineProperty(XMLDocument2.prototype, "compatMode", {
          get: function() {
            return null;
          }
        });
        Object.defineProperty(XMLDocument2.prototype, "characterSet", {
          get: function() {
            return null;
          }
        });
        Object.defineProperty(XMLDocument2.prototype, "contentType", {
          get: function() {
            return null;
          }
        });
        XMLDocument2.prototype.end = function(writer) {
          var writerOptions;
          writerOptions = {};
          if (!writer) {
            writer = this.options.writer;
          } else if (isPlainObject(writer)) {
            writerOptions = writer;
            writer = this.options.writer;
          }
          return writer.document(this, writer.filterOptions(writerOptions));
        };
        XMLDocument2.prototype.toString = function(options) {
          return this.options.writer.document(this, this.options.writer.filterOptions(options));
        };
        XMLDocument2.prototype.createElement = function(tagName) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLDocument2.prototype.createDocumentFragment = function() {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLDocument2.prototype.createTextNode = function(data) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLDocument2.prototype.createComment = function(data) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLDocument2.prototype.createCDATASection = function(data) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLDocument2.prototype.createProcessingInstruction = function(target, data) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLDocument2.prototype.createAttribute = function(name) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLDocument2.prototype.createEntityReference = function(name) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLDocument2.prototype.getElementsByTagName = function(tagname) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLDocument2.prototype.importNode = function(importedNode, deep) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLDocument2.prototype.createElementNS = function(namespaceURI, qualifiedName) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLDocument2.prototype.createAttributeNS = function(namespaceURI, qualifiedName) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLDocument2.prototype.getElementsByTagNameNS = function(namespaceURI, localName) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLDocument2.prototype.getElementById = function(elementId) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLDocument2.prototype.adoptNode = function(source) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLDocument2.prototype.normalizeDocument = function() {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLDocument2.prototype.renameNode = function(node, namespaceURI, qualifiedName) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLDocument2.prototype.getElementsByClassName = function(classNames) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLDocument2.prototype.createEvent = function(eventInterface) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLDocument2.prototype.createRange = function() {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLDocument2.prototype.createNodeIterator = function(root, whatToShow, filter) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        XMLDocument2.prototype.createTreeWalker = function(root, whatToShow, filter) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        };
        return XMLDocument2;
      }(XMLNode);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLDocumentCB.js
var require_XMLDocumentCB = __commonJS({
  "node_modules/xmlbuilder/lib/XMLDocumentCB.js"(exports2, module2) {
    (function() {
      var NodeType, WriterState, XMLAttribute, XMLCData, XMLComment, XMLDTDAttList, XMLDTDElement, XMLDTDEntity, XMLDTDNotation, XMLDeclaration, XMLDocType, XMLDocument, XMLDocumentCB, XMLElement, XMLProcessingInstruction, XMLRaw, XMLStringWriter, XMLStringifier, XMLText, getValue, isFunction, isObject, isPlainObject, ref, hasProp = {}.hasOwnProperty;
      ref = require_Utility(), isObject = ref.isObject, isFunction = ref.isFunction, isPlainObject = ref.isPlainObject, getValue = ref.getValue;
      NodeType = require_NodeType();
      XMLDocument = require_XMLDocument();
      XMLElement = require_XMLElement();
      XMLCData = require_XMLCData();
      XMLComment = require_XMLComment();
      XMLRaw = require_XMLRaw();
      XMLText = require_XMLText();
      XMLProcessingInstruction = require_XMLProcessingInstruction();
      XMLDeclaration = require_XMLDeclaration();
      XMLDocType = require_XMLDocType();
      XMLDTDAttList = require_XMLDTDAttList();
      XMLDTDEntity = require_XMLDTDEntity();
      XMLDTDElement = require_XMLDTDElement();
      XMLDTDNotation = require_XMLDTDNotation();
      XMLAttribute = require_XMLAttribute();
      XMLStringifier = require_XMLStringifier();
      XMLStringWriter = require_XMLStringWriter();
      WriterState = require_WriterState();
      module2.exports = XMLDocumentCB = function() {
        function XMLDocumentCB2(options, onData, onEnd) {
          var writerOptions;
          this.name = "?xml";
          this.type = NodeType.Document;
          options || (options = {});
          writerOptions = {};
          if (!options.writer) {
            options.writer = new XMLStringWriter();
          } else if (isPlainObject(options.writer)) {
            writerOptions = options.writer;
            options.writer = new XMLStringWriter();
          }
          this.options = options;
          this.writer = options.writer;
          this.writerOptions = this.writer.filterOptions(writerOptions);
          this.stringify = new XMLStringifier(options);
          this.onDataCallback = onData || function() {
          };
          this.onEndCallback = onEnd || function() {
          };
          this.currentNode = null;
          this.currentLevel = -1;
          this.openTags = {};
          this.documentStarted = false;
          this.documentCompleted = false;
          this.root = null;
        }
        XMLDocumentCB2.prototype.createChildNode = function(node) {
          var att, attName, attributes, child, i, len, ref1, ref2;
          switch (node.type) {
            case NodeType.CData:
              this.cdata(node.value);
              break;
            case NodeType.Comment:
              this.comment(node.value);
              break;
            case NodeType.Element:
              attributes = {};
              ref1 = node.attribs;
              for (attName in ref1) {
                if (!hasProp.call(ref1, attName)) continue;
                att = ref1[attName];
                attributes[attName] = att.value;
              }
              this.node(node.name, attributes);
              break;
            case NodeType.Dummy:
              this.dummy();
              break;
            case NodeType.Raw:
              this.raw(node.value);
              break;
            case NodeType.Text:
              this.text(node.value);
              break;
            case NodeType.ProcessingInstruction:
              this.instruction(node.target, node.value);
              break;
            default:
              throw new Error("This XML node type is not supported in a JS object: " + node.constructor.name);
          }
          ref2 = node.children;
          for (i = 0, len = ref2.length; i < len; i++) {
            child = ref2[i];
            this.createChildNode(child);
            if (child.type === NodeType.Element) {
              this.up();
            }
          }
          return this;
        };
        XMLDocumentCB2.prototype.dummy = function() {
          return this;
        };
        XMLDocumentCB2.prototype.node = function(name, attributes, text) {
          var ref1;
          if (name == null) {
            throw new Error("Missing node name.");
          }
          if (this.root && this.currentLevel === -1) {
            throw new Error("Document can only have one root node. " + this.debugInfo(name));
          }
          this.openCurrent();
          name = getValue(name);
          if (attributes == null) {
            attributes = {};
          }
          attributes = getValue(attributes);
          if (!isObject(attributes)) {
            ref1 = [attributes, text], text = ref1[0], attributes = ref1[1];
          }
          this.currentNode = new XMLElement(this, name, attributes);
          this.currentNode.children = false;
          this.currentLevel++;
          this.openTags[this.currentLevel] = this.currentNode;
          if (text != null) {
            this.text(text);
          }
          return this;
        };
        XMLDocumentCB2.prototype.element = function(name, attributes, text) {
          var child, i, len, oldValidationFlag, ref1, root;
          if (this.currentNode && this.currentNode.type === NodeType.DocType) {
            this.dtdElement.apply(this, arguments);
          } else {
            if (Array.isArray(name) || isObject(name) || isFunction(name)) {
              oldValidationFlag = this.options.noValidation;
              this.options.noValidation = true;
              root = new XMLDocument(this.options).element("TEMP_ROOT");
              root.element(name);
              this.options.noValidation = oldValidationFlag;
              ref1 = root.children;
              for (i = 0, len = ref1.length; i < len; i++) {
                child = ref1[i];
                this.createChildNode(child);
                if (child.type === NodeType.Element) {
                  this.up();
                }
              }
            } else {
              this.node(name, attributes, text);
            }
          }
          return this;
        };
        XMLDocumentCB2.prototype.attribute = function(name, value) {
          var attName, attValue;
          if (!this.currentNode || this.currentNode.children) {
            throw new Error("att() can only be used immediately after an ele() call in callback mode. " + this.debugInfo(name));
          }
          if (name != null) {
            name = getValue(name);
          }
          if (isObject(name)) {
            for (attName in name) {
              if (!hasProp.call(name, attName)) continue;
              attValue = name[attName];
              this.attribute(attName, attValue);
            }
          } else {
            if (isFunction(value)) {
              value = value.apply();
            }
            if (this.options.keepNullAttributes && value == null) {
              this.currentNode.attribs[name] = new XMLAttribute(this, name, "");
            } else if (value != null) {
              this.currentNode.attribs[name] = new XMLAttribute(this, name, value);
            }
          }
          return this;
        };
        XMLDocumentCB2.prototype.text = function(value) {
          var node;
          this.openCurrent();
          node = new XMLText(this, value);
          this.onData(this.writer.text(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
          return this;
        };
        XMLDocumentCB2.prototype.cdata = function(value) {
          var node;
          this.openCurrent();
          node = new XMLCData(this, value);
          this.onData(this.writer.cdata(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
          return this;
        };
        XMLDocumentCB2.prototype.comment = function(value) {
          var node;
          this.openCurrent();
          node = new XMLComment(this, value);
          this.onData(this.writer.comment(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
          return this;
        };
        XMLDocumentCB2.prototype.raw = function(value) {
          var node;
          this.openCurrent();
          node = new XMLRaw(this, value);
          this.onData(this.writer.raw(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
          return this;
        };
        XMLDocumentCB2.prototype.instruction = function(target, value) {
          var i, insTarget, insValue, len, node;
          this.openCurrent();
          if (target != null) {
            target = getValue(target);
          }
          if (value != null) {
            value = getValue(value);
          }
          if (Array.isArray(target)) {
            for (i = 0, len = target.length; i < len; i++) {
              insTarget = target[i];
              this.instruction(insTarget);
            }
          } else if (isObject(target)) {
            for (insTarget in target) {
              if (!hasProp.call(target, insTarget)) continue;
              insValue = target[insTarget];
              this.instruction(insTarget, insValue);
            }
          } else {
            if (isFunction(value)) {
              value = value.apply();
            }
            node = new XMLProcessingInstruction(this, target, value);
            this.onData(this.writer.processingInstruction(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
          }
          return this;
        };
        XMLDocumentCB2.prototype.declaration = function(version, encoding, standalone) {
          var node;
          this.openCurrent();
          if (this.documentStarted) {
            throw new Error("declaration() must be the first node.");
          }
          node = new XMLDeclaration(this, version, encoding, standalone);
          this.onData(this.writer.declaration(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
          return this;
        };
        XMLDocumentCB2.prototype.doctype = function(root, pubID, sysID) {
          this.openCurrent();
          if (root == null) {
            throw new Error("Missing root node name.");
          }
          if (this.root) {
            throw new Error("dtd() must come before the root node.");
          }
          this.currentNode = new XMLDocType(this, pubID, sysID);
          this.currentNode.rootNodeName = root;
          this.currentNode.children = false;
          this.currentLevel++;
          this.openTags[this.currentLevel] = this.currentNode;
          return this;
        };
        XMLDocumentCB2.prototype.dtdElement = function(name, value) {
          var node;
          this.openCurrent();
          node = new XMLDTDElement(this, name, value);
          this.onData(this.writer.dtdElement(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
          return this;
        };
        XMLDocumentCB2.prototype.attList = function(elementName, attributeName, attributeType, defaultValueType, defaultValue) {
          var node;
          this.openCurrent();
          node = new XMLDTDAttList(this, elementName, attributeName, attributeType, defaultValueType, defaultValue);
          this.onData(this.writer.dtdAttList(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
          return this;
        };
        XMLDocumentCB2.prototype.entity = function(name, value) {
          var node;
          this.openCurrent();
          node = new XMLDTDEntity(this, false, name, value);
          this.onData(this.writer.dtdEntity(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
          return this;
        };
        XMLDocumentCB2.prototype.pEntity = function(name, value) {
          var node;
          this.openCurrent();
          node = new XMLDTDEntity(this, true, name, value);
          this.onData(this.writer.dtdEntity(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
          return this;
        };
        XMLDocumentCB2.prototype.notation = function(name, value) {
          var node;
          this.openCurrent();
          node = new XMLDTDNotation(this, name, value);
          this.onData(this.writer.dtdNotation(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
          return this;
        };
        XMLDocumentCB2.prototype.up = function() {
          if (this.currentLevel < 0) {
            throw new Error("The document node has no parent.");
          }
          if (this.currentNode) {
            if (this.currentNode.children) {
              this.closeNode(this.currentNode);
            } else {
              this.openNode(this.currentNode);
            }
            this.currentNode = null;
          } else {
            this.closeNode(this.openTags[this.currentLevel]);
          }
          delete this.openTags[this.currentLevel];
          this.currentLevel--;
          return this;
        };
        XMLDocumentCB2.prototype.end = function() {
          while (this.currentLevel >= 0) {
            this.up();
          }
          return this.onEnd();
        };
        XMLDocumentCB2.prototype.openCurrent = function() {
          if (this.currentNode) {
            this.currentNode.children = true;
            return this.openNode(this.currentNode);
          }
        };
        XMLDocumentCB2.prototype.openNode = function(node) {
          var att, chunk, name, ref1;
          if (!node.isOpen) {
            if (!this.root && this.currentLevel === 0 && node.type === NodeType.Element) {
              this.root = node;
            }
            chunk = "";
            if (node.type === NodeType.Element) {
              this.writerOptions.state = WriterState.OpenTag;
              chunk = this.writer.indent(node, this.writerOptions, this.currentLevel) + "<" + node.name;
              ref1 = node.attribs;
              for (name in ref1) {
                if (!hasProp.call(ref1, name)) continue;
                att = ref1[name];
                chunk += this.writer.attribute(att, this.writerOptions, this.currentLevel);
              }
              chunk += (node.children ? ">" : "/>") + this.writer.endline(node, this.writerOptions, this.currentLevel);
              this.writerOptions.state = WriterState.InsideTag;
            } else {
              this.writerOptions.state = WriterState.OpenTag;
              chunk = this.writer.indent(node, this.writerOptions, this.currentLevel) + "<!DOCTYPE " + node.rootNodeName;
              if (node.pubID && node.sysID) {
                chunk += ' PUBLIC "' + node.pubID + '" "' + node.sysID + '"';
              } else if (node.sysID) {
                chunk += ' SYSTEM "' + node.sysID + '"';
              }
              if (node.children) {
                chunk += " [";
                this.writerOptions.state = WriterState.InsideTag;
              } else {
                this.writerOptions.state = WriterState.CloseTag;
                chunk += ">";
              }
              chunk += this.writer.endline(node, this.writerOptions, this.currentLevel);
            }
            this.onData(chunk, this.currentLevel);
            return node.isOpen = true;
          }
        };
        XMLDocumentCB2.prototype.closeNode = function(node) {
          var chunk;
          if (!node.isClosed) {
            chunk = "";
            this.writerOptions.state = WriterState.CloseTag;
            if (node.type === NodeType.Element) {
              chunk = this.writer.indent(node, this.writerOptions, this.currentLevel) + "</" + node.name + ">" + this.writer.endline(node, this.writerOptions, this.currentLevel);
            } else {
              chunk = this.writer.indent(node, this.writerOptions, this.currentLevel) + "]>" + this.writer.endline(node, this.writerOptions, this.currentLevel);
            }
            this.writerOptions.state = WriterState.None;
            this.onData(chunk, this.currentLevel);
            return node.isClosed = true;
          }
        };
        XMLDocumentCB2.prototype.onData = function(chunk, level) {
          this.documentStarted = true;
          return this.onDataCallback(chunk, level + 1);
        };
        XMLDocumentCB2.prototype.onEnd = function() {
          this.documentCompleted = true;
          return this.onEndCallback();
        };
        XMLDocumentCB2.prototype.debugInfo = function(name) {
          if (name == null) {
            return "";
          } else {
            return "node: <" + name + ">";
          }
        };
        XMLDocumentCB2.prototype.ele = function() {
          return this.element.apply(this, arguments);
        };
        XMLDocumentCB2.prototype.nod = function(name, attributes, text) {
          return this.node(name, attributes, text);
        };
        XMLDocumentCB2.prototype.txt = function(value) {
          return this.text(value);
        };
        XMLDocumentCB2.prototype.dat = function(value) {
          return this.cdata(value);
        };
        XMLDocumentCB2.prototype.com = function(value) {
          return this.comment(value);
        };
        XMLDocumentCB2.prototype.ins = function(target, value) {
          return this.instruction(target, value);
        };
        XMLDocumentCB2.prototype.dec = function(version, encoding, standalone) {
          return this.declaration(version, encoding, standalone);
        };
        XMLDocumentCB2.prototype.dtd = function(root, pubID, sysID) {
          return this.doctype(root, pubID, sysID);
        };
        XMLDocumentCB2.prototype.e = function(name, attributes, text) {
          return this.element(name, attributes, text);
        };
        XMLDocumentCB2.prototype.n = function(name, attributes, text) {
          return this.node(name, attributes, text);
        };
        XMLDocumentCB2.prototype.t = function(value) {
          return this.text(value);
        };
        XMLDocumentCB2.prototype.d = function(value) {
          return this.cdata(value);
        };
        XMLDocumentCB2.prototype.c = function(value) {
          return this.comment(value);
        };
        XMLDocumentCB2.prototype.r = function(value) {
          return this.raw(value);
        };
        XMLDocumentCB2.prototype.i = function(target, value) {
          return this.instruction(target, value);
        };
        XMLDocumentCB2.prototype.att = function() {
          if (this.currentNode && this.currentNode.type === NodeType.DocType) {
            return this.attList.apply(this, arguments);
          } else {
            return this.attribute.apply(this, arguments);
          }
        };
        XMLDocumentCB2.prototype.a = function() {
          if (this.currentNode && this.currentNode.type === NodeType.DocType) {
            return this.attList.apply(this, arguments);
          } else {
            return this.attribute.apply(this, arguments);
          }
        };
        XMLDocumentCB2.prototype.ent = function(name, value) {
          return this.entity(name, value);
        };
        XMLDocumentCB2.prototype.pent = function(name, value) {
          return this.pEntity(name, value);
        };
        XMLDocumentCB2.prototype.not = function(name, value) {
          return this.notation(name, value);
        };
        return XMLDocumentCB2;
      }();
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLStreamWriter.js
var require_XMLStreamWriter = __commonJS({
  "node_modules/xmlbuilder/lib/XMLStreamWriter.js"(exports2, module2) {
    (function() {
      var NodeType, WriterState, XMLStreamWriter, XMLWriterBase, extend = function(child, parent) {
        for (var key in parent) {
          if (hasProp.call(parent, key)) child[key] = parent[key];
        }
        function ctor() {
          this.constructor = child;
        }
        ctor.prototype = parent.prototype;
        child.prototype = new ctor();
        child.__super__ = parent.prototype;
        return child;
      }, hasProp = {}.hasOwnProperty;
      NodeType = require_NodeType();
      XMLWriterBase = require_XMLWriterBase();
      WriterState = require_WriterState();
      module2.exports = XMLStreamWriter = function(superClass) {
        extend(XMLStreamWriter2, superClass);
        function XMLStreamWriter2(stream, options) {
          this.stream = stream;
          XMLStreamWriter2.__super__.constructor.call(this, options);
        }
        XMLStreamWriter2.prototype.endline = function(node, options, level) {
          if (node.isLastRootNode && options.state === WriterState.CloseTag) {
            return "";
          } else {
            return XMLStreamWriter2.__super__.endline.call(this, node, options, level);
          }
        };
        XMLStreamWriter2.prototype.document = function(doc, options) {
          var child, i, j, k, len, len1, ref, ref1, results;
          ref = doc.children;
          for (i = j = 0, len = ref.length; j < len; i = ++j) {
            child = ref[i];
            child.isLastRootNode = i === doc.children.length - 1;
          }
          options = this.filterOptions(options);
          ref1 = doc.children;
          results = [];
          for (k = 0, len1 = ref1.length; k < len1; k++) {
            child = ref1[k];
            results.push(this.writeChildNode(child, options, 0));
          }
          return results;
        };
        XMLStreamWriter2.prototype.attribute = function(att, options, level) {
          return this.stream.write(XMLStreamWriter2.__super__.attribute.call(this, att, options, level));
        };
        XMLStreamWriter2.prototype.cdata = function(node, options, level) {
          return this.stream.write(XMLStreamWriter2.__super__.cdata.call(this, node, options, level));
        };
        XMLStreamWriter2.prototype.comment = function(node, options, level) {
          return this.stream.write(XMLStreamWriter2.__super__.comment.call(this, node, options, level));
        };
        XMLStreamWriter2.prototype.declaration = function(node, options, level) {
          return this.stream.write(XMLStreamWriter2.__super__.declaration.call(this, node, options, level));
        };
        XMLStreamWriter2.prototype.docType = function(node, options, level) {
          var child, j, len, ref;
          level || (level = 0);
          this.openNode(node, options, level);
          options.state = WriterState.OpenTag;
          this.stream.write(this.indent(node, options, level));
          this.stream.write("<!DOCTYPE " + node.root().name);
          if (node.pubID && node.sysID) {
            this.stream.write(' PUBLIC "' + node.pubID + '" "' + node.sysID + '"');
          } else if (node.sysID) {
            this.stream.write(' SYSTEM "' + node.sysID + '"');
          }
          if (node.children.length > 0) {
            this.stream.write(" [");
            this.stream.write(this.endline(node, options, level));
            options.state = WriterState.InsideTag;
            ref = node.children;
            for (j = 0, len = ref.length; j < len; j++) {
              child = ref[j];
              this.writeChildNode(child, options, level + 1);
            }
            options.state = WriterState.CloseTag;
            this.stream.write("]");
          }
          options.state = WriterState.CloseTag;
          this.stream.write(options.spaceBeforeSlash + ">");
          this.stream.write(this.endline(node, options, level));
          options.state = WriterState.None;
          return this.closeNode(node, options, level);
        };
        XMLStreamWriter2.prototype.element = function(node, options, level) {
          var att, child, childNodeCount, firstChildNode, j, len, name, prettySuppressed, ref, ref1;
          level || (level = 0);
          this.openNode(node, options, level);
          options.state = WriterState.OpenTag;
          this.stream.write(this.indent(node, options, level) + "<" + node.name);
          ref = node.attribs;
          for (name in ref) {
            if (!hasProp.call(ref, name)) continue;
            att = ref[name];
            this.attribute(att, options, level);
          }
          childNodeCount = node.children.length;
          firstChildNode = childNodeCount === 0 ? null : node.children[0];
          if (childNodeCount === 0 || node.children.every(function(e) {
            return (e.type === NodeType.Text || e.type === NodeType.Raw) && e.value === "";
          })) {
            if (options.allowEmpty) {
              this.stream.write(">");
              options.state = WriterState.CloseTag;
              this.stream.write("</" + node.name + ">");
            } else {
              options.state = WriterState.CloseTag;
              this.stream.write(options.spaceBeforeSlash + "/>");
            }
          } else if (options.pretty && childNodeCount === 1 && (firstChildNode.type === NodeType.Text || firstChildNode.type === NodeType.Raw) && firstChildNode.value != null) {
            this.stream.write(">");
            options.state = WriterState.InsideTag;
            options.suppressPrettyCount++;
            prettySuppressed = true;
            this.writeChildNode(firstChildNode, options, level + 1);
            options.suppressPrettyCount--;
            prettySuppressed = false;
            options.state = WriterState.CloseTag;
            this.stream.write("</" + node.name + ">");
          } else {
            this.stream.write(">" + this.endline(node, options, level));
            options.state = WriterState.InsideTag;
            ref1 = node.children;
            for (j = 0, len = ref1.length; j < len; j++) {
              child = ref1[j];
              this.writeChildNode(child, options, level + 1);
            }
            options.state = WriterState.CloseTag;
            this.stream.write(this.indent(node, options, level) + "</" + node.name + ">");
          }
          this.stream.write(this.endline(node, options, level));
          options.state = WriterState.None;
          return this.closeNode(node, options, level);
        };
        XMLStreamWriter2.prototype.processingInstruction = function(node, options, level) {
          return this.stream.write(XMLStreamWriter2.__super__.processingInstruction.call(this, node, options, level));
        };
        XMLStreamWriter2.prototype.raw = function(node, options, level) {
          return this.stream.write(XMLStreamWriter2.__super__.raw.call(this, node, options, level));
        };
        XMLStreamWriter2.prototype.text = function(node, options, level) {
          return this.stream.write(XMLStreamWriter2.__super__.text.call(this, node, options, level));
        };
        XMLStreamWriter2.prototype.dtdAttList = function(node, options, level) {
          return this.stream.write(XMLStreamWriter2.__super__.dtdAttList.call(this, node, options, level));
        };
        XMLStreamWriter2.prototype.dtdElement = function(node, options, level) {
          return this.stream.write(XMLStreamWriter2.__super__.dtdElement.call(this, node, options, level));
        };
        XMLStreamWriter2.prototype.dtdEntity = function(node, options, level) {
          return this.stream.write(XMLStreamWriter2.__super__.dtdEntity.call(this, node, options, level));
        };
        XMLStreamWriter2.prototype.dtdNotation = function(node, options, level) {
          return this.stream.write(XMLStreamWriter2.__super__.dtdNotation.call(this, node, options, level));
        };
        return XMLStreamWriter2;
      }(XMLWriterBase);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/index.js
var require_lib = __commonJS({
  "node_modules/xmlbuilder/lib/index.js"(exports2, module2) {
    (function() {
      var NodeType, WriterState, XMLDOMImplementation, XMLDocument, XMLDocumentCB, XMLStreamWriter, XMLStringWriter, assign, isFunction, ref;
      ref = require_Utility(), assign = ref.assign, isFunction = ref.isFunction;
      XMLDOMImplementation = require_XMLDOMImplementation();
      XMLDocument = require_XMLDocument();
      XMLDocumentCB = require_XMLDocumentCB();
      XMLStringWriter = require_XMLStringWriter();
      XMLStreamWriter = require_XMLStreamWriter();
      NodeType = require_NodeType();
      WriterState = require_WriterState();
      module2.exports.create = function(name, xmldec, doctype, options) {
        var doc, root;
        if (name == null) {
          throw new Error("Root element needs a name.");
        }
        options = assign({}, xmldec, doctype, options);
        doc = new XMLDocument(options);
        root = doc.element(name);
        if (!options.headless) {
          doc.declaration(options);
          if (options.pubID != null || options.sysID != null) {
            doc.dtd(options);
          }
        }
        return root;
      };
      module2.exports.begin = function(options, onData, onEnd) {
        var ref1;
        if (isFunction(options)) {
          ref1 = [options, onData], onData = ref1[0], onEnd = ref1[1];
          options = {};
        }
        if (onData) {
          return new XMLDocumentCB(options, onData, onEnd);
        } else {
          return new XMLDocument(options);
        }
      };
      module2.exports.stringWriter = function(options) {
        return new XMLStringWriter(options);
      };
      module2.exports.streamWriter = function(stream, options) {
        return new XMLStreamWriter(stream, options);
      };
      module2.exports.implementation = new XMLDOMImplementation();
      module2.exports.nodeType = NodeType;
      module2.exports.writerState = WriterState;
    }).call(exports2);
  }
});

// node_modules/xml2js/lib/builder.js
var require_builder = __commonJS({
  "node_modules/xml2js/lib/builder.js"(exports2) {
    (function() {
      "use strict";
      var builder, defaults, escapeCDATA, requiresCDATA, wrapCDATA, hasProp = {}.hasOwnProperty;
      builder = require_lib();
      defaults = require_defaults().defaults;
      requiresCDATA = function(entry) {
        return typeof entry === "string" && (entry.indexOf("&") >= 0 || entry.indexOf(">") >= 0 || entry.indexOf("<") >= 0);
      };
      wrapCDATA = function(entry) {
        return "<![CDATA[" + escapeCDATA(entry) + "]]>";
      };
      escapeCDATA = function(entry) {
        return entry.replace("]]>", "]]]]><![CDATA[>");
      };
      exports2.Builder = function() {
        function Builder(opts) {
          var key, ref, value;
          this.options = {};
          ref = defaults["0.2"];
          for (key in ref) {
            if (!hasProp.call(ref, key)) continue;
            value = ref[key];
            this.options[key] = value;
          }
          for (key in opts) {
            if (!hasProp.call(opts, key)) continue;
            value = opts[key];
            this.options[key] = value;
          }
        }
        Builder.prototype.buildObject = function(rootObj) {
          var attrkey, charkey, render, rootElement, rootName;
          attrkey = this.options.attrkey;
          charkey = this.options.charkey;
          if (Object.keys(rootObj).length === 1 && this.options.rootName === defaults["0.2"].rootName) {
            rootName = Object.keys(rootObj)[0];
            rootObj = rootObj[rootName];
          } else {
            rootName = this.options.rootName;
          }
          render = /* @__PURE__ */ function(_this) {
            return function(element, obj) {
              var attr, child, entry, index, key, value;
              if (typeof obj !== "object") {
                if (_this.options.cdata && requiresCDATA(obj)) {
                  element.raw(wrapCDATA(obj));
                } else {
                  element.txt(obj);
                }
              } else if (Array.isArray(obj)) {
                for (index in obj) {
                  if (!hasProp.call(obj, index)) continue;
                  child = obj[index];
                  for (key in child) {
                    entry = child[key];
                    element = render(element.ele(key), entry).up();
                  }
                }
              } else {
                for (key in obj) {
                  if (!hasProp.call(obj, key)) continue;
                  child = obj[key];
                  if (key === attrkey) {
                    if (typeof child === "object") {
                      for (attr in child) {
                        value = child[attr];
                        element = element.att(attr, value);
                      }
                    }
                  } else if (key === charkey) {
                    if (_this.options.cdata && requiresCDATA(child)) {
                      element = element.raw(wrapCDATA(child));
                    } else {
                      element = element.txt(child);
                    }
                  } else if (Array.isArray(child)) {
                    for (index in child) {
                      if (!hasProp.call(child, index)) continue;
                      entry = child[index];
                      if (typeof entry === "string") {
                        if (_this.options.cdata && requiresCDATA(entry)) {
                          element = element.ele(key).raw(wrapCDATA(entry)).up();
                        } else {
                          element = element.ele(key, entry).up();
                        }
                      } else {
                        element = render(element.ele(key), entry).up();
                      }
                    }
                  } else if (typeof child === "object") {
                    element = render(element.ele(key), child).up();
                  } else {
                    if (typeof child === "string" && _this.options.cdata && requiresCDATA(child)) {
                      element = element.ele(key).raw(wrapCDATA(child)).up();
                    } else {
                      if (child == null) {
                        child = "";
                      }
                      element = element.ele(key, child.toString()).up();
                    }
                  }
                }
              }
              return element;
            };
          }(this);
          rootElement = builder.create(rootName, this.options.xmldec, this.options.doctype, {
            headless: this.options.headless,
            allowSurrogateChars: this.options.allowSurrogateChars
          });
          return render(rootElement, rootObj).end(this.options.renderOpts);
        };
        return Builder;
      }();
    }).call(exports2);
  }
});

// node_modules/sax/lib/sax.js
var require_sax = __commonJS({
  "node_modules/sax/lib/sax.js"(exports2) {
    (function(sax) {
      sax.parser = function(strict, opt) {
        return new SAXParser(strict, opt);
      };
      sax.SAXParser = SAXParser;
      sax.SAXStream = SAXStream;
      sax.createStream = createStream;
      sax.MAX_BUFFER_LENGTH = 64 * 1024;
      var buffers = [
        "comment",
        "sgmlDecl",
        "textNode",
        "tagName",
        "doctype",
        "procInstName",
        "procInstBody",
        "entity",
        "attribName",
        "attribValue",
        "cdata",
        "script"
      ];
      sax.EVENTS = [
        "text",
        "processinginstruction",
        "sgmldeclaration",
        "doctype",
        "comment",
        "opentagstart",
        "attribute",
        "opentag",
        "closetag",
        "opencdata",
        "cdata",
        "closecdata",
        "error",
        "end",
        "ready",
        "script",
        "opennamespace",
        "closenamespace"
      ];
      function SAXParser(strict, opt) {
        if (!(this instanceof SAXParser)) {
          return new SAXParser(strict, opt);
        }
        var parser = this;
        clearBuffers(parser);
        parser.q = parser.c = "";
        parser.bufferCheckPosition = sax.MAX_BUFFER_LENGTH;
        parser.encoding = null;
        parser.opt = opt || {};
        parser.opt.lowercase = parser.opt.lowercase || parser.opt.lowercasetags;
        parser.looseCase = parser.opt.lowercase ? "toLowerCase" : "toUpperCase";
        parser.opt.maxEntityCount = parser.opt.maxEntityCount || 512;
        parser.opt.maxEntityDepth = parser.opt.maxEntityDepth || 4;
        parser.entityCount = parser.entityDepth = 0;
        parser.tags = [];
        parser.closed = parser.closedRoot = parser.sawRoot = false;
        parser.tag = parser.error = null;
        parser.strict = !!strict;
        parser.noscript = !!(strict || parser.opt.noscript);
        parser.state = S.BEGIN;
        parser.strictEntities = parser.opt.strictEntities;
        parser.ENTITIES = parser.strictEntities ? Object.create(sax.XML_ENTITIES) : Object.create(sax.ENTITIES);
        parser.attribList = [];
        if (parser.opt.xmlns) {
          parser.ns = Object.create(rootNS);
        }
        if (parser.opt.unquotedAttributeValues === void 0) {
          parser.opt.unquotedAttributeValues = !strict;
        }
        parser.trackPosition = parser.opt.position !== false;
        if (parser.trackPosition) {
          parser.position = parser.line = parser.column = 0;
        }
        emit(parser, "onready");
      }
      if (!Object.create) {
        Object.create = function(o) {
          function F() {
          }
          F.prototype = o;
          var newf = new F();
          return newf;
        };
      }
      if (!Object.keys) {
        Object.keys = function(o) {
          var a = [];
          for (var i in o) if (o.hasOwnProperty(i)) a.push(i);
          return a;
        };
      }
      function checkBufferLength(parser) {
        var maxAllowed = Math.max(sax.MAX_BUFFER_LENGTH, 10);
        var maxActual = 0;
        for (var i = 0, l = buffers.length; i < l; i++) {
          var len = parser[buffers[i]].length;
          if (len > maxAllowed) {
            switch (buffers[i]) {
              case "textNode":
                closeText(parser);
                break;
              case "cdata":
                emitNode(parser, "oncdata", parser.cdata);
                parser.cdata = "";
                break;
              case "script":
                emitNode(parser, "onscript", parser.script);
                parser.script = "";
                break;
              default:
                error(parser, "Max buffer length exceeded: " + buffers[i]);
            }
          }
          maxActual = Math.max(maxActual, len);
        }
        var m = sax.MAX_BUFFER_LENGTH - maxActual;
        parser.bufferCheckPosition = m + parser.position;
      }
      function clearBuffers(parser) {
        for (var i = 0, l = buffers.length; i < l; i++) {
          parser[buffers[i]] = "";
        }
      }
      function flushBuffers(parser) {
        closeText(parser);
        if (parser.cdata !== "") {
          emitNode(parser, "oncdata", parser.cdata);
          parser.cdata = "";
        }
        if (parser.script !== "") {
          emitNode(parser, "onscript", parser.script);
          parser.script = "";
        }
      }
      SAXParser.prototype = {
        end: function() {
          end(this);
        },
        write,
        resume: function() {
          this.error = null;
          return this;
        },
        close: function() {
          return this.write(null);
        },
        flush: function() {
          flushBuffers(this);
        }
      };
      var Stream;
      try {
        Stream = require("stream").Stream;
      } catch (ex) {
        Stream = function() {
        };
      }
      if (!Stream) Stream = function() {
      };
      var streamWraps = sax.EVENTS.filter(function(ev) {
        return ev !== "error" && ev !== "end";
      });
      function createStream(strict, opt) {
        return new SAXStream(strict, opt);
      }
      function determineBufferEncoding(data, isEnd) {
        if (data.length >= 2) {
          if (data[0] === 255 && data[1] === 254) {
            return "utf-16le";
          }
          if (data[0] === 254 && data[1] === 255) {
            return "utf-16be";
          }
        }
        if (data.length >= 3 && data[0] === 239 && data[1] === 187 && data[2] === 191) {
          return "utf8";
        }
        if (data.length >= 4) {
          if (data[0] === 60 && data[1] === 0 && data[2] === 63 && data[3] === 0) {
            return "utf-16le";
          }
          if (data[0] === 0 && data[1] === 60 && data[2] === 0 && data[3] === 63) {
            return "utf-16be";
          }
          return "utf8";
        }
        return isEnd ? "utf8" : null;
      }
      function SAXStream(strict, opt) {
        if (!(this instanceof SAXStream)) {
          return new SAXStream(strict, opt);
        }
        Stream.apply(this);
        this._parser = new SAXParser(strict, opt);
        this.writable = true;
        this.readable = true;
        var me = this;
        this._parser.onend = function() {
          me.emit("end");
        };
        this._parser.onerror = function(er) {
          me.emit("error", er);
          me._parser.error = null;
        };
        this._decoder = null;
        this._decoderBuffer = null;
        streamWraps.forEach(function(ev) {
          Object.defineProperty(me, "on" + ev, {
            get: function() {
              return me._parser["on" + ev];
            },
            set: function(h) {
              if (!h) {
                me.removeAllListeners(ev);
                me._parser["on" + ev] = h;
                return h;
              }
              me.on(ev, h);
            },
            enumerable: true,
            configurable: false
          });
        });
      }
      SAXStream.prototype = Object.create(Stream.prototype, {
        constructor: {
          value: SAXStream
        }
      });
      SAXStream.prototype._decodeBuffer = function(data, isEnd) {
        if (this._decoderBuffer) {
          data = Buffer.concat([this._decoderBuffer, data]);
          this._decoderBuffer = null;
        }
        if (!this._decoder) {
          var encoding = determineBufferEncoding(data, isEnd);
          if (!encoding) {
            this._decoderBuffer = data;
            return "";
          }
          this._parser.encoding = encoding;
          this._decoder = new TextDecoder(encoding);
        }
        return this._decoder.decode(data, { stream: !isEnd });
      };
      SAXStream.prototype.write = function(data) {
        if (typeof Buffer === "function" && typeof Buffer.isBuffer === "function" && Buffer.isBuffer(data)) {
          data = this._decodeBuffer(data, false);
        } else if (this._decoderBuffer) {
          var remaining = this._decodeBuffer(Buffer.alloc(0), true);
          if (remaining) {
            this._parser.write(remaining);
            this.emit("data", remaining);
          }
        }
        this._parser.write(data.toString());
        this.emit("data", data);
        return true;
      };
      SAXStream.prototype.end = function(chunk) {
        if (chunk && chunk.length) {
          this.write(chunk);
        }
        if (this._decoderBuffer) {
          var finalChunk = this._decodeBuffer(Buffer.alloc(0), true);
          if (finalChunk) {
            this._parser.write(finalChunk);
            this.emit("data", finalChunk);
          }
        } else if (this._decoder) {
          var remaining = this._decoder.decode();
          if (remaining) {
            this._parser.write(remaining);
            this.emit("data", remaining);
          }
        }
        this._parser.end();
        return true;
      };
      SAXStream.prototype.on = function(ev, handler) {
        var me = this;
        if (!me._parser["on" + ev] && streamWraps.indexOf(ev) !== -1) {
          me._parser["on" + ev] = function() {
            var args = arguments.length === 1 ? [arguments[0]] : Array.apply(null, arguments);
            args.splice(0, 0, ev);
            me.emit.apply(me, args);
          };
        }
        return Stream.prototype.on.call(me, ev, handler);
      };
      var CDATAre = /^\[CDATA\[$/i;
      var DOCTYPEre = /^DOCTYPE$/i;
      var XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
      var XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
      var rootNS = { xml: XML_NAMESPACE, xmlns: XMLNS_NAMESPACE };
      var nameStart = /[:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/;
      var nameBody = /[:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u00B7\u0300-\u036F\u203F-\u2040.\d-]/;
      var entityStart = /[#:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/;
      var entityBody = /[#:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u00B7\u0300-\u036F\u203F-\u2040.\d-]/;
      function isWhitespace(c) {
        return c === " " || c === "\n" || c === "\r" || c === "	";
      }
      function isQuote(c) {
        return c === '"' || c === "'";
      }
      function isAttribEnd(c) {
        return c === ">" || isWhitespace(c);
      }
      function isMatch(regex, c) {
        return regex.test(c);
      }
      function notMatch(regex, c) {
        return !isMatch(regex, c);
      }
      var S = 0;
      sax.STATE = {
        BEGIN: S++,
        // leading byte order mark or whitespace
        BEGIN_WHITESPACE: S++,
        // leading whitespace
        TEXT: S++,
        // general stuff
        TEXT_ENTITY: S++,
        // &amp and such.
        OPEN_WAKA: S++,
        // <
        SGML_DECL: S++,
        // <!BLARG
        SGML_DECL_QUOTED: S++,
        // <!BLARG foo "bar
        DOCTYPE: S++,
        // <!DOCTYPE
        DOCTYPE_QUOTED: S++,
        // <!DOCTYPE "//blah
        DOCTYPE_DTD: S++,
        // <!DOCTYPE "//blah" [ ...
        DOCTYPE_DTD_QUOTED: S++,
        // <!DOCTYPE "//blah" [ "foo
        COMMENT_STARTING: S++,
        // <!-
        COMMENT: S++,
        // <!--
        COMMENT_ENDING: S++,
        // <!-- blah -
        COMMENT_ENDED: S++,
        // <!-- blah --
        CDATA: S++,
        // <![CDATA[ something
        CDATA_ENDING: S++,
        // ]
        CDATA_ENDING_2: S++,
        // ]]
        PROC_INST: S++,
        // <?hi
        PROC_INST_BODY: S++,
        // <?hi there
        PROC_INST_ENDING: S++,
        // <?hi "there" ?
        OPEN_TAG: S++,
        // <strong
        OPEN_TAG_SLASH: S++,
        // <strong /
        ATTRIB: S++,
        // <a
        ATTRIB_NAME: S++,
        // <a foo
        ATTRIB_NAME_SAW_WHITE: S++,
        // <a foo _
        ATTRIB_VALUE: S++,
        // <a foo=
        ATTRIB_VALUE_QUOTED: S++,
        // <a foo="bar
        ATTRIB_VALUE_CLOSED: S++,
        // <a foo="bar"
        ATTRIB_VALUE_UNQUOTED: S++,
        // <a foo=bar
        ATTRIB_VALUE_ENTITY_Q: S++,
        // <foo bar="&quot;"
        ATTRIB_VALUE_ENTITY_U: S++,
        // <foo bar=&quot
        CLOSE_TAG: S++,
        // </a
        CLOSE_TAG_SAW_WHITE: S++,
        // </a   >
        SCRIPT: S++,
        // <script> ...
        SCRIPT_ENDING: S++
        // <script> ... <
      };
      sax.XML_ENTITIES = Object.assign(/* @__PURE__ */ Object.create(null), {
        amp: "&",
        gt: ">",
        lt: "<",
        quot: '"',
        apos: "'"
      });
      sax.ENTITIES = Object.assign(/* @__PURE__ */ Object.create(null), {
        amp: "&",
        gt: ">",
        lt: "<",
        quot: '"',
        apos: "'",
        AElig: 198,
        Aacute: 193,
        Acirc: 194,
        Agrave: 192,
        Aring: 197,
        Atilde: 195,
        Auml: 196,
        Ccedil: 199,
        ETH: 208,
        Eacute: 201,
        Ecirc: 202,
        Egrave: 200,
        Euml: 203,
        Iacute: 205,
        Icirc: 206,
        Igrave: 204,
        Iuml: 207,
        Ntilde: 209,
        Oacute: 211,
        Ocirc: 212,
        Ograve: 210,
        Oslash: 216,
        Otilde: 213,
        Ouml: 214,
        THORN: 222,
        Uacute: 218,
        Ucirc: 219,
        Ugrave: 217,
        Uuml: 220,
        Yacute: 221,
        aacute: 225,
        acirc: 226,
        aelig: 230,
        agrave: 224,
        aring: 229,
        atilde: 227,
        auml: 228,
        ccedil: 231,
        eacute: 233,
        ecirc: 234,
        egrave: 232,
        eth: 240,
        euml: 235,
        iacute: 237,
        icirc: 238,
        igrave: 236,
        iuml: 239,
        ntilde: 241,
        oacute: 243,
        ocirc: 244,
        ograve: 242,
        oslash: 248,
        otilde: 245,
        ouml: 246,
        szlig: 223,
        thorn: 254,
        uacute: 250,
        ucirc: 251,
        ugrave: 249,
        uuml: 252,
        yacute: 253,
        yuml: 255,
        copy: 169,
        reg: 174,
        nbsp: 160,
        iexcl: 161,
        cent: 162,
        pound: 163,
        curren: 164,
        yen: 165,
        brvbar: 166,
        sect: 167,
        uml: 168,
        ordf: 170,
        laquo: 171,
        not: 172,
        shy: 173,
        macr: 175,
        deg: 176,
        plusmn: 177,
        sup1: 185,
        sup2: 178,
        sup3: 179,
        acute: 180,
        micro: 181,
        para: 182,
        middot: 183,
        cedil: 184,
        ordm: 186,
        raquo: 187,
        frac14: 188,
        frac12: 189,
        frac34: 190,
        iquest: 191,
        times: 215,
        divide: 247,
        OElig: 338,
        oelig: 339,
        Scaron: 352,
        scaron: 353,
        Yuml: 376,
        fnof: 402,
        circ: 710,
        tilde: 732,
        Alpha: 913,
        Beta: 914,
        Gamma: 915,
        Delta: 916,
        Epsilon: 917,
        Zeta: 918,
        Eta: 919,
        Theta: 920,
        Iota: 921,
        Kappa: 922,
        Lambda: 923,
        Mu: 924,
        Nu: 925,
        Xi: 926,
        Omicron: 927,
        Pi: 928,
        Rho: 929,
        Sigma: 931,
        Tau: 932,
        Upsilon: 933,
        Phi: 934,
        Chi: 935,
        Psi: 936,
        Omega: 937,
        alpha: 945,
        beta: 946,
        gamma: 947,
        delta: 948,
        epsilon: 949,
        zeta: 950,
        eta: 951,
        theta: 952,
        iota: 953,
        kappa: 954,
        lambda: 955,
        mu: 956,
        nu: 957,
        xi: 958,
        omicron: 959,
        pi: 960,
        rho: 961,
        sigmaf: 962,
        sigma: 963,
        tau: 964,
        upsilon: 965,
        phi: 966,
        chi: 967,
        psi: 968,
        omega: 969,
        thetasym: 977,
        upsih: 978,
        piv: 982,
        ensp: 8194,
        emsp: 8195,
        thinsp: 8201,
        zwnj: 8204,
        zwj: 8205,
        lrm: 8206,
        rlm: 8207,
        ndash: 8211,
        mdash: 8212,
        lsquo: 8216,
        rsquo: 8217,
        sbquo: 8218,
        ldquo: 8220,
        rdquo: 8221,
        bdquo: 8222,
        dagger: 8224,
        Dagger: 8225,
        bull: 8226,
        hellip: 8230,
        permil: 8240,
        prime: 8242,
        Prime: 8243,
        lsaquo: 8249,
        rsaquo: 8250,
        oline: 8254,
        frasl: 8260,
        euro: 8364,
        image: 8465,
        weierp: 8472,
        real: 8476,
        trade: 8482,
        alefsym: 8501,
        larr: 8592,
        uarr: 8593,
        rarr: 8594,
        darr: 8595,
        harr: 8596,
        crarr: 8629,
        lArr: 8656,
        uArr: 8657,
        rArr: 8658,
        dArr: 8659,
        hArr: 8660,
        forall: 8704,
        part: 8706,
        exist: 8707,
        empty: 8709,
        nabla: 8711,
        isin: 8712,
        notin: 8713,
        ni: 8715,
        prod: 8719,
        sum: 8721,
        minus: 8722,
        lowast: 8727,
        radic: 8730,
        prop: 8733,
        infin: 8734,
        ang: 8736,
        and: 8743,
        or: 8744,
        cap: 8745,
        cup: 8746,
        int: 8747,
        there4: 8756,
        sim: 8764,
        cong: 8773,
        asymp: 8776,
        ne: 8800,
        equiv: 8801,
        le: 8804,
        ge: 8805,
        sub: 8834,
        sup: 8835,
        nsub: 8836,
        sube: 8838,
        supe: 8839,
        oplus: 8853,
        otimes: 8855,
        perp: 8869,
        sdot: 8901,
        lceil: 8968,
        rceil: 8969,
        lfloor: 8970,
        rfloor: 8971,
        lang: 9001,
        rang: 9002,
        loz: 9674,
        spades: 9824,
        clubs: 9827,
        hearts: 9829,
        diams: 9830
      });
      Object.keys(sax.ENTITIES).forEach(function(key) {
        var e = sax.ENTITIES[key];
        var s2 = typeof e === "number" ? String.fromCharCode(e) : e;
        sax.ENTITIES[key] = s2;
      });
      for (var s in sax.STATE) {
        sax.STATE[sax.STATE[s]] = s;
      }
      S = sax.STATE;
      function emit(parser, event, data) {
        parser[event] && parser[event](data);
      }
      function getDeclaredEncoding(body) {
        var match = body && body.match(/(?:^|\s)encoding\s*=\s*(['"])([^'"]+)\1/i);
        return match ? match[2] : null;
      }
      function normalizeEncodingName(encoding) {
        if (!encoding) {
          return null;
        }
        return encoding.toLowerCase().replace(/[^a-z0-9]/g, "");
      }
      function encodingsMatch(detectedEncoding, declaredEncoding) {
        const detected = normalizeEncodingName(detectedEncoding);
        const declared = normalizeEncodingName(declaredEncoding);
        if (!detected || !declared) {
          return true;
        }
        if (declared === "utf16") {
          return detected === "utf16le" || detected === "utf16be";
        }
        return detected === declared;
      }
      function validateXmlDeclarationEncoding(parser, data) {
        if (!parser.strict || !parser.encoding || !data || data.name !== "xml") {
          return;
        }
        var declaredEncoding = getDeclaredEncoding(data.body);
        if (declaredEncoding && !encodingsMatch(parser.encoding, declaredEncoding)) {
          strictFail(
            parser,
            "XML declaration encoding " + declaredEncoding + " does not match detected stream encoding " + parser.encoding.toUpperCase()
          );
        }
      }
      function emitNode(parser, nodeType, data) {
        if (parser.textNode) closeText(parser);
        emit(parser, nodeType, data);
      }
      function closeText(parser) {
        parser.textNode = textopts(parser.opt, parser.textNode);
        if (parser.textNode) emit(parser, "ontext", parser.textNode);
        parser.textNode = "";
      }
      function textopts(opt, text) {
        if (opt.trim) text = text.trim();
        if (opt.normalize) text = text.replace(/\s+/g, " ");
        return text;
      }
      function error(parser, er) {
        closeText(parser);
        if (parser.trackPosition) {
          er += "\nLine: " + parser.line + "\nColumn: " + parser.column + "\nChar: " + parser.c;
        }
        er = new Error(er);
        parser.error = er;
        emit(parser, "onerror", er);
        return parser;
      }
      function end(parser) {
        if (parser.sawRoot && !parser.closedRoot)
          strictFail(parser, "Unclosed root tag");
        if (parser.state !== S.BEGIN && parser.state !== S.BEGIN_WHITESPACE && parser.state !== S.TEXT) {
          error(parser, "Unexpected end");
        }
        closeText(parser);
        parser.c = "";
        parser.closed = true;
        emit(parser, "onend");
        SAXParser.call(parser, parser.strict, parser.opt);
        return parser;
      }
      function strictFail(parser, message) {
        if (typeof parser !== "object" || !(parser instanceof SAXParser)) {
          throw new Error("bad call to strictFail");
        }
        if (parser.strict) {
          error(parser, message);
        }
      }
      function newTag(parser) {
        if (!parser.strict) parser.tagName = parser.tagName[parser.looseCase]();
        var parent = parser.tags[parser.tags.length - 1] || parser;
        var tag = parser.tag = { name: parser.tagName, attributes: {} };
        if (parser.opt.xmlns) {
          tag.ns = parent.ns;
        }
        parser.attribList.length = 0;
        emitNode(parser, "onopentagstart", tag);
      }
      function qname(name, attribute) {
        var i = name.indexOf(":");
        var qualName = i < 0 ? ["", name] : name.split(":");
        var prefix = qualName[0];
        var local = qualName[1];
        if (attribute && name === "xmlns") {
          prefix = "xmlns";
          local = "";
        }
        return { prefix, local };
      }
      function attrib(parser) {
        if (!parser.strict) {
          parser.attribName = parser.attribName[parser.looseCase]();
        }
        if (parser.attribList.indexOf(parser.attribName) !== -1 || parser.tag.attributes.hasOwnProperty(parser.attribName)) {
          parser.attribName = parser.attribValue = "";
          return;
        }
        if (parser.opt.xmlns) {
          var qn = qname(parser.attribName, true);
          var prefix = qn.prefix;
          var local = qn.local;
          if (prefix === "xmlns") {
            if (local === "xml" && parser.attribValue !== XML_NAMESPACE) {
              strictFail(
                parser,
                "xml: prefix must be bound to " + XML_NAMESPACE + "\nActual: " + parser.attribValue
              );
            } else if (local === "xmlns" && parser.attribValue !== XMLNS_NAMESPACE) {
              strictFail(
                parser,
                "xmlns: prefix must be bound to " + XMLNS_NAMESPACE + "\nActual: " + parser.attribValue
              );
            } else {
              var tag = parser.tag;
              var parent = parser.tags[parser.tags.length - 1] || parser;
              if (tag.ns === parent.ns) {
                tag.ns = Object.create(parent.ns);
              }
              tag.ns[local] = parser.attribValue;
            }
          }
          parser.attribList.push([parser.attribName, parser.attribValue]);
        } else {
          parser.tag.attributes[parser.attribName] = parser.attribValue;
          emitNode(parser, "onattribute", {
            name: parser.attribName,
            value: parser.attribValue
          });
        }
        parser.attribName = parser.attribValue = "";
      }
      function openTag(parser, selfClosing) {
        if (parser.opt.xmlns) {
          var tag = parser.tag;
          var qn = qname(parser.tagName);
          tag.prefix = qn.prefix;
          tag.local = qn.local;
          tag.uri = tag.ns[qn.prefix] || "";
          if (tag.prefix && !tag.uri) {
            strictFail(
              parser,
              "Unbound namespace prefix: " + JSON.stringify(parser.tagName)
            );
            tag.uri = qn.prefix;
          }
          var parent = parser.tags[parser.tags.length - 1] || parser;
          if (tag.ns && parent.ns !== tag.ns) {
            Object.keys(tag.ns).forEach(function(p) {
              emitNode(parser, "onopennamespace", {
                prefix: p,
                uri: tag.ns[p]
              });
            });
          }
          for (var i = 0, l = parser.attribList.length; i < l; i++) {
            var nv = parser.attribList[i];
            var name = nv[0];
            var value = nv[1];
            var qualName = qname(name, true);
            var prefix = qualName.prefix;
            var local = qualName.local;
            var uri = prefix === "" ? "" : tag.ns[prefix] || "";
            var a = {
              name,
              value,
              prefix,
              local,
              uri
            };
            if (prefix && prefix !== "xmlns" && !uri) {
              strictFail(
                parser,
                "Unbound namespace prefix: " + JSON.stringify(prefix)
              );
              a.uri = prefix;
            }
            parser.tag.attributes[name] = a;
            emitNode(parser, "onattribute", a);
          }
          parser.attribList.length = 0;
        }
        parser.tag.isSelfClosing = !!selfClosing;
        parser.sawRoot = true;
        parser.tags.push(parser.tag);
        emitNode(parser, "onopentag", parser.tag);
        if (!selfClosing) {
          if (!parser.noscript && parser.tagName.toLowerCase() === "script") {
            parser.state = S.SCRIPT;
          } else {
            parser.state = S.TEXT;
          }
          parser.tag = null;
          parser.tagName = "";
        }
        parser.attribName = parser.attribValue = "";
        parser.attribList.length = 0;
      }
      function closeTag(parser) {
        if (!parser.tagName) {
          strictFail(parser, "Weird empty close tag.");
          parser.textNode += "</>";
          parser.state = S.TEXT;
          return;
        }
        if (parser.script) {
          if (parser.tagName !== "script") {
            parser.script += "</" + parser.tagName + ">";
            parser.tagName = "";
            parser.state = S.SCRIPT;
            return;
          }
          emitNode(parser, "onscript", parser.script);
          parser.script = "";
        }
        var t = parser.tags.length;
        var tagName = parser.tagName;
        if (!parser.strict) {
          tagName = tagName[parser.looseCase]();
        }
        var closeTo = tagName;
        while (t--) {
          var close = parser.tags[t];
          if (close.name !== closeTo) {
            strictFail(parser, "Unexpected close tag");
          } else {
            break;
          }
        }
        if (t < 0) {
          strictFail(parser, "Unmatched closing tag: " + parser.tagName);
          parser.textNode += "</" + parser.tagName + ">";
          parser.state = S.TEXT;
          return;
        }
        parser.tagName = tagName;
        var s2 = parser.tags.length;
        while (s2-- > t) {
          var tag = parser.tag = parser.tags.pop();
          parser.tagName = parser.tag.name;
          emitNode(parser, "onclosetag", parser.tagName);
          var x = {};
          for (var i in tag.ns) {
            x[i] = tag.ns[i];
          }
          var parent = parser.tags[parser.tags.length - 1] || parser;
          if (parser.opt.xmlns && tag.ns !== parent.ns) {
            Object.keys(tag.ns).forEach(function(p) {
              var n = tag.ns[p];
              emitNode(parser, "onclosenamespace", { prefix: p, uri: n });
            });
          }
        }
        if (t === 0) parser.closedRoot = true;
        parser.tagName = parser.attribValue = parser.attribName = "";
        parser.attribList.length = 0;
        parser.state = S.TEXT;
      }
      function parseEntity(parser) {
        var entity = parser.entity;
        var entityLC = entity.toLowerCase();
        var num;
        var numStr = "";
        if (parser.ENTITIES[entity]) {
          return parser.ENTITIES[entity];
        }
        if (parser.ENTITIES[entityLC]) {
          return parser.ENTITIES[entityLC];
        }
        entity = entityLC;
        if (entity.charAt(0) === "#") {
          if (entity.charAt(1) === "x") {
            entity = entity.slice(2);
            num = parseInt(entity, 16);
            numStr = num.toString(16);
          } else {
            entity = entity.slice(1);
            num = parseInt(entity, 10);
            numStr = num.toString(10);
          }
        }
        entity = entity.replace(/^0+/, "");
        if (isNaN(num) || numStr.toLowerCase() !== entity || num < 0 || num > 1114111 || !isXmlChar(num)) {
          strictFail(parser, "Invalid character entity");
          return "&" + parser.entity + ";";
        }
        return String.fromCodePoint(num);
      }
      function isXmlChar(num) {
        return num === 9 || num === 10 || num === 13 || num >= 32 && num <= 55295 || num >= 57344 && num <= 65533 || num >= 65536 && num <= 1114111;
      }
      function beginWhiteSpace(parser, c) {
        if (c === "<") {
          parser.state = S.OPEN_WAKA;
          parser.startTagPosition = parser.position;
        } else if (!isWhitespace(c)) {
          strictFail(parser, "Non-whitespace before first tag.");
          parser.textNode = c;
          parser.state = S.TEXT;
        }
      }
      function charAt(chunk, i) {
        var result = "";
        if (i < chunk.length) {
          result = chunk.charAt(i);
        }
        return result;
      }
      function write(chunk) {
        var parser = this;
        if (this.error) {
          throw this.error;
        }
        if (parser.closed) {
          return error(
            parser,
            "Cannot write after close. Assign an onready handler."
          );
        }
        if (chunk === null) {
          return end(parser);
        }
        if (typeof chunk === "object") {
          chunk = chunk.toString();
        }
        var i = 0;
        var c = "";
        while (true) {
          c = charAt(chunk, i++);
          parser.c = c;
          if (!c) {
            break;
          }
          if (parser.trackPosition) {
            parser.position++;
            if (c === "\n") {
              parser.line++;
              parser.column = 0;
            } else {
              parser.column++;
            }
          }
          switch (parser.state) {
            case S.BEGIN:
              parser.state = S.BEGIN_WHITESPACE;
              if (c === "\uFEFF") {
                continue;
              }
              beginWhiteSpace(parser, c);
              continue;
            case S.BEGIN_WHITESPACE:
              beginWhiteSpace(parser, c);
              continue;
            case S.TEXT:
              if (parser.sawRoot && !parser.closedRoot) {
                var starti = i - 1;
                while (c && c !== "<" && c !== "&") {
                  c = charAt(chunk, i++);
                  if (c && parser.trackPosition) {
                    parser.position++;
                    if (c === "\n") {
                      parser.line++;
                      parser.column = 0;
                    } else {
                      parser.column++;
                    }
                  }
                }
                parser.textNode += chunk.substring(starti, i - 1);
              }
              if (c === "<" && !(parser.sawRoot && parser.closedRoot && !parser.strict)) {
                parser.state = S.OPEN_WAKA;
                parser.startTagPosition = parser.position;
              } else {
                if (!isWhitespace(c) && (!parser.sawRoot || parser.closedRoot)) {
                  strictFail(parser, "Text data outside of root node.");
                }
                if (c === "&") {
                  parser.state = S.TEXT_ENTITY;
                } else {
                  parser.textNode += c;
                }
              }
              continue;
            case S.SCRIPT:
              if (c === "<") {
                parser.state = S.SCRIPT_ENDING;
              } else {
                parser.script += c;
              }
              continue;
            case S.SCRIPT_ENDING:
              if (c === "/") {
                parser.state = S.CLOSE_TAG;
              } else {
                parser.script += "<" + c;
                parser.state = S.SCRIPT;
              }
              continue;
            case S.OPEN_WAKA:
              if (c === "!") {
                parser.state = S.SGML_DECL;
                parser.sgmlDecl = "";
              } else if (isWhitespace(c)) {
              } else if (isMatch(nameStart, c)) {
                parser.state = S.OPEN_TAG;
                parser.tagName = c;
              } else if (c === "/") {
                parser.state = S.CLOSE_TAG;
                parser.tagName = "";
              } else if (c === "?") {
                parser.state = S.PROC_INST;
                parser.procInstName = parser.procInstBody = "";
              } else {
                strictFail(parser, "Unencoded <");
                if (parser.startTagPosition + 1 < parser.position) {
                  var pad = parser.position - parser.startTagPosition;
                  c = new Array(pad).join(" ") + c;
                }
                parser.textNode += "<" + c;
                parser.state = S.TEXT;
              }
              continue;
            case S.SGML_DECL:
              if (parser.sgmlDecl + c === "--") {
                parser.state = S.COMMENT;
                parser.comment = "";
                parser.sgmlDecl = "";
                continue;
              }
              if (parser.doctype && parser.doctype !== true && parser.sgmlDecl) {
                parser.state = S.DOCTYPE_DTD;
                parser.doctype += "<!" + parser.sgmlDecl + c;
                parser.sgmlDecl = "";
              } else if (CDATAre.test(parser.sgmlDecl + c)) {
                emitNode(parser, "onopencdata");
                parser.state = S.CDATA;
                parser.sgmlDecl = "";
                parser.cdata = "";
              } else if (DOCTYPEre.test(parser.sgmlDecl + c)) {
                parser.state = S.DOCTYPE;
                if (parser.doctype || parser.sawRoot) {
                  strictFail(
                    parser,
                    "Inappropriately located doctype declaration"
                  );
                }
                parser.doctype = "";
                parser.sgmlDecl = "";
              } else if (c === ">") {
                emitNode(parser, "onsgmldeclaration", parser.sgmlDecl);
                parser.sgmlDecl = "";
                parser.state = S.TEXT;
              } else if (isQuote(c)) {
                parser.state = S.SGML_DECL_QUOTED;
                parser.sgmlDecl += c;
              } else {
                parser.sgmlDecl += c;
              }
              continue;
            case S.SGML_DECL_QUOTED:
              if (c === parser.q) {
                parser.state = S.SGML_DECL;
                parser.q = "";
              }
              parser.sgmlDecl += c;
              continue;
            case S.DOCTYPE:
              if (c === ">") {
                parser.state = S.TEXT;
                emitNode(parser, "ondoctype", parser.doctype);
                parser.doctype = true;
              } else {
                parser.doctype += c;
                if (c === "[") {
                  parser.state = S.DOCTYPE_DTD;
                } else if (isQuote(c)) {
                  parser.state = S.DOCTYPE_QUOTED;
                  parser.q = c;
                }
              }
              continue;
            case S.DOCTYPE_QUOTED:
              parser.doctype += c;
              if (c === parser.q) {
                parser.q = "";
                parser.state = S.DOCTYPE;
              }
              continue;
            case S.DOCTYPE_DTD:
              if (c === "]") {
                parser.doctype += c;
                parser.state = S.DOCTYPE;
              } else if (c === "<") {
                parser.state = S.OPEN_WAKA;
                parser.startTagPosition = parser.position;
              } else if (isQuote(c)) {
                parser.doctype += c;
                parser.state = S.DOCTYPE_DTD_QUOTED;
                parser.q = c;
              } else {
                parser.doctype += c;
              }
              continue;
            case S.DOCTYPE_DTD_QUOTED:
              parser.doctype += c;
              if (c === parser.q) {
                parser.state = S.DOCTYPE_DTD;
                parser.q = "";
              }
              continue;
            case S.COMMENT:
              if (c === "-") {
                parser.state = S.COMMENT_ENDING;
              } else {
                parser.comment += c;
              }
              continue;
            case S.COMMENT_ENDING:
              if (c === "-") {
                parser.state = S.COMMENT_ENDED;
                parser.comment = textopts(parser.opt, parser.comment);
                if (parser.comment) {
                  emitNode(parser, "oncomment", parser.comment);
                }
                parser.comment = "";
              } else {
                parser.comment += "-" + c;
                parser.state = S.COMMENT;
              }
              continue;
            case S.COMMENT_ENDED:
              if (c !== ">") {
                strictFail(parser, "Malformed comment");
                parser.comment += "--" + c;
                parser.state = S.COMMENT;
              } else if (parser.doctype && parser.doctype !== true) {
                parser.state = S.DOCTYPE_DTD;
              } else {
                parser.state = S.TEXT;
              }
              continue;
            case S.CDATA:
              var starti = i - 1;
              while (c && c !== "]") {
                c = charAt(chunk, i++);
                if (c && parser.trackPosition) {
                  parser.position++;
                  if (c === "\n") {
                    parser.line++;
                    parser.column = 0;
                  } else {
                    parser.column++;
                  }
                }
              }
              parser.cdata += chunk.substring(starti, i - 1);
              if (c === "]") {
                parser.state = S.CDATA_ENDING;
              }
              continue;
            case S.CDATA_ENDING:
              if (c === "]") {
                parser.state = S.CDATA_ENDING_2;
              } else {
                parser.cdata += "]" + c;
                parser.state = S.CDATA;
              }
              continue;
            case S.CDATA_ENDING_2:
              if (c === ">") {
                if (parser.cdata) {
                  emitNode(parser, "oncdata", parser.cdata);
                }
                emitNode(parser, "onclosecdata");
                parser.cdata = "";
                parser.state = S.TEXT;
              } else if (c === "]") {
                parser.cdata += "]";
              } else {
                parser.cdata += "]]" + c;
                parser.state = S.CDATA;
              }
              continue;
            case S.PROC_INST:
              if (c === "?") {
                parser.state = S.PROC_INST_ENDING;
              } else if (isWhitespace(c)) {
                parser.state = S.PROC_INST_BODY;
              } else {
                parser.procInstName += c;
              }
              continue;
            case S.PROC_INST_BODY:
              if (!parser.procInstBody && isWhitespace(c)) {
                continue;
              } else if (c === "?") {
                parser.state = S.PROC_INST_ENDING;
              } else {
                parser.procInstBody += c;
              }
              continue;
            case S.PROC_INST_ENDING:
              if (c === ">") {
                const procInstEndData = {
                  name: parser.procInstName,
                  body: parser.procInstBody
                };
                validateXmlDeclarationEncoding(parser, procInstEndData);
                emitNode(parser, "onprocessinginstruction", procInstEndData);
                parser.procInstName = parser.procInstBody = "";
                parser.state = S.TEXT;
              } else {
                parser.procInstBody += "?" + c;
                parser.state = S.PROC_INST_BODY;
              }
              continue;
            case S.OPEN_TAG:
              if (isMatch(nameBody, c)) {
                parser.tagName += c;
              } else {
                newTag(parser);
                if (c === ">") {
                  openTag(parser);
                } else if (c === "/") {
                  parser.state = S.OPEN_TAG_SLASH;
                } else {
                  if (!isWhitespace(c)) {
                    strictFail(parser, "Invalid character in tag name");
                  }
                  parser.state = S.ATTRIB;
                }
              }
              continue;
            case S.OPEN_TAG_SLASH:
              if (c === ">") {
                openTag(parser, true);
                closeTag(parser);
              } else {
                strictFail(
                  parser,
                  "Forward-slash in opening tag not followed by >"
                );
                parser.state = S.ATTRIB;
              }
              continue;
            case S.ATTRIB:
              if (isWhitespace(c)) {
                continue;
              } else if (c === ">") {
                openTag(parser);
              } else if (c === "/") {
                parser.state = S.OPEN_TAG_SLASH;
              } else if (isMatch(nameStart, c)) {
                parser.attribName = c;
                parser.attribValue = "";
                parser.state = S.ATTRIB_NAME;
              } else {
                strictFail(parser, "Invalid attribute name");
              }
              continue;
            case S.ATTRIB_NAME:
              if (c === "=") {
                parser.state = S.ATTRIB_VALUE;
              } else if (c === ">") {
                strictFail(parser, "Attribute without value");
                parser.attribValue = parser.attribName;
                attrib(parser);
                openTag(parser);
              } else if (isWhitespace(c)) {
                parser.state = S.ATTRIB_NAME_SAW_WHITE;
              } else if (isMatch(nameBody, c)) {
                parser.attribName += c;
              } else {
                strictFail(parser, "Invalid attribute name");
              }
              continue;
            case S.ATTRIB_NAME_SAW_WHITE:
              if (c === "=") {
                parser.state = S.ATTRIB_VALUE;
              } else if (isWhitespace(c)) {
                continue;
              } else {
                strictFail(parser, "Attribute without value");
                parser.tag.attributes[parser.attribName] = "";
                parser.attribValue = "";
                emitNode(parser, "onattribute", {
                  name: parser.attribName,
                  value: ""
                });
                parser.attribName = "";
                if (c === ">") {
                  openTag(parser);
                } else if (isMatch(nameStart, c)) {
                  parser.attribName = c;
                  parser.state = S.ATTRIB_NAME;
                } else {
                  strictFail(parser, "Invalid attribute name");
                  parser.state = S.ATTRIB;
                }
              }
              continue;
            case S.ATTRIB_VALUE:
              if (isWhitespace(c)) {
                continue;
              } else if (isQuote(c)) {
                parser.q = c;
                parser.state = S.ATTRIB_VALUE_QUOTED;
              } else {
                if (!parser.opt.unquotedAttributeValues) {
                  error(parser, "Unquoted attribute value");
                }
                parser.state = S.ATTRIB_VALUE_UNQUOTED;
                parser.attribValue = c;
              }
              continue;
            case S.ATTRIB_VALUE_QUOTED:
              if (c !== parser.q) {
                if (c === "&") {
                  parser.state = S.ATTRIB_VALUE_ENTITY_Q;
                } else {
                  parser.attribValue += c;
                }
                continue;
              }
              attrib(parser);
              parser.q = "";
              parser.state = S.ATTRIB_VALUE_CLOSED;
              continue;
            case S.ATTRIB_VALUE_CLOSED:
              if (isWhitespace(c)) {
                parser.state = S.ATTRIB;
              } else if (c === ">") {
                openTag(parser);
              } else if (c === "/") {
                parser.state = S.OPEN_TAG_SLASH;
              } else if (isMatch(nameStart, c)) {
                strictFail(parser, "No whitespace between attributes");
                parser.attribName = c;
                parser.attribValue = "";
                parser.state = S.ATTRIB_NAME;
              } else {
                strictFail(parser, "Invalid attribute name");
              }
              continue;
            case S.ATTRIB_VALUE_UNQUOTED:
              if (!isAttribEnd(c)) {
                if (c === "&") {
                  parser.state = S.ATTRIB_VALUE_ENTITY_U;
                } else {
                  parser.attribValue += c;
                }
                continue;
              }
              attrib(parser);
              if (c === ">") {
                openTag(parser);
              } else {
                parser.state = S.ATTRIB;
              }
              continue;
            case S.CLOSE_TAG:
              if (!parser.tagName) {
                if (isWhitespace(c)) {
                  continue;
                } else if (notMatch(nameStart, c)) {
                  if (parser.script) {
                    parser.script += "</" + c;
                    parser.state = S.SCRIPT;
                  } else {
                    strictFail(parser, "Invalid tagname in closing tag.");
                  }
                } else {
                  parser.tagName = c;
                }
              } else if (c === ">") {
                closeTag(parser);
              } else if (isMatch(nameBody, c)) {
                parser.tagName += c;
              } else if (parser.script) {
                parser.script += "</" + parser.tagName + c;
                parser.tagName = "";
                parser.state = S.SCRIPT;
              } else {
                if (!isWhitespace(c)) {
                  strictFail(parser, "Invalid tagname in closing tag");
                }
                parser.state = S.CLOSE_TAG_SAW_WHITE;
              }
              continue;
            case S.CLOSE_TAG_SAW_WHITE:
              if (isWhitespace(c)) {
                continue;
              }
              if (c === ">") {
                closeTag(parser);
              } else {
                strictFail(parser, "Invalid characters in closing tag");
              }
              continue;
            case S.TEXT_ENTITY:
            case S.ATTRIB_VALUE_ENTITY_Q:
            case S.ATTRIB_VALUE_ENTITY_U:
              var returnState;
              var buffer;
              switch (parser.state) {
                case S.TEXT_ENTITY:
                  returnState = S.TEXT;
                  buffer = "textNode";
                  break;
                case S.ATTRIB_VALUE_ENTITY_Q:
                  returnState = S.ATTRIB_VALUE_QUOTED;
                  buffer = "attribValue";
                  break;
                case S.ATTRIB_VALUE_ENTITY_U:
                  returnState = S.ATTRIB_VALUE_UNQUOTED;
                  buffer = "attribValue";
                  break;
              }
              if (c === ";") {
                var parsedEntity = parseEntity(parser);
                if (parser.opt.unparsedEntities && !Object.values(sax.XML_ENTITIES).includes(parsedEntity)) {
                  if ((parser.entityCount += 1) > parser.opt.maxEntityCount) {
                    error(
                      parser,
                      "Parsed entity count exceeds max entity count"
                    );
                  }
                  if ((parser.entityDepth += 1) > parser.opt.maxEntityDepth) {
                    error(
                      parser,
                      "Parsed entity depth exceeds max entity depth"
                    );
                  }
                  parser.entity = "";
                  parser.state = returnState;
                  parser.write(parsedEntity);
                  parser.entityDepth -= 1;
                } else {
                  parser[buffer] += parsedEntity;
                  parser.entity = "";
                  parser.state = returnState;
                }
              } else if (isMatch(parser.entity.length ? entityBody : entityStart, c)) {
                parser.entity += c;
              } else {
                strictFail(parser, "Invalid character in entity name");
                parser[buffer] += "&" + parser.entity + c;
                parser.entity = "";
                parser.state = returnState;
              }
              continue;
            default: {
              throw new Error(parser, "Unknown state: " + parser.state);
            }
          }
        }
        if (parser.position >= parser.bufferCheckPosition) {
          checkBufferLength(parser);
        }
        return parser;
      }
      if (!String.fromCodePoint) {
        ;
        (function() {
          var stringFromCharCode = String.fromCharCode;
          var floor = Math.floor;
          var fromCodePoint = function() {
            var MAX_SIZE = 16384;
            var codeUnits = [];
            var highSurrogate;
            var lowSurrogate;
            var index = -1;
            var length = arguments.length;
            if (!length) {
              return "";
            }
            var result = "";
            while (++index < length) {
              var codePoint = Number(arguments[index]);
              if (!isFinite(codePoint) || // `NaN`, `+Infinity`, or `-Infinity`
              codePoint < 0 || // not a valid Unicode code point
              codePoint > 1114111 || // not a valid Unicode code point
              floor(codePoint) !== codePoint) {
                throw RangeError("Invalid code point: " + codePoint);
              }
              if (codePoint <= 65535) {
                codeUnits.push(codePoint);
              } else {
                codePoint -= 65536;
                highSurrogate = (codePoint >> 10) + 55296;
                lowSurrogate = codePoint % 1024 + 56320;
                codeUnits.push(highSurrogate, lowSurrogate);
              }
              if (index + 1 === length || codeUnits.length > MAX_SIZE) {
                result += stringFromCharCode.apply(null, codeUnits);
                codeUnits.length = 0;
              }
            }
            return result;
          };
          if (Object.defineProperty) {
            Object.defineProperty(String, "fromCodePoint", {
              value: fromCodePoint,
              configurable: true,
              writable: true
            });
          } else {
            String.fromCodePoint = fromCodePoint;
          }
        })();
      }
    })(typeof exports2 === "undefined" ? exports2.sax = {} : exports2);
  }
});

// node_modules/xml2js/lib/bom.js
var require_bom = __commonJS({
  "node_modules/xml2js/lib/bom.js"(exports2) {
    (function() {
      "use strict";
      exports2.stripBOM = function(str) {
        if (str[0] === "\uFEFF") {
          return str.substring(1);
        } else {
          return str;
        }
      };
    }).call(exports2);
  }
});

// node_modules/xml2js/lib/processors.js
var require_processors = __commonJS({
  "node_modules/xml2js/lib/processors.js"(exports2) {
    (function() {
      "use strict";
      var prefixMatch;
      prefixMatch = new RegExp(/(?!xmlns)^.*:/);
      exports2.normalize = function(str) {
        return str.toLowerCase();
      };
      exports2.firstCharLowerCase = function(str) {
        return str.charAt(0).toLowerCase() + str.slice(1);
      };
      exports2.stripPrefix = function(str) {
        return str.replace(prefixMatch, "");
      };
      exports2.parseNumbers = function(str) {
        if (!isNaN(str)) {
          str = str % 1 === 0 ? parseInt(str, 10) : parseFloat(str);
        }
        return str;
      };
      exports2.parseBooleans = function(str) {
        if (/^(?:true|false)$/i.test(str)) {
          str = str.toLowerCase() === "true";
        }
        return str;
      };
    }).call(exports2);
  }
});

// node_modules/xml2js/lib/parser.js
var require_parser = __commonJS({
  "node_modules/xml2js/lib/parser.js"(exports2) {
    (function() {
      "use strict";
      var bom, defaults, events, isEmpty, processItem, processors, sax, setImmediate, bind = function(fn, me) {
        return function() {
          return fn.apply(me, arguments);
        };
      }, extend = function(child, parent) {
        for (var key in parent) {
          if (hasProp.call(parent, key)) child[key] = parent[key];
        }
        function ctor() {
          this.constructor = child;
        }
        ctor.prototype = parent.prototype;
        child.prototype = new ctor();
        child.__super__ = parent.prototype;
        return child;
      }, hasProp = {}.hasOwnProperty;
      sax = require_sax();
      events = require("events");
      bom = require_bom();
      processors = require_processors();
      setImmediate = require("timers").setImmediate;
      defaults = require_defaults().defaults;
      isEmpty = function(thing) {
        return typeof thing === "object" && thing != null && Object.keys(thing).length === 0;
      };
      processItem = function(processors2, item, key) {
        var i, len, process2;
        for (i = 0, len = processors2.length; i < len; i++) {
          process2 = processors2[i];
          item = process2(item, key);
        }
        return item;
      };
      exports2.Parser = function(superClass) {
        extend(Parser, superClass);
        function Parser(opts) {
          this.parseStringPromise = bind(this.parseStringPromise, this);
          this.parseString = bind(this.parseString, this);
          this.reset = bind(this.reset, this);
          this.assignOrPush = bind(this.assignOrPush, this);
          this.processAsync = bind(this.processAsync, this);
          var key, ref, value;
          if (!(this instanceof exports2.Parser)) {
            return new exports2.Parser(opts);
          }
          this.options = {};
          ref = defaults["0.2"];
          for (key in ref) {
            if (!hasProp.call(ref, key)) continue;
            value = ref[key];
            this.options[key] = value;
          }
          for (key in opts) {
            if (!hasProp.call(opts, key)) continue;
            value = opts[key];
            this.options[key] = value;
          }
          if (this.options.xmlns) {
            this.options.xmlnskey = this.options.attrkey + "ns";
          }
          if (this.options.normalizeTags) {
            if (!this.options.tagNameProcessors) {
              this.options.tagNameProcessors = [];
            }
            this.options.tagNameProcessors.unshift(processors.normalize);
          }
          this.reset();
        }
        Parser.prototype.processAsync = function() {
          var chunk, err;
          try {
            if (this.remaining.length <= this.options.chunkSize) {
              chunk = this.remaining;
              this.remaining = "";
              this.saxParser = this.saxParser.write(chunk);
              return this.saxParser.close();
            } else {
              chunk = this.remaining.substr(0, this.options.chunkSize);
              this.remaining = this.remaining.substr(this.options.chunkSize, this.remaining.length);
              this.saxParser = this.saxParser.write(chunk);
              return setImmediate(this.processAsync);
            }
          } catch (error1) {
            err = error1;
            if (!this.saxParser.errThrown) {
              this.saxParser.errThrown = true;
              return this.emit(err);
            }
          }
        };
        Parser.prototype.assignOrPush = function(obj, key, newValue) {
          if (!(key in obj)) {
            if (!this.options.explicitArray) {
              return obj[key] = newValue;
            } else {
              return obj[key] = [newValue];
            }
          } else {
            if (!(obj[key] instanceof Array)) {
              obj[key] = [obj[key]];
            }
            return obj[key].push(newValue);
          }
        };
        Parser.prototype.reset = function() {
          var attrkey, charkey, ontext, stack;
          this.removeAllListeners();
          this.saxParser = sax.parser(this.options.strict, {
            trim: false,
            normalize: false,
            xmlns: this.options.xmlns
          });
          this.saxParser.errThrown = false;
          this.saxParser.onerror = /* @__PURE__ */ function(_this) {
            return function(error) {
              _this.saxParser.resume();
              if (!_this.saxParser.errThrown) {
                _this.saxParser.errThrown = true;
                return _this.emit("error", error);
              }
            };
          }(this);
          this.saxParser.onend = /* @__PURE__ */ function(_this) {
            return function() {
              if (!_this.saxParser.ended) {
                _this.saxParser.ended = true;
                return _this.emit("end", _this.resultObject);
              }
            };
          }(this);
          this.saxParser.ended = false;
          this.EXPLICIT_CHARKEY = this.options.explicitCharkey;
          this.resultObject = null;
          stack = [];
          attrkey = this.options.attrkey;
          charkey = this.options.charkey;
          this.saxParser.onopentag = /* @__PURE__ */ function(_this) {
            return function(node) {
              var key, newValue, obj, processedKey, ref;
              obj = {};
              obj[charkey] = "";
              if (!_this.options.ignoreAttrs) {
                ref = node.attributes;
                for (key in ref) {
                  if (!hasProp.call(ref, key)) continue;
                  if (!(attrkey in obj) && !_this.options.mergeAttrs) {
                    obj[attrkey] = {};
                  }
                  newValue = _this.options.attrValueProcessors ? processItem(_this.options.attrValueProcessors, node.attributes[key], key) : node.attributes[key];
                  processedKey = _this.options.attrNameProcessors ? processItem(_this.options.attrNameProcessors, key) : key;
                  if (_this.options.mergeAttrs) {
                    _this.assignOrPush(obj, processedKey, newValue);
                  } else {
                    obj[attrkey][processedKey] = newValue;
                  }
                }
              }
              obj["#name"] = _this.options.tagNameProcessors ? processItem(_this.options.tagNameProcessors, node.name) : node.name;
              if (_this.options.xmlns) {
                obj[_this.options.xmlnskey] = {
                  uri: node.uri,
                  local: node.local
                };
              }
              return stack.push(obj);
            };
          }(this);
          this.saxParser.onclosetag = /* @__PURE__ */ function(_this) {
            return function() {
              var cdata, emptyStr, key, node, nodeName, obj, objClone, old, s, xpath;
              obj = stack.pop();
              nodeName = obj["#name"];
              if (!_this.options.explicitChildren || !_this.options.preserveChildrenOrder) {
                delete obj["#name"];
              }
              if (obj.cdata === true) {
                cdata = obj.cdata;
                delete obj.cdata;
              }
              s = stack[stack.length - 1];
              if (obj[charkey].match(/^\s*$/) && !cdata) {
                emptyStr = obj[charkey];
                delete obj[charkey];
              } else {
                if (_this.options.trim) {
                  obj[charkey] = obj[charkey].trim();
                }
                if (_this.options.normalize) {
                  obj[charkey] = obj[charkey].replace(/\s{2,}/g, " ").trim();
                }
                obj[charkey] = _this.options.valueProcessors ? processItem(_this.options.valueProcessors, obj[charkey], nodeName) : obj[charkey];
                if (Object.keys(obj).length === 1 && charkey in obj && !_this.EXPLICIT_CHARKEY) {
                  obj = obj[charkey];
                }
              }
              if (isEmpty(obj)) {
                obj = _this.options.emptyTag !== "" ? _this.options.emptyTag : emptyStr;
              }
              if (_this.options.validator != null) {
                xpath = "/" + function() {
                  var i, len, results;
                  results = [];
                  for (i = 0, len = stack.length; i < len; i++) {
                    node = stack[i];
                    results.push(node["#name"]);
                  }
                  return results;
                }().concat(nodeName).join("/");
                (function() {
                  var err;
                  try {
                    return obj = _this.options.validator(xpath, s && s[nodeName], obj);
                  } catch (error1) {
                    err = error1;
                    return _this.emit("error", err);
                  }
                })();
              }
              if (_this.options.explicitChildren && !_this.options.mergeAttrs && typeof obj === "object") {
                if (!_this.options.preserveChildrenOrder) {
                  node = {};
                  if (_this.options.attrkey in obj) {
                    node[_this.options.attrkey] = obj[_this.options.attrkey];
                    delete obj[_this.options.attrkey];
                  }
                  if (!_this.options.charsAsChildren && _this.options.charkey in obj) {
                    node[_this.options.charkey] = obj[_this.options.charkey];
                    delete obj[_this.options.charkey];
                  }
                  if (Object.getOwnPropertyNames(obj).length > 0) {
                    node[_this.options.childkey] = obj;
                  }
                  obj = node;
                } else if (s) {
                  s[_this.options.childkey] = s[_this.options.childkey] || [];
                  objClone = {};
                  for (key in obj) {
                    if (!hasProp.call(obj, key)) continue;
                    objClone[key] = obj[key];
                  }
                  s[_this.options.childkey].push(objClone);
                  delete obj["#name"];
                  if (Object.keys(obj).length === 1 && charkey in obj && !_this.EXPLICIT_CHARKEY) {
                    obj = obj[charkey];
                  }
                }
              }
              if (stack.length > 0) {
                return _this.assignOrPush(s, nodeName, obj);
              } else {
                if (_this.options.explicitRoot) {
                  old = obj;
                  obj = {};
                  obj[nodeName] = old;
                }
                _this.resultObject = obj;
                _this.saxParser.ended = true;
                return _this.emit("end", _this.resultObject);
              }
            };
          }(this);
          ontext = /* @__PURE__ */ function(_this) {
            return function(text) {
              var charChild, s;
              s = stack[stack.length - 1];
              if (s) {
                s[charkey] += text;
                if (_this.options.explicitChildren && _this.options.preserveChildrenOrder && _this.options.charsAsChildren && (_this.options.includeWhiteChars || text.replace(/\\n/g, "").trim() !== "")) {
                  s[_this.options.childkey] = s[_this.options.childkey] || [];
                  charChild = {
                    "#name": "__text__"
                  };
                  charChild[charkey] = text;
                  if (_this.options.normalize) {
                    charChild[charkey] = charChild[charkey].replace(/\s{2,}/g, " ").trim();
                  }
                  s[_this.options.childkey].push(charChild);
                }
                return s;
              }
            };
          }(this);
          this.saxParser.ontext = ontext;
          return this.saxParser.oncdata = /* @__PURE__ */ function(_this) {
            return function(text) {
              var s;
              s = ontext(text);
              if (s) {
                return s.cdata = true;
              }
            };
          }(this);
        };
        Parser.prototype.parseString = function(str, cb) {
          var err;
          if (cb != null && typeof cb === "function") {
            this.on("end", function(result) {
              this.reset();
              return cb(null, result);
            });
            this.on("error", function(err2) {
              this.reset();
              return cb(err2);
            });
          }
          try {
            str = str.toString();
            if (str.trim() === "") {
              this.emit("end", null);
              return true;
            }
            str = bom.stripBOM(str);
            if (this.options.async) {
              this.remaining = str;
              setImmediate(this.processAsync);
              return this.saxParser;
            }
            return this.saxParser.write(str).close();
          } catch (error1) {
            err = error1;
            if (!(this.saxParser.errThrown || this.saxParser.ended)) {
              this.emit("error", err);
              return this.saxParser.errThrown = true;
            } else if (this.saxParser.ended) {
              throw err;
            }
          }
        };
        Parser.prototype.parseStringPromise = function(str) {
          return new Promise(/* @__PURE__ */ function(_this) {
            return function(resolve, reject) {
              return _this.parseString(str, function(err, value) {
                if (err) {
                  return reject(err);
                } else {
                  return resolve(value);
                }
              });
            };
          }(this));
        };
        return Parser;
      }(events);
      exports2.parseString = function(str, a, b) {
        var cb, options, parser;
        if (b != null) {
          if (typeof b === "function") {
            cb = b;
          }
          if (typeof a === "object") {
            options = a;
          }
        } else {
          if (typeof a === "function") {
            cb = a;
          }
          options = {};
        }
        parser = new exports2.Parser(options);
        return parser.parseString(str, cb);
      };
      exports2.parseStringPromise = function(str, a) {
        var options, parser;
        if (typeof a === "object") {
          options = a;
        }
        parser = new exports2.Parser(options);
        return parser.parseStringPromise(str);
      };
    }).call(exports2);
  }
});

// node_modules/xml2js/lib/xml2js.js
var require_xml2js = __commonJS({
  "node_modules/xml2js/lib/xml2js.js"(exports2) {
    (function() {
      "use strict";
      var builder, defaults, parser, processors, extend = function(child, parent) {
        for (var key in parent) {
          if (hasProp.call(parent, key)) child[key] = parent[key];
        }
        function ctor() {
          this.constructor = child;
        }
        ctor.prototype = parent.prototype;
        child.prototype = new ctor();
        child.__super__ = parent.prototype;
        return child;
      }, hasProp = {}.hasOwnProperty;
      defaults = require_defaults();
      builder = require_builder();
      parser = require_parser();
      processors = require_processors();
      exports2.defaults = defaults.defaults;
      exports2.processors = processors;
      exports2.ValidationError = function(superClass) {
        extend(ValidationError, superClass);
        function ValidationError(message) {
          this.message = message;
        }
        return ValidationError;
      }(Error);
      exports2.Builder = builder.Builder;
      exports2.Parser = parser.Parser;
      exports2.parseString = parser.parseString;
      exports2.parseStringPromise = parser.parseStringPromise;
    }).call(exports2);
  }
});

// node_modules/dbus-next/lib/client/proxy-interface.js
var require_proxy_interface = __commonJS({
  "node_modules/dbus-next/lib/client/proxy-interface.js"(exports2, module2) {
    var EventEmitter = require("events");
    var {
      isInterfaceNameValid,
      isMemberNameValid
    } = require_validators();
    var ProxyListener = class {
      constructor(signal, iface) {
        this.refcount = 0;
        this.fn = (msg) => {
          const { body, signature, sender } = msg;
          if (iface.$object.bus._nameOwners[iface.$object.name] !== sender) {
            return;
          }
          if (signature !== signal.signature) {
            console.error(`warning: got signature ${signature} for signal ${msg.interface}.${signal.name} (expected ${signal.signature})`);
            return;
          }
          iface.emit.apply(iface, [signal.name].concat(body));
        };
      }
    };
    var ProxyInterface = class _ProxyInterface extends EventEmitter {
      /**
       * Create a new `ProxyInterface`. This constructor should not be called
       * directly. Use {@link ProxyObject#getInterface} to get a proxy interface.
       */
      constructor(name, object) {
        super();
        this.$name = name;
        this.$object = object;
        this.$properties = [];
        this.$methods = [];
        this.$signals = [];
        this.$listeners = {};
        const getEventDetails = (eventName) => {
          const signal = this.$signals.find((s) => s.name === eventName);
          if (!signal) {
            return [null, null];
          }
          const detailedEvent = JSON.stringify({
            path: this.$object.path,
            interface: this.$name,
            member: eventName
          });
          return [signal, detailedEvent];
        };
        this.on("removeListener", (eventName, listener) => {
          const [signal, detailedEvent] = getEventDetails(eventName);
          if (!signal) {
            return;
          }
          const proxyListener = this._getEventListener(signal);
          if (proxyListener.refcount <= 0) {
            return;
          }
          proxyListener.refcount -= 1;
          if (proxyListener.refcount > 0) {
            return;
          }
          this.$object.bus._removeMatch(this._signalMatchRuleString(eventName)).catch((error) => {
            this.$object.bus.emit("error", error);
          });
          this.$object.bus._signals.removeListener(detailedEvent, proxyListener.fn);
        });
        this.on("newListener", (eventName, listener) => {
          const [signal, detailedEvent] = getEventDetails(eventName);
          if (!signal) {
            return;
          }
          const proxyListener = this._getEventListener(signal);
          if (proxyListener.refcount > 0) {
            proxyListener.refcount += 1;
            return;
          }
          proxyListener.refcount = 1;
          this.$object.bus._addMatch(this._signalMatchRuleString(eventName)).catch((error) => {
            this.$object.bus.emit("error", error);
          });
          this.$object.bus._signals.on(detailedEvent, proxyListener.fn);
        });
      }
      _signalMatchRuleString(eventName) {
        return `type='signal',sender=${this.$object.name},interface='${this.$name}',path='${this.$object.path}',member='${eventName}'`;
      }
      _getEventListener(signal) {
        if (this.$listeners[signal.name]) {
          return this.$listeners[signal.name];
        }
        this.$listeners[signal.name] = new ProxyListener(signal, this);
        return this.$listeners[signal.name];
      }
      static _fromXml(object, xml) {
        if (!("$" in xml) || !isInterfaceNameValid(xml.$.name)) {
          return null;
        }
        const name = xml.$.name;
        const iface = new _ProxyInterface(name, object);
        if (Array.isArray(xml.property)) {
          for (const p of xml.property) {
            if ("$" in p) {
              iface.$properties.push(p.$);
            }
          }
        }
        if (Array.isArray(xml.signal)) {
          for (const s of xml.signal) {
            if (!("$" in s) || !isMemberNameValid(s.$.name)) {
              continue;
            }
            const signal = {
              name: s.$.name,
              signature: ""
            };
            if (Array.isArray(s.arg)) {
              for (const a of s.arg) {
                if ("$" in a && "type" in a.$) {
                  signal.signature += a.$.type;
                }
              }
            }
            iface.$signals.push(signal);
          }
        }
        if (Array.isArray(xml.method)) {
          for (const m of xml.method) {
            if (!("$" in m) || !isMemberNameValid(m.$.name)) {
              continue;
            }
            const method = {
              name: m.$.name,
              inSignature: "",
              outSignature: ""
            };
            if (Array.isArray(m.arg)) {
              for (const a of m.arg) {
                if (!("$" in a) || typeof a.$.type !== "string") {
                  continue;
                }
                const arg = a.$;
                if (arg.direction === "in") {
                  method.inSignature += arg.type;
                } else if (arg.direction === "out") {
                  method.outSignature += arg.type;
                }
              }
            }
            iface.$methods.push(method);
            iface[method.name] = function(...args) {
              const objArgs = [
                name,
                method.name,
                method.inSignature,
                method.outSignature
              ].concat(args);
              return object._callMethod.apply(object, objArgs);
            };
          }
        }
        return iface;
      }
    };
    module2.exports = ProxyInterface;
  }
});

// node_modules/dbus-next/lib/client/proxy-object.js
var require_proxy_object = __commonJS({
  "node_modules/dbus-next/lib/client/proxy-object.js"(exports2, module2) {
    var xml2js = require_xml2js();
    var { parseSignature } = require_signature();
    var ProxyInterface = require_proxy_interface();
    var { Message } = require_message_type();
    var {
      assertBusNameValid,
      assertObjectPathValid,
      isObjectPathValid
    } = require_validators();
    var ProxyObject = class {
      /**
       * Create a new `ProxyObject`. This constructor should not be called
       * directly. Use {@link MessageBus#getProxyObject} to get a proxy object.
       */
      constructor(bus2, name, path) {
        assertBusNameValid(name);
        assertObjectPathValid(path);
        this.bus = bus2;
        this.name = name;
        this.path = path;
        this.nodes = [];
        this.interfaces = {};
        this._parser = new xml2js.Parser();
      }
      /**
       * Get a {@link ProxyInterface} for the given interface name.
       *
       * @param name {string} - the interface name to get.
       * @returns {ProxyInterface} - the proxy interface with this name exported by
       * the object or `undefined` if the object does not export an interface with
       * that name.
       * @throws {Error} Throws an error if the interface is not found on this object.
       */
      getInterface(name) {
        if (!Object.keys(this.interfaces).includes(name)) {
          throw new Error(`interface not found in proxy object: ${name}`);
        }
        return this.interfaces[name];
      }
      _initXml(xml) {
        const root = xml.node;
        if (Array.isArray(root.node)) {
          for (const n of root.node) {
            if (!("$" in n)) {
              continue;
            }
            const name = n.$.name;
            const path = `${this.path}/${name}`;
            if (isObjectPathValid(path)) {
              this.nodes.push(path);
            }
          }
        }
        if (Array.isArray(root.interface)) {
          for (const i of root.interface) {
            const iface = ProxyInterface._fromXml(this, i);
            if (iface !== null) {
              this.interfaces[iface.$name] = iface;
            }
          }
        }
      }
      _init(xml) {
        return new Promise((resolve, reject) => {
          if (xml) {
            this._parser.parseString(xml, (err, data) => {
              if (err) {
                return reject(err);
              }
              this._initXml(data);
              const nameOwnerMessage = new Message({
                destination: "org.freedesktop.DBus",
                path: "/org/freedesktop/DBus",
                interface: "org.freedesktop.DBus",
                member: "GetNameOwner",
                signature: "s",
                body: [this.name]
              });
              this.bus.call(nameOwnerMessage).then((msg) => {
                this.bus._nameOwners[this.name] = msg.body[0];
                resolve(this);
              }).catch((err2) => {
                if (err2.type === "org.freedesktop.DBus.Error.NameHasNoOwner") {
                  return resolve(this);
                }
                return reject(err2);
              });
            });
          } else {
            const introspectMessage = new Message({
              destination: this.name,
              path: this.path,
              interface: "org.freedesktop.DBus.Introspectable",
              member: "Introspect",
              signature: "",
              body: []
            });
            this.bus.call(introspectMessage).then((msg) => {
              const xml2 = msg.body[0];
              this._parser.parseString(xml2, (err, data) => {
                if (err) {
                  return reject(err);
                }
                this._initXml(data);
                resolve(this);
              });
            }).catch((err) => {
              return reject(err);
            });
          }
        });
      }
      _callMethod(iface, member, inSignature, outSignature, ...args) {
        return new Promise((resolve, reject) => {
          args = args || [];
          const methodCallMessage = new Message({
            destination: this.name,
            interface: iface,
            path: this.path,
            member,
            signature: inSignature,
            body: args
          });
          this.bus.call(methodCallMessage).then((msg) => {
            const outSignatureTree = parseSignature(outSignature);
            if (outSignatureTree.length === 0) {
              resolve(null);
              return;
            }
            if (outSignatureTree.length === 1) {
              resolve(msg.body[0]);
            } else {
              resolve(msg.body);
            }
          }).catch((err) => {
            return reject(err);
          });
        });
      }
    };
    module2.exports = ProxyObject;
  }
});

// node_modules/dbus-next/lib/bus.js
var require_bus = __commonJS({
  "node_modules/dbus-next/lib/bus.js"(exports2, module2) {
    var EventEmitter = require("events").EventEmitter;
    var constants = require_constants();
    var handleMethod = require_handlers();
    var { DBusError } = require_errors();
    var { Message } = require_message_type();
    var ServiceObject = require_object();
    var xml2js = require_xml2js();
    var {
      METHOD_CALL,
      METHOD_RETURN,
      ERROR,
      SIGNAL
    } = constants.MessageType;
    var {
      NO_REPLY_EXPECTED
    } = constants.MessageFlag;
    var {
      assertBusNameValid,
      assertObjectPathValid
    } = require_validators();
    var ProxyObject = require_proxy_object();
    var xmlHeader = '<!DOCTYPE node PUBLIC "-//freedesktop//DTD D-BUS Object Introspection 1.0//EN" "http://www.freedesktop.org/standards/dbus/1.0/introspect.dtd">\n';
    var MessageBus = class extends EventEmitter {
      /**
       * Create a new `MessageBus`. This constructor is not to be called directly.
       * Use `dbus.sessionBus()` or `dbus.systemBus()` to set up the connection to
        * the bus.
       */
      constructor(conn) {
        super();
        this._builder = new xml2js.Builder({ headless: true });
        this._connection = conn;
        this._serial = 1;
        this._methodReturnHandlers = {};
        this._signals = new EventEmitter();
        this._nameOwners = {};
        this._methodHandlers = [];
        this._serviceObjects = {};
        this._matchRules = {};
        this.name = null;
        const handleMessage = (msg) => {
          if (this.name && msg.destination) {
            if (msg.destination[0] === ":" && msg.destination !== this.name) {
              return;
            }
            if (this._nameOwners[msg.destination] && this._nameOwners[msg.destination] !== this.name) {
              return;
            }
          }
          if (msg.type === METHOD_RETURN || msg.type === ERROR) {
            const handler = this._methodReturnHandlers[msg.replySerial];
            if (handler) {
              delete this._methodReturnHandlers[msg.replySerial];
              handler(msg);
            }
          } else if (msg.type === SIGNAL) {
            const { sender, path, iface, member } = msg;
            if (sender === "org.freedesktop.DBus" && path === "/org/freedesktop/DBus" && iface === "org.freedesktop.DBus" && member === "NameOwnerChanged") {
              const name = msg.body[0];
              const newOwner = msg.body[2];
              if (!name.startsWith(":")) {
                this._nameOwners[name] = newOwner;
              }
            }
            const mangled = JSON.stringify({
              path: msg.path,
              interface: msg.interface,
              member: msg.member
            });
            this._signals.emit(mangled, msg);
          } else {
            let handled = false;
            for (const handler of this._methodHandlers) {
              handled = handler(msg);
              if (handled) {
                break;
              }
            }
            if (!handled) {
              handled = handleMethod(msg, this);
            }
            if (!handled) {
              this.send(Message.newError(
                msg,
                "org.freedesktop.DBus.Error.UnknownMethod",
                `Method '${msg.member}' on interface '${msg.interface || "(none)"}' does not exist`
              ));
            }
          }
        };
        conn.on("message", (msg) => {
          try {
            this.emit("message", msg);
            handleMessage(msg);
          } catch (e) {
            this.send(Message.newError(msg, "com.github.dbus_next.Error", `The DBus library encountered an error.
${e.stack}`));
          }
        });
        conn.on("error", (err) => {
          this.emit("error", err);
        });
        const helloMessage = new Message({
          path: "/org/freedesktop/DBus",
          destination: "org.freedesktop.DBus",
          interface: "org.freedesktop.DBus",
          member: "Hello"
        });
        this.call(helloMessage).then((msg) => {
          this.name = msg.body[0];
          this.emit("connect");
        }).catch((err) => {
          this.emit("error", err);
          throw new Error(err);
        });
      }
      /**
       * Get a {@link ProxyObject} on the bus for the given name and path for interacting
       * with a service as a client. The proxy object contains a list of the
       * [`ProxyInterface`s]{@link ProxyInterface} exported at the name and object path as well as a list
       * of `node`s.
       *
       * @param name {string} - the well-known name on the bus.
       * @param path {string} - the object path exported on the name.
       * @param [xml] {string} - xml introspection data.
       * @returns {Promise} - a Promise that resolves with the `ProxyObject`.
       */
      getProxyObject(name, path, xml) {
        const obj = new ProxyObject(this, name, path);
        return obj._init(xml);
      }
      /**
       * Request a well-known name on the bus.
       *
       * @see {@link https://dbus.freedesktop.org/doc/dbus-specification.html#bus-messages-request-name}
       *
       * @param name {string} - the well-known name on the bus to request.
       * @param flags {NameFlag} - DBus name flags which affect the behavior of taking the name.
       * @returns {Promise} - a Promise that resolves with the {@link RequestNameReply}.
       */
      requestName(name, flags) {
        flags = flags || 0;
        return new Promise((resolve, reject) => {
          assertBusNameValid(name);
          const requestNameMessage = new Message({
            path: "/org/freedesktop/DBus",
            destination: "org.freedesktop.DBus",
            interface: "org.freedesktop.DBus",
            member: "RequestName",
            signature: "su",
            body: [name, flags]
          });
          this.call(requestNameMessage).then((msg) => {
            return resolve(msg.body[0]);
          }).catch((err) => {
            return reject(err);
          });
        });
      }
      /**
       * Release this name. Requests that the name should no longer be owned by the
       * {@link MessageBus}.
       *
       * @returns {Promise} A Promise that will resolve with the {@link ReleaseNameReply}.
       */
      releaseName(name) {
        return new Promise((resolve, reject) => {
          const msg = new Message({
            path: "/org/freedesktop/DBus",
            destination: "org.freedesktop.DBus",
            interface: "org.freedesktop.DBus",
            member: "ReleaseName",
            signature: "s",
            body: [name]
          });
          this.call(msg).then((reply) => {
            return resolve(reply.body[0]);
          }).catch((err) => {
            return reject(err);
          });
        });
      }
      /**
       * Disconnect this `MessageBus` from the bus.
       */
      disconnect() {
        this._connection.stream.end();
        this._signals.removeAllListeners();
      }
      /**
       * Get a new serial for this bus. These can be used to set the {@link
       * Message#serial} member to send the message on this bus.
       *
       * @returns {int} - A new serial for this bus.
       */
      newSerial() {
        return this._serial++;
      }
      /**
       * A function to call when a message of type {@link MessageType.METHOD_RETURN} is received. User handlers are run before
       * default handlers.
       *
       * @callback methodHandler
       * @param {Message} msg - The message to handle.
       * @returns {boolean} Return `true` if the message is handled and no further
       * handlers will run.
       */
      /**
       * Add a user method return handler. Remove the handler with {@link
       * MessageBus#removeMethodHandler}
       *
       * @param {methodHandler} - A function to handle a {@link Message} of type
       * {@link MessageType.METHOD_RETURN}. Takes the `Message` as the first
        * argument. Return `true` if the method is handled and no further handlers
        * will run.
       */
      addMethodHandler(fn) {
        this._methodHandlers.push(fn);
      }
      /**
       * Remove a user method return handler that was previously added with {@link
       * MessageBus#addMethodHandler}.
       *
       * @param {methodHandler} - A function that was previously added as a method handler.
       */
      removeMethodHandler(fn) {
        for (let i = 0; i < this._methodHandlers.length; ++i) {
          if (this._methodHandlers[i] === fn) {
            this._methodHandlers.splice(i, 1);
          }
        }
      }
      /**
       * Send a {@link Message} of type {@link MessageType.METHOD_CALL} to the bus
       * and wait for the reply.
       *
       * @example
       * let message = new Message({
       *   destination: 'org.freedesktop.DBus',
       *   path: '/org/freedesktop/DBus',
       *   interface: 'org.freedesktop.DBus',
       *   member: 'ListNames'
       * });
       * let reply = await bus.call(message);
       *
       * @param {Message} msg - The message to send.
       * @returns {Promise} reply - A `Promise` that resolves to the {@link
       * Message} which is a reply to the call.
       */
      call(msg) {
        return new Promise((resolve, reject) => {
          if (!(msg instanceof Message)) {
            throw new Error("The call() method takes a Message class as the first argument.");
          }
          if (msg.type !== METHOD_CALL) {
            throw new Error("Only messages of type METHOD_CALL can expect a call reply.");
          }
          if (msg.serial === null || msg._sent) {
            msg.serial = this.newSerial();
          }
          msg._sent = true;
          if (msg.flags & NO_REPLY_EXPECTED) {
            resolve(null);
          } else {
            this._methodReturnHandlers[msg.serial] = (reply) => {
              this._nameOwners[msg.destination] = reply.sender;
              if (reply.type === ERROR) {
                return reject(new DBusError(reply.errorName, reply.body[0], reply));
              } else {
                return resolve(reply);
              }
            };
          }
          this._connection.message(msg);
        });
      }
      /**
       * Send a {@link Message} on the bus that does not expect a reply.
       *
       * @example
       * let message = Message.newSignal('/org/test/path/,
       *                                 'org.test.interface',
       *                                 'SomeSignal');
       * bus.send(message);
       *
       * @param {Message} msg - The message to send.
       */
      send(msg) {
        if (!(msg instanceof Message)) {
          throw new Error("The send() method takes a Message class as the first argument.");
        }
        if (msg.serial === null || msg._sent) {
          msg.serial = this.newSerial();
        }
        this._connection.message(msg);
      }
      /**
       * Export an [`Interface`]{@link module:interface~Interface} on the bus. See
       * the documentation for that class for how to define service interfaces.
       *
       * @param path {string} - The object path to export this `Interface` on.
       * @param iface {module:interface~Interface} - The service interface to export.
       */
      export(path, iface) {
        const obj = this._getServiceObject(path);
        obj.addInterface(iface);
      }
      /**
       * Unexport an `Interface` on the bus. The interface will no longer be
       * advertised to clients.
       *
       * @param {string} path - The object path on which to unexport.
       * @param {module:interface~Interface} [iface] - The `Interface` to unexport.
       * If not given, this will remove all interfaces on the path.
       */
      unexport(path, iface) {
        iface = iface || null;
        if (iface === null) {
          this._removeServiceObject(path);
        } else {
          const obj = this._getServiceObject(path);
          obj.removeInterface(iface);
          if (!obj.interfaces.length) {
            this._removeServiceObject(path);
          }
        }
      }
      _introspect(path) {
        assertObjectPathValid(path);
        const xml = {
          node: {
            node: []
          }
        };
        if (this._serviceObjects[path]) {
          xml.node.interface = this._serviceObjects[path].introspect();
        }
        const pathSplit = path.split("/").filter((n) => n);
        const children2 = /* @__PURE__ */ new Set();
        for (const key of Object.keys(this._serviceObjects)) {
          const keySplit = key.split("/").filter((n) => n);
          if (keySplit.length <= pathSplit.length) {
            continue;
          }
          if (pathSplit.every((v, i) => v === keySplit[i])) {
            children2.add(keySplit[pathSplit.length]);
          }
        }
        for (const child of children2) {
          xml.node.node.push({
            $: {
              name: child
            }
          });
        }
        return xmlHeader + this._builder.buildObject(xml);
      }
      _getServiceObject(path) {
        assertObjectPathValid(path);
        if (!this._serviceObjects[path]) {
          this._serviceObjects[path] = new ServiceObject(path, this);
        }
        return this._serviceObjects[path];
      }
      _removeServiceObject(path) {
        assertObjectPathValid(path);
        if (this._serviceObjects[path]) {
          const obj = this._serviceObjects[path];
          for (const i of Object.keys(obj.interfaces)) {
            obj.removeInterface(obj.interfaces[i]);
          }
          delete this._serviceObjects[path];
        }
      }
      _addMatch(match) {
        if (Object.prototype.hasOwnProperty.call(match, this._matchRules)) {
          this._matchRules[match] += 1;
          return Promise.resolve();
        }
        this._matchRules[match] = 1;
        const msg = new Message({
          path: "/org/freedesktop/DBus",
          destination: "org.freedesktop.DBus",
          interface: "org.freedesktop.DBus",
          member: "AddMatch",
          signature: "s",
          body: [match]
        });
        return this.call(msg);
      }
      _removeMatch(match) {
        if (!this._connection.stream.writable) {
          return Promise.resolve();
        }
        if (Object.prototype.hasOwnProperty.call(match, this._matchRules)) {
          this._matchRules[match] -= 1;
          if (this._matchRules[match] > 0) {
            return Promise.resolve();
          }
        } else {
          return Promise.resolve();
        }
        delete this._matchRules[match];
        const msg = new Message({
          path: "/org/freedesktop/DBus",
          destination: "org.freedesktop.DBus",
          interface: "org.freedesktop.DBus",
          member: "RemoveMatch",
          signature: "s",
          body: [match]
        });
        return this.call(msg);
      }
    };
    module2.exports = MessageBus;
  }
});

// node_modules/safe-buffer/index.js
var require_safe_buffer = __commonJS({
  "node_modules/safe-buffer/index.js"(exports2, module2) {
    var buffer = require("buffer");
    var Buffer2 = buffer.Buffer;
    function copyProps(src, dst) {
      for (var key in src) {
        dst[key] = src[key];
      }
    }
    if (Buffer2.from && Buffer2.alloc && Buffer2.allocUnsafe && Buffer2.allocUnsafeSlow) {
      module2.exports = buffer;
    } else {
      copyProps(buffer, exports2);
      exports2.Buffer = SafeBuffer;
    }
    function SafeBuffer(arg, encodingOrOffset, length) {
      return Buffer2(arg, encodingOrOffset, length);
    }
    SafeBuffer.prototype = Object.create(Buffer2.prototype);
    copyProps(Buffer2, SafeBuffer);
    SafeBuffer.from = function(arg, encodingOrOffset, length) {
      if (typeof arg === "number") {
        throw new TypeError("Argument must not be a number");
      }
      return Buffer2(arg, encodingOrOffset, length);
    };
    SafeBuffer.alloc = function(size, fill, encoding) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      var buf = Buffer2(size);
      if (fill !== void 0) {
        if (typeof encoding === "string") {
          buf.fill(fill, encoding);
        } else {
          buf.fill(fill);
        }
      } else {
        buf.fill(0);
      }
      return buf;
    };
    SafeBuffer.allocUnsafe = function(size) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      return Buffer2(size);
    };
    SafeBuffer.allocUnsafeSlow = function(size) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      return buffer.SlowBuffer(size);
    };
  }
});

// node_modules/@nornagon/put/index.js
var require_put = __commonJS({
  "node_modules/@nornagon/put/index.js"(exports2, module2) {
    module2.exports = Put;
    function Put() {
      if (!(this instanceof Put)) return new Put();
      var words = [];
      var len = 0;
      this.put = function(buf) {
        words.push({ buffer: buf });
        len += buf.length;
        return this;
      };
      this.word8 = function(x) {
        words.push({ bytes: 1, value: x });
        len += 1;
        return this;
      };
      this.floatle = function(x) {
        words.push({ bytes: "float", endian: "little", value: x });
        len += 4;
        return this;
      };
      [8, 16, 24, 32, 64].forEach(function(bits) {
        this["word" + bits + "be"] = function(x) {
          words.push({ endian: "big", bytes: bits / 8, value: x });
          len += bits / 8;
          return this;
        };
        this["word" + bits + "le"] = function(x) {
          words.push({ endian: "little", bytes: bits / 8, value: x });
          len += bits / 8;
          return this;
        };
      }.bind(this));
      this.pad = function(bytes) {
        words.push({ endian: "big", bytes, value: 0 });
        len += bytes;
        return this;
      };
      this.length = function() {
        return len;
      };
      this.buffer = function() {
        var buf = Buffer.alloc(len);
        var offset = 0;
        words.forEach(function(word) {
          if (word.buffer) {
            word.buffer.copy(buf, offset, 0);
            offset += word.buffer.length;
          } else if (word.bytes == "float") {
            var v = Math.abs(word.value);
            var s = (word.value >= 0) * 1;
            var e = Math.ceil(Math.log(v) / Math.LN2);
            var f = v / (1 << e);
            console.dir([s, e, f]);
            console.log(word.value);
            buf[offset++] = s << 7 & ~~(e / 2);
            buf[offset++] = (e & 1) << 7 & ~~(f / (1 << 16));
            buf[offset++] = 0;
            buf[offset++] = 0;
            offset += 4;
          } else {
            var big = word.endian === "big";
            var ix = big ? [(word.bytes - 1) * 8, -8] : [0, 8];
            for (var i = ix[0]; big ? i >= 0 : i < word.bytes * 8; i += ix[1]) {
              if (i >= 32) {
                buf[offset++] = Math.floor(word.value / Math.pow(2, i)) & 255;
              } else {
                buf[offset++] = word.value >> i & 255;
              }
            }
          }
        });
        return buf;
      };
      this.write = function(stream) {
        stream.write(this.buffer());
      };
    }
  }
});

// node_modules/dbus-next/lib/align.js
var require_align = __commonJS({
  "node_modules/dbus-next/lib/align.js"(exports2) {
    var Buffer2 = require_safe_buffer().Buffer;
    function align(ps, n) {
      const pad = n - ps._offset % n;
      if (pad === 0 || pad === n) return;
      const padBuff = Buffer2.alloc(pad);
      ps.put(Buffer2.from(padBuff));
      ps._offset += pad;
    }
    exports2.align = align;
  }
});

// node_modules/long/src/long.js
var require_long = __commonJS({
  "node_modules/long/src/long.js"(exports2, module2) {
    module2.exports = Long;
    var wasm = null;
    try {
      wasm = new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array([
        0,
        97,
        115,
        109,
        1,
        0,
        0,
        0,
        1,
        13,
        2,
        96,
        0,
        1,
        127,
        96,
        4,
        127,
        127,
        127,
        127,
        1,
        127,
        3,
        7,
        6,
        0,
        1,
        1,
        1,
        1,
        1,
        6,
        6,
        1,
        127,
        1,
        65,
        0,
        11,
        7,
        50,
        6,
        3,
        109,
        117,
        108,
        0,
        1,
        5,
        100,
        105,
        118,
        95,
        115,
        0,
        2,
        5,
        100,
        105,
        118,
        95,
        117,
        0,
        3,
        5,
        114,
        101,
        109,
        95,
        115,
        0,
        4,
        5,
        114,
        101,
        109,
        95,
        117,
        0,
        5,
        8,
        103,
        101,
        116,
        95,
        104,
        105,
        103,
        104,
        0,
        0,
        10,
        191,
        1,
        6,
        4,
        0,
        35,
        0,
        11,
        36,
        1,
        1,
        126,
        32,
        0,
        173,
        32,
        1,
        173,
        66,
        32,
        134,
        132,
        32,
        2,
        173,
        32,
        3,
        173,
        66,
        32,
        134,
        132,
        126,
        34,
        4,
        66,
        32,
        135,
        167,
        36,
        0,
        32,
        4,
        167,
        11,
        36,
        1,
        1,
        126,
        32,
        0,
        173,
        32,
        1,
        173,
        66,
        32,
        134,
        132,
        32,
        2,
        173,
        32,
        3,
        173,
        66,
        32,
        134,
        132,
        127,
        34,
        4,
        66,
        32,
        135,
        167,
        36,
        0,
        32,
        4,
        167,
        11,
        36,
        1,
        1,
        126,
        32,
        0,
        173,
        32,
        1,
        173,
        66,
        32,
        134,
        132,
        32,
        2,
        173,
        32,
        3,
        173,
        66,
        32,
        134,
        132,
        128,
        34,
        4,
        66,
        32,
        135,
        167,
        36,
        0,
        32,
        4,
        167,
        11,
        36,
        1,
        1,
        126,
        32,
        0,
        173,
        32,
        1,
        173,
        66,
        32,
        134,
        132,
        32,
        2,
        173,
        32,
        3,
        173,
        66,
        32,
        134,
        132,
        129,
        34,
        4,
        66,
        32,
        135,
        167,
        36,
        0,
        32,
        4,
        167,
        11,
        36,
        1,
        1,
        126,
        32,
        0,
        173,
        32,
        1,
        173,
        66,
        32,
        134,
        132,
        32,
        2,
        173,
        32,
        3,
        173,
        66,
        32,
        134,
        132,
        130,
        34,
        4,
        66,
        32,
        135,
        167,
        36,
        0,
        32,
        4,
        167,
        11
      ])), {}).exports;
    } catch (e) {
    }
    function Long(low, high, unsigned) {
      this.low = low | 0;
      this.high = high | 0;
      this.unsigned = !!unsigned;
    }
    Long.prototype.__isLong__;
    Object.defineProperty(Long.prototype, "__isLong__", { value: true });
    function isLong(obj) {
      return (obj && obj["__isLong__"]) === true;
    }
    Long.isLong = isLong;
    var INT_CACHE = {};
    var UINT_CACHE = {};
    function fromInt(value, unsigned) {
      var obj, cachedObj, cache;
      if (unsigned) {
        value >>>= 0;
        if (cache = 0 <= value && value < 256) {
          cachedObj = UINT_CACHE[value];
          if (cachedObj)
            return cachedObj;
        }
        obj = fromBits(value, (value | 0) < 0 ? -1 : 0, true);
        if (cache)
          UINT_CACHE[value] = obj;
        return obj;
      } else {
        value |= 0;
        if (cache = -128 <= value && value < 128) {
          cachedObj = INT_CACHE[value];
          if (cachedObj)
            return cachedObj;
        }
        obj = fromBits(value, value < 0 ? -1 : 0, false);
        if (cache)
          INT_CACHE[value] = obj;
        return obj;
      }
    }
    Long.fromInt = fromInt;
    function fromNumber(value, unsigned) {
      if (isNaN(value))
        return unsigned ? UZERO : ZERO;
      if (unsigned) {
        if (value < 0)
          return UZERO;
        if (value >= TWO_PWR_64_DBL)
          return MAX_UNSIGNED_VALUE;
      } else {
        if (value <= -TWO_PWR_63_DBL)
          return MIN_VALUE;
        if (value + 1 >= TWO_PWR_63_DBL)
          return MAX_VALUE;
      }
      if (value < 0)
        return fromNumber(-value, unsigned).neg();
      return fromBits(value % TWO_PWR_32_DBL | 0, value / TWO_PWR_32_DBL | 0, unsigned);
    }
    Long.fromNumber = fromNumber;
    function fromBits(lowBits, highBits, unsigned) {
      return new Long(lowBits, highBits, unsigned);
    }
    Long.fromBits = fromBits;
    var pow_dbl = Math.pow;
    function fromString(str, unsigned, radix) {
      if (str.length === 0)
        throw Error("empty string");
      if (str === "NaN" || str === "Infinity" || str === "+Infinity" || str === "-Infinity")
        return ZERO;
      if (typeof unsigned === "number") {
        radix = unsigned, unsigned = false;
      } else {
        unsigned = !!unsigned;
      }
      radix = radix || 10;
      if (radix < 2 || 36 < radix)
        throw RangeError("radix");
      var p;
      if ((p = str.indexOf("-")) > 0)
        throw Error("interior hyphen");
      else if (p === 0) {
        return fromString(str.substring(1), unsigned, radix).neg();
      }
      var radixToPower = fromNumber(pow_dbl(radix, 8));
      var result = ZERO;
      for (var i = 0; i < str.length; i += 8) {
        var size = Math.min(8, str.length - i), value = parseInt(str.substring(i, i + size), radix);
        if (size < 8) {
          var power = fromNumber(pow_dbl(radix, size));
          result = result.mul(power).add(fromNumber(value));
        } else {
          result = result.mul(radixToPower);
          result = result.add(fromNumber(value));
        }
      }
      result.unsigned = unsigned;
      return result;
    }
    Long.fromString = fromString;
    function fromValue(val, unsigned) {
      if (typeof val === "number")
        return fromNumber(val, unsigned);
      if (typeof val === "string")
        return fromString(val, unsigned);
      return fromBits(val.low, val.high, typeof unsigned === "boolean" ? unsigned : val.unsigned);
    }
    Long.fromValue = fromValue;
    var TWO_PWR_16_DBL = 1 << 16;
    var TWO_PWR_24_DBL = 1 << 24;
    var TWO_PWR_32_DBL = TWO_PWR_16_DBL * TWO_PWR_16_DBL;
    var TWO_PWR_64_DBL = TWO_PWR_32_DBL * TWO_PWR_32_DBL;
    var TWO_PWR_63_DBL = TWO_PWR_64_DBL / 2;
    var TWO_PWR_24 = fromInt(TWO_PWR_24_DBL);
    var ZERO = fromInt(0);
    Long.ZERO = ZERO;
    var UZERO = fromInt(0, true);
    Long.UZERO = UZERO;
    var ONE = fromInt(1);
    Long.ONE = ONE;
    var UONE = fromInt(1, true);
    Long.UONE = UONE;
    var NEG_ONE = fromInt(-1);
    Long.NEG_ONE = NEG_ONE;
    var MAX_VALUE = fromBits(4294967295 | 0, 2147483647 | 0, false);
    Long.MAX_VALUE = MAX_VALUE;
    var MAX_UNSIGNED_VALUE = fromBits(4294967295 | 0, 4294967295 | 0, true);
    Long.MAX_UNSIGNED_VALUE = MAX_UNSIGNED_VALUE;
    var MIN_VALUE = fromBits(0, 2147483648 | 0, false);
    Long.MIN_VALUE = MIN_VALUE;
    var LongPrototype = Long.prototype;
    LongPrototype.toInt = function toInt() {
      return this.unsigned ? this.low >>> 0 : this.low;
    };
    LongPrototype.toNumber = function toNumber() {
      if (this.unsigned)
        return (this.high >>> 0) * TWO_PWR_32_DBL + (this.low >>> 0);
      return this.high * TWO_PWR_32_DBL + (this.low >>> 0);
    };
    LongPrototype.toString = function toString(radix) {
      radix = radix || 10;
      if (radix < 2 || 36 < radix)
        throw RangeError("radix");
      if (this.isZero())
        return "0";
      if (this.isNegative()) {
        if (this.eq(MIN_VALUE)) {
          var radixLong = fromNumber(radix), div = this.div(radixLong), rem1 = div.mul(radixLong).sub(this);
          return div.toString(radix) + rem1.toInt().toString(radix);
        } else
          return "-" + this.neg().toString(radix);
      }
      var radixToPower = fromNumber(pow_dbl(radix, 6), this.unsigned), rem = this;
      var result = "";
      while (true) {
        var remDiv = rem.div(radixToPower), intval = rem.sub(remDiv.mul(radixToPower)).toInt() >>> 0, digits = intval.toString(radix);
        rem = remDiv;
        if (rem.isZero())
          return digits + result;
        else {
          while (digits.length < 6)
            digits = "0" + digits;
          result = "" + digits + result;
        }
      }
    };
    LongPrototype.getHighBits = function getHighBits() {
      return this.high;
    };
    LongPrototype.getHighBitsUnsigned = function getHighBitsUnsigned() {
      return this.high >>> 0;
    };
    LongPrototype.getLowBits = function getLowBits() {
      return this.low;
    };
    LongPrototype.getLowBitsUnsigned = function getLowBitsUnsigned() {
      return this.low >>> 0;
    };
    LongPrototype.getNumBitsAbs = function getNumBitsAbs() {
      if (this.isNegative())
        return this.eq(MIN_VALUE) ? 64 : this.neg().getNumBitsAbs();
      var val = this.high != 0 ? this.high : this.low;
      for (var bit = 31; bit > 0; bit--)
        if ((val & 1 << bit) != 0)
          break;
      return this.high != 0 ? bit + 33 : bit + 1;
    };
    LongPrototype.isZero = function isZero() {
      return this.high === 0 && this.low === 0;
    };
    LongPrototype.eqz = LongPrototype.isZero;
    LongPrototype.isNegative = function isNegative() {
      return !this.unsigned && this.high < 0;
    };
    LongPrototype.isPositive = function isPositive() {
      return this.unsigned || this.high >= 0;
    };
    LongPrototype.isOdd = function isOdd() {
      return (this.low & 1) === 1;
    };
    LongPrototype.isEven = function isEven() {
      return (this.low & 1) === 0;
    };
    LongPrototype.equals = function equals(other) {
      if (!isLong(other))
        other = fromValue(other);
      if (this.unsigned !== other.unsigned && this.high >>> 31 === 1 && other.high >>> 31 === 1)
        return false;
      return this.high === other.high && this.low === other.low;
    };
    LongPrototype.eq = LongPrototype.equals;
    LongPrototype.notEquals = function notEquals(other) {
      return !this.eq(
        /* validates */
        other
      );
    };
    LongPrototype.neq = LongPrototype.notEquals;
    LongPrototype.ne = LongPrototype.notEquals;
    LongPrototype.lessThan = function lessThan(other) {
      return this.comp(
        /* validates */
        other
      ) < 0;
    };
    LongPrototype.lt = LongPrototype.lessThan;
    LongPrototype.lessThanOrEqual = function lessThanOrEqual(other) {
      return this.comp(
        /* validates */
        other
      ) <= 0;
    };
    LongPrototype.lte = LongPrototype.lessThanOrEqual;
    LongPrototype.le = LongPrototype.lessThanOrEqual;
    LongPrototype.greaterThan = function greaterThan(other) {
      return this.comp(
        /* validates */
        other
      ) > 0;
    };
    LongPrototype.gt = LongPrototype.greaterThan;
    LongPrototype.greaterThanOrEqual = function greaterThanOrEqual(other) {
      return this.comp(
        /* validates */
        other
      ) >= 0;
    };
    LongPrototype.gte = LongPrototype.greaterThanOrEqual;
    LongPrototype.ge = LongPrototype.greaterThanOrEqual;
    LongPrototype.compare = function compare(other) {
      if (!isLong(other))
        other = fromValue(other);
      if (this.eq(other))
        return 0;
      var thisNeg = this.isNegative(), otherNeg = other.isNegative();
      if (thisNeg && !otherNeg)
        return -1;
      if (!thisNeg && otherNeg)
        return 1;
      if (!this.unsigned)
        return this.sub(other).isNegative() ? -1 : 1;
      return other.high >>> 0 > this.high >>> 0 || other.high === this.high && other.low >>> 0 > this.low >>> 0 ? -1 : 1;
    };
    LongPrototype.comp = LongPrototype.compare;
    LongPrototype.negate = function negate() {
      if (!this.unsigned && this.eq(MIN_VALUE))
        return MIN_VALUE;
      return this.not().add(ONE);
    };
    LongPrototype.neg = LongPrototype.negate;
    LongPrototype.add = function add(addend) {
      if (!isLong(addend))
        addend = fromValue(addend);
      var a48 = this.high >>> 16;
      var a32 = this.high & 65535;
      var a16 = this.low >>> 16;
      var a00 = this.low & 65535;
      var b48 = addend.high >>> 16;
      var b32 = addend.high & 65535;
      var b16 = addend.low >>> 16;
      var b00 = addend.low & 65535;
      var c48 = 0, c32 = 0, c16 = 0, c00 = 0;
      c00 += a00 + b00;
      c16 += c00 >>> 16;
      c00 &= 65535;
      c16 += a16 + b16;
      c32 += c16 >>> 16;
      c16 &= 65535;
      c32 += a32 + b32;
      c48 += c32 >>> 16;
      c32 &= 65535;
      c48 += a48 + b48;
      c48 &= 65535;
      return fromBits(c16 << 16 | c00, c48 << 16 | c32, this.unsigned);
    };
    LongPrototype.subtract = function subtract(subtrahend) {
      if (!isLong(subtrahend))
        subtrahend = fromValue(subtrahend);
      return this.add(subtrahend.neg());
    };
    LongPrototype.sub = LongPrototype.subtract;
    LongPrototype.multiply = function multiply(multiplier) {
      if (this.isZero())
        return ZERO;
      if (!isLong(multiplier))
        multiplier = fromValue(multiplier);
      if (wasm) {
        var low = wasm.mul(
          this.low,
          this.high,
          multiplier.low,
          multiplier.high
        );
        return fromBits(low, wasm.get_high(), this.unsigned);
      }
      if (multiplier.isZero())
        return ZERO;
      if (this.eq(MIN_VALUE))
        return multiplier.isOdd() ? MIN_VALUE : ZERO;
      if (multiplier.eq(MIN_VALUE))
        return this.isOdd() ? MIN_VALUE : ZERO;
      if (this.isNegative()) {
        if (multiplier.isNegative())
          return this.neg().mul(multiplier.neg());
        else
          return this.neg().mul(multiplier).neg();
      } else if (multiplier.isNegative())
        return this.mul(multiplier.neg()).neg();
      if (this.lt(TWO_PWR_24) && multiplier.lt(TWO_PWR_24))
        return fromNumber(this.toNumber() * multiplier.toNumber(), this.unsigned);
      var a48 = this.high >>> 16;
      var a32 = this.high & 65535;
      var a16 = this.low >>> 16;
      var a00 = this.low & 65535;
      var b48 = multiplier.high >>> 16;
      var b32 = multiplier.high & 65535;
      var b16 = multiplier.low >>> 16;
      var b00 = multiplier.low & 65535;
      var c48 = 0, c32 = 0, c16 = 0, c00 = 0;
      c00 += a00 * b00;
      c16 += c00 >>> 16;
      c00 &= 65535;
      c16 += a16 * b00;
      c32 += c16 >>> 16;
      c16 &= 65535;
      c16 += a00 * b16;
      c32 += c16 >>> 16;
      c16 &= 65535;
      c32 += a32 * b00;
      c48 += c32 >>> 16;
      c32 &= 65535;
      c32 += a16 * b16;
      c48 += c32 >>> 16;
      c32 &= 65535;
      c32 += a00 * b32;
      c48 += c32 >>> 16;
      c32 &= 65535;
      c48 += a48 * b00 + a32 * b16 + a16 * b32 + a00 * b48;
      c48 &= 65535;
      return fromBits(c16 << 16 | c00, c48 << 16 | c32, this.unsigned);
    };
    LongPrototype.mul = LongPrototype.multiply;
    LongPrototype.divide = function divide(divisor) {
      if (!isLong(divisor))
        divisor = fromValue(divisor);
      if (divisor.isZero())
        throw Error("division by zero");
      if (wasm) {
        if (!this.unsigned && this.high === -2147483648 && divisor.low === -1 && divisor.high === -1) {
          return this;
        }
        var low = (this.unsigned ? wasm.div_u : wasm.div_s)(
          this.low,
          this.high,
          divisor.low,
          divisor.high
        );
        return fromBits(low, wasm.get_high(), this.unsigned);
      }
      if (this.isZero())
        return this.unsigned ? UZERO : ZERO;
      var approx, rem, res;
      if (!this.unsigned) {
        if (this.eq(MIN_VALUE)) {
          if (divisor.eq(ONE) || divisor.eq(NEG_ONE))
            return MIN_VALUE;
          else if (divisor.eq(MIN_VALUE))
            return ONE;
          else {
            var halfThis = this.shr(1);
            approx = halfThis.div(divisor).shl(1);
            if (approx.eq(ZERO)) {
              return divisor.isNegative() ? ONE : NEG_ONE;
            } else {
              rem = this.sub(divisor.mul(approx));
              res = approx.add(rem.div(divisor));
              return res;
            }
          }
        } else if (divisor.eq(MIN_VALUE))
          return this.unsigned ? UZERO : ZERO;
        if (this.isNegative()) {
          if (divisor.isNegative())
            return this.neg().div(divisor.neg());
          return this.neg().div(divisor).neg();
        } else if (divisor.isNegative())
          return this.div(divisor.neg()).neg();
        res = ZERO;
      } else {
        if (!divisor.unsigned)
          divisor = divisor.toUnsigned();
        if (divisor.gt(this))
          return UZERO;
        if (divisor.gt(this.shru(1)))
          return UONE;
        res = UZERO;
      }
      rem = this;
      while (rem.gte(divisor)) {
        approx = Math.max(1, Math.floor(rem.toNumber() / divisor.toNumber()));
        var log2 = Math.ceil(Math.log(approx) / Math.LN2), delta = log2 <= 48 ? 1 : pow_dbl(2, log2 - 48), approxRes = fromNumber(approx), approxRem = approxRes.mul(divisor);
        while (approxRem.isNegative() || approxRem.gt(rem)) {
          approx -= delta;
          approxRes = fromNumber(approx, this.unsigned);
          approxRem = approxRes.mul(divisor);
        }
        if (approxRes.isZero())
          approxRes = ONE;
        res = res.add(approxRes);
        rem = rem.sub(approxRem);
      }
      return res;
    };
    LongPrototype.div = LongPrototype.divide;
    LongPrototype.modulo = function modulo(divisor) {
      if (!isLong(divisor))
        divisor = fromValue(divisor);
      if (wasm) {
        var low = (this.unsigned ? wasm.rem_u : wasm.rem_s)(
          this.low,
          this.high,
          divisor.low,
          divisor.high
        );
        return fromBits(low, wasm.get_high(), this.unsigned);
      }
      return this.sub(this.div(divisor).mul(divisor));
    };
    LongPrototype.mod = LongPrototype.modulo;
    LongPrototype.rem = LongPrototype.modulo;
    LongPrototype.not = function not() {
      return fromBits(~this.low, ~this.high, this.unsigned);
    };
    LongPrototype.and = function and(other) {
      if (!isLong(other))
        other = fromValue(other);
      return fromBits(this.low & other.low, this.high & other.high, this.unsigned);
    };
    LongPrototype.or = function or(other) {
      if (!isLong(other))
        other = fromValue(other);
      return fromBits(this.low | other.low, this.high | other.high, this.unsigned);
    };
    LongPrototype.xor = function xor(other) {
      if (!isLong(other))
        other = fromValue(other);
      return fromBits(this.low ^ other.low, this.high ^ other.high, this.unsigned);
    };
    LongPrototype.shiftLeft = function shiftLeft(numBits) {
      if (isLong(numBits))
        numBits = numBits.toInt();
      if ((numBits &= 63) === 0)
        return this;
      else if (numBits < 32)
        return fromBits(this.low << numBits, this.high << numBits | this.low >>> 32 - numBits, this.unsigned);
      else
        return fromBits(0, this.low << numBits - 32, this.unsigned);
    };
    LongPrototype.shl = LongPrototype.shiftLeft;
    LongPrototype.shiftRight = function shiftRight(numBits) {
      if (isLong(numBits))
        numBits = numBits.toInt();
      if ((numBits &= 63) === 0)
        return this;
      else if (numBits < 32)
        return fromBits(this.low >>> numBits | this.high << 32 - numBits, this.high >> numBits, this.unsigned);
      else
        return fromBits(this.high >> numBits - 32, this.high >= 0 ? 0 : -1, this.unsigned);
    };
    LongPrototype.shr = LongPrototype.shiftRight;
    LongPrototype.shiftRightUnsigned = function shiftRightUnsigned(numBits) {
      if (isLong(numBits))
        numBits = numBits.toInt();
      numBits &= 63;
      if (numBits === 0)
        return this;
      else {
        var high = this.high;
        if (numBits < 32) {
          var low = this.low;
          return fromBits(low >>> numBits | high << 32 - numBits, high >>> numBits, this.unsigned);
        } else if (numBits === 32)
          return fromBits(high, 0, this.unsigned);
        else
          return fromBits(high >>> numBits - 32, 0, this.unsigned);
      }
    };
    LongPrototype.shru = LongPrototype.shiftRightUnsigned;
    LongPrototype.shr_u = LongPrototype.shiftRightUnsigned;
    LongPrototype.toSigned = function toSigned() {
      if (!this.unsigned)
        return this;
      return fromBits(this.low, this.high, false);
    };
    LongPrototype.toUnsigned = function toUnsigned() {
      if (this.unsigned)
        return this;
      return fromBits(this.low, this.high, true);
    };
    LongPrototype.toBytes = function toBytes(le) {
      return le ? this.toBytesLE() : this.toBytesBE();
    };
    LongPrototype.toBytesLE = function toBytesLE() {
      var hi = this.high, lo = this.low;
      return [
        lo & 255,
        lo >>> 8 & 255,
        lo >>> 16 & 255,
        lo >>> 24,
        hi & 255,
        hi >>> 8 & 255,
        hi >>> 16 & 255,
        hi >>> 24
      ];
    };
    LongPrototype.toBytesBE = function toBytesBE() {
      var hi = this.high, lo = this.low;
      return [
        hi >>> 24,
        hi >>> 16 & 255,
        hi >>> 8 & 255,
        hi & 255,
        lo >>> 24,
        lo >>> 16 & 255,
        lo >>> 8 & 255,
        lo & 255
      ];
    };
    Long.fromBytes = function fromBytes(bytes, unsigned, le) {
      return le ? Long.fromBytesLE(bytes, unsigned) : Long.fromBytesBE(bytes, unsigned);
    };
    Long.fromBytesLE = function fromBytesLE(bytes, unsigned) {
      return new Long(
        bytes[0] | bytes[1] << 8 | bytes[2] << 16 | bytes[3] << 24,
        bytes[4] | bytes[5] << 8 | bytes[6] << 16 | bytes[7] << 24,
        unsigned
      );
    };
    Long.fromBytesBE = function fromBytesBE(bytes, unsigned) {
      return new Long(
        bytes[4] << 24 | bytes[5] << 16 | bytes[6] << 8 | bytes[7],
        bytes[0] << 24 | bytes[1] << 16 | bytes[2] << 8 | bytes[3],
        unsigned
      );
    };
  }
});

// node_modules/dbus-next/lib/library-options.js
var require_library_options = __commonJS({
  "node_modules/dbus-next/lib/library-options.js"(exports2, module2) {
    var libraryOptions = {
      bigIntCompat: false
    };
    module2.exports.getBigIntCompat = function() {
      return libraryOptions.bigIntCompat;
    };
    module2.exports.setBigIntCompat = function(val) {
      if (typeof val !== "boolean") {
        throw new Error("dbus.setBigIntCompat() must be called with a boolean parameter");
      }
      libraryOptions.bigIntCompat = val;
    };
  }
});

// node_modules/dbus-next/lib/marshallers.js
var require_marshallers = __commonJS({
  "node_modules/dbus-next/lib/marshallers.js"(exports2) {
    var Buffer2 = require_safe_buffer().Buffer;
    var align = require_align().align;
    var { parseSignature } = require_signature();
    var Long = require_long();
    var { getBigIntCompat } = require_library_options();
    var JSBI = require_jsbi_cjs();
    var {
      _getJSBIConstants,
      _getBigIntConstants
    } = require_constants();
    var MakeSimpleMarshaller = function(signature) {
      const marshaller = {};
      function checkValidString(data) {
        if (typeof data !== "string") {
          throw new Error(`Data: ${data} was not of type string`);
        } else if (data.indexOf("\0") !== -1) {
          throw new Error("String contains null byte");
        }
      }
      function checkValidSignature(data) {
        if (data.length > 255) {
          throw new Error(
            `Data: ${data} is too long for signature type (${data.length} > 255)`
          );
        }
        let parenCount = 0;
        for (let ii = 0; ii < data.length; ++ii) {
          if (parenCount > 32) {
            throw new Error(
              `Maximum container type nesting exceeded in signature type:${data}`
            );
          }
          switch (data[ii]) {
            case "(":
              ++parenCount;
              break;
            case ")":
              --parenCount;
              break;
            default:
              break;
          }
        }
        parseSignature(data);
      }
      switch (signature) {
        case "o":
        // object path
        // TODO: verify object path here?
        case "s":
          marshaller.check = function(data) {
            checkValidString(data);
          };
          marshaller.marshall = function(ps, data) {
            this.check(data);
            align(ps, 4);
            const buff = Buffer2.from(data, "utf8");
            ps.word32le(buff.length).put(buff).word8(0);
            ps._offset += 5 + buff.length;
          };
          break;
        case "g":
          marshaller.check = function(data) {
            checkValidString(data);
            checkValidSignature(data);
          };
          marshaller.marshall = function(ps, data) {
            this.check(data);
            const buff = Buffer2.from(data, "ascii");
            ps.word8(data.length).put(buff).word8(0);
            ps._offset += 2 + buff.length;
          };
          break;
        case "y":
          marshaller.check = function(data) {
            checkInteger(data);
            checkRange(0, 255, data);
          };
          marshaller.marshall = function(ps, data) {
            this.check(data);
            ps.word8(data);
            ps._offset++;
          };
          break;
        case "b":
          marshaller.check = function(data) {
            checkBoolean(data);
          };
          marshaller.marshall = function(ps, data) {
            this.check(data);
            data = data ? 1 : 0;
            align(ps, 4);
            ps.word32le(data);
            ps._offset += 4;
          };
          break;
        case "n":
          marshaller.check = function(data) {
            checkInteger(data);
            checkRange(-32767 - 1, 32767, data);
          };
          marshaller.marshall = function(ps, data) {
            this.check(data);
            align(ps, 2);
            const buff = Buffer2.alloc(2);
            buff.writeInt16LE(parseInt(data), 0);
            ps.put(buff);
            ps._offset += 2;
          };
          break;
        case "q":
          marshaller.check = function(data) {
            checkInteger(data);
            checkRange(0, 65535, data);
          };
          marshaller.marshall = function(ps, data) {
            this.check(data);
            align(ps, 2);
            ps.word16le(data);
            ps._offset += 2;
          };
          break;
        case "h":
        case "i":
          marshaller.check = function(data) {
            checkInteger(data);
            checkRange(-2147483647 - 1, 2147483647, data);
          };
          marshaller.marshall = function(ps, data) {
            this.check(data);
            align(ps, 4);
            const buff = Buffer2.alloc(4);
            buff.writeInt32LE(parseInt(data), 0);
            ps.put(buff);
            ps._offset += 4;
          };
          break;
        case "u":
          marshaller.check = function(data) {
            checkInteger(data);
            checkRange(0, 4294967295, data);
          };
          marshaller.marshall = function(ps, data) {
            this.check(data);
            align(ps, 4);
            ps.word32le(data);
            ps._offset += 4;
          };
          break;
        case "t":
          marshaller.check = function(data) {
            return checkLong(data, false);
          };
          marshaller.marshall = function(ps, data) {
            data = this.check(data);
            align(ps, 8);
            ps.word32le(data.low);
            ps.word32le(data.high);
            ps._offset += 8;
          };
          break;
        case "x":
          marshaller.check = function(data) {
            return checkLong(data, true);
          };
          marshaller.marshall = function(ps, data) {
            data = this.check(data);
            align(ps, 8);
            ps.word32le(data.low);
            ps.word32le(data.high);
            ps._offset += 8;
          };
          break;
        case "d":
          marshaller.check = function(data) {
            if (typeof data !== "number") {
              throw new Error(`Data: ${data} was not of type number`);
            } else if (Number.isNaN(data)) {
              throw new Error(`Data: ${data} was not a number`);
            } else if (!Number.isFinite(data)) {
              throw new Error("Number outside range");
            }
          };
          marshaller.marshall = function(ps, data) {
            this.check(data);
            align(ps, 8);
            const buff = Buffer2.alloc(8);
            buff.writeDoubleLE(parseFloat(data), 0);
            ps.put(buff);
            ps._offset += 8;
          };
          break;
        default:
          throw new Error(`Unknown data type format: ${signature}`);
      }
      return marshaller;
    };
    exports2.MakeSimpleMarshaller = MakeSimpleMarshaller;
    var checkRange = function(minValue, maxValue, data) {
      if (data > maxValue || data < minValue) {
        throw new Error("Number outside range");
      }
    };
    var checkInteger = function(data) {
      if (typeof data !== "number") {
        throw new Error(`Data: ${data} was not of type number`);
      }
      if (Math.floor(data) !== data) {
        throw new Error(`Data: ${data} was not an integer`);
      }
    };
    var checkBoolean = function(data) {
      if (!(typeof data === "boolean" || data === 0 || data === 1)) {
        throw new Error(`Data: ${data} was not of type boolean`);
      }
    };
    var checkJSBILong = function(data, signed) {
      const { MAX_INT64, MIN_INT64, MAX_UINT64, MIN_UINT64 } = _getJSBIConstants();
      data = JSBI.BigInt(data.toString());
      if (signed) {
        if (JSBI.greaterThan(data, MAX_INT64)) {
          throw new Error("data was out of range (greater than max int64)");
        } else if (JSBI.lessThan(data, MIN_INT64)) {
          throw new Error("data was out of range (less than min int64)");
        }
      } else {
        if (JSBI.greaterThan(data, MAX_UINT64)) {
          throw new Error("data was out of range (greater than max uint64)");
        } else if (JSBI.lessThan(data, MIN_UINT64)) {
          throw new Error("data was out of range (less than min uint64)");
        }
      }
      return Long.fromString(data.toString(), true);
    };
    var checkBigIntLong = function(data, signed) {
      const { MAX_INT64, MIN_INT64, MAX_UINT64, MIN_UINT64 } = _getBigIntConstants();
      if (typeof data !== "bigint") {
        data = BigInt(data.toString());
      }
      if (signed) {
        if (data > MAX_INT64) {
          throw new Error("data was out of range (greater than max int64)");
        } else if (data < MIN_INT64) {
          throw new Error("data was out of range (less than min int64)");
        }
      } else {
        if (data > MAX_UINT64) {
          throw new Error("data was out of range (greater than max uint64)");
        } else if (data < MIN_UINT64) {
          throw new Error("data was out of range (less than min uint64)");
        }
      }
      return Long.fromString(data.toString(), true);
    };
    var checkLong = function(data, signed) {
      const compat = getBigIntCompat();
      if (compat) {
        return checkJSBILong(data, signed);
      } else {
        return checkBigIntLong(data, signed);
      }
    };
  }
});

// node_modules/dbus-next/lib/marshall.js
var require_marshall = __commonJS({
  "node_modules/dbus-next/lib/marshall.js"(exports2, module2) {
    var assert = require("assert");
    var { parseSignature } = require_signature();
    var put = require_put();
    var Marshallers = require_marshallers();
    var align = require_align().align;
    module2.exports = function marshall(signature, data, offset, fds) {
      if (typeof offset === "undefined") offset = 0;
      const tree = parseSignature(signature);
      if (!Array.isArray(data) || data.length !== tree.length) {
        throw new Error(
          `message body does not match message signature. Body:${JSON.stringify(
            data
          )}, signature:${signature}`
        );
      }
      const putstream = put();
      putstream._offset = offset;
      const buf = writeStruct(putstream, tree, data, fds).buffer();
      return buf;
    };
    function writeStruct(ps, tree, data, fds) {
      if (tree.length !== data.length) {
        throw new Error("Invalid struct data");
      }
      for (let i = 0; i < tree.length; ++i) {
        write(ps, tree[i], data[i], fds);
      }
      return ps;
    }
    function write(ps, ele, data, fds) {
      switch (ele.type) {
        case "(":
        case "{":
          align(ps, 8);
          writeStruct(ps, ele.child, data, fds);
          break;
        case "a": {
          const arrPut = put();
          arrPut._offset = ps._offset;
          const _offset = arrPut._offset;
          writeSimple(arrPut, "u", 0);
          const lengthOffset = arrPut._offset - 4 - _offset;
          if (["x", "t", "d", "{", "("].indexOf(ele.child[0].type) !== -1) {
            align(arrPut, 8);
          }
          const startOffset = arrPut._offset;
          for (let i = 0; i < data.length; ++i) {
            write(arrPut, ele.child[0], data[i], fds);
          }
          const arrBuff = arrPut.buffer();
          const length = arrPut._offset - startOffset;
          arrBuff.writeUInt32LE(length, lengthOffset);
          ps.put(arrBuff);
          ps._offset += arrBuff.length;
          break;
        }
        case "v": {
          assert.strictEqual(data.length, 2, "variant data should be [signature, data]");
          const signatureEle = {
            type: "g",
            child: []
          };
          write(ps, signatureEle, data[0], fds);
          const tree = parseSignature(data[0]);
          assert(tree.length === 1);
          write(ps, tree[0], data[1], fds);
          break;
        }
        case "h": {
          if (fds) {
            const idx = fds.push(data);
            return writeSimple(ps, ele.type, idx - 1);
          }
        }
        default:
          return writeSimple(ps, ele.type, data);
      }
    }
    var stringTypes = ["g", "o", "s"];
    function writeSimple(ps, type, data) {
      if (typeof data === "undefined") {
        throw new Error(
          "Serialisation of JS 'undefined' type is not supported by d-bus"
        );
      }
      if (data === null) {
        throw new Error("Serialisation of null value is not supported by d-bus");
      }
      if (Buffer.isBuffer(data)) data = data.toString();
      if (stringTypes.indexOf(type) !== -1 && typeof data !== "string") {
        throw new Error(
          `Expected string or buffer argument, got ${JSON.stringify(
            data
          )} of type '${type}'`
        );
      }
      const simpleMarshaller = Marshallers.MakeSimpleMarshaller(type);
      simpleMarshaller.marshall(ps, data);
      return ps;
    }
  }
});

// node_modules/dbus-next/lib/dbus-buffer.js
var require_dbus_buffer = __commonJS({
  "node_modules/dbus-next/lib/dbus-buffer.js"(exports2, module2) {
    var { parseSignature } = require_signature();
    var { getBigIntCompat } = require_library_options();
    var JSBI = require_jsbi_cjs();
    var Long = require_long();
    var LE = require_constants().endianness.le;
    function DBusBuffer(buffer, startPos, endian, fds, options) {
      if (typeof options !== "object") {
        options = { ayBuffer: true };
      } else if (options.ayBuffer === void 0) {
        options.ayBuffer = true;
      }
      this.options = options;
      this.buffer = buffer;
      this.endian = endian;
      this.fds = fds;
      this.startPos = startPos || 0;
      this.pos = 0;
    }
    DBusBuffer.prototype.align = function(power) {
      const allbits = (1 << power) - 1;
      const paddedOffset = this.pos + this.startPos + allbits >> power << power;
      this.pos = paddedOffset - this.startPos;
    };
    DBusBuffer.prototype.readInt8 = function() {
      this.pos++;
      return this.buffer[this.pos - 1];
    };
    DBusBuffer.prototype.readSInt16 = function() {
      this.align(1);
      const res = this.endian === LE ? this.buffer.readInt16LE(this.pos) : this.buffer.readInt16BE(this.pos);
      this.pos += 2;
      return res;
    };
    DBusBuffer.prototype.readInt16 = function() {
      this.align(1);
      const res = this.endian === LE ? this.buffer.readUInt16LE(this.pos) : this.buffer.readUInt16BE(this.pos);
      this.pos += 2;
      return res;
    };
    DBusBuffer.prototype.readSInt32 = function() {
      this.align(2);
      const res = this.endian === LE ? this.buffer.readInt32LE(this.pos) : this.buffer.readInt32BE(this.pos);
      this.pos += 4;
      return res;
    };
    DBusBuffer.prototype.readInt32 = function() {
      this.align(2);
      const res = this.endian === LE ? this.buffer.readUInt32LE(this.pos) : this.buffer.readUInt32BE(this.pos);
      this.pos += 4;
      return res;
    };
    DBusBuffer.prototype.readDouble = function() {
      this.align(3);
      const res = this.endian === LE ? this.buffer.readDoubleLE(this.pos) : this.buffer.readDoubleBE(this.pos);
      this.pos += 8;
      return res;
    };
    DBusBuffer.prototype.readString = function(len) {
      if (len === 0) {
        this.pos++;
        return "";
      }
      const res = this.buffer.toString("utf8", this.pos, this.pos + len);
      this.pos += len + 1;
      return res;
    };
    DBusBuffer.prototype.readTree = function readTree(tree) {
      switch (tree.type) {
        case "(":
        case "{":
        case "r":
          this.align(3);
          return this.readStruct(tree.child);
        case "a":
          if (!tree.child || tree.child.length !== 1) {
            throw new Error("Incorrect array element signature");
          }
          return this.readArray(tree.child[0], this.readInt32());
        case "v":
          return this.readVariant();
        default:
          return this.readSimpleType(tree.type);
      }
    };
    DBusBuffer.prototype.read = function read(signature) {
      const tree = parseSignature(signature);
      return this.readStruct(tree);
    };
    DBusBuffer.prototype.readVariant = function readVariant() {
      const signature = this.readSimpleType("g");
      const tree = parseSignature(signature);
      return [tree, this.readStruct(tree)];
    };
    DBusBuffer.prototype.readStruct = function readStruct(struct) {
      const result = [];
      for (let i = 0; i < struct.length; ++i) {
        result.push(this.readTree(struct[i]));
      }
      return result;
    };
    DBusBuffer.prototype.readArray = function readArray(eleType, arrayBlobSize) {
      const result = [];
      const start = this.pos;
      if (eleType.type === "y" && this.options.ayBuffer) {
        this.pos += arrayBlobSize;
        return this.buffer.slice(start, this.pos);
      }
      if (["x", "t", "d", "{", "(", "r"].indexOf(eleType.type) !== -1) {
        this.align(3);
      }
      const end = this.pos + arrayBlobSize;
      while (this.pos < end) {
        result.push(this.readTree(eleType));
      }
      return result;
    };
    DBusBuffer.prototype.readSimpleType = function readSimpleType(t) {
      let len, word0, word1;
      switch (t) {
        case "y":
          return this.readInt8();
        case "b":
          return !!this.readInt32();
        case "n":
          return this.readSInt16();
        case "q":
          return this.readInt16();
        case "h": {
          const idx = this.readInt32();
          if (!this.fds || this.fds.length <= idx) throw new Error("No FDs available");
          return this.fds[idx];
        }
        case "u":
          return this.readInt32();
        case "i":
          return this.readSInt32();
        case "g":
          len = this.readInt8();
          return this.readString(len);
        case "s":
        case "o":
          len = this.readInt32();
          return this.readString(len);
        // TODO: validate object path here
        // if (t === 'o' && !isValidObjectPath(str))
        //  throw new Error('string is not a valid object path'));
        case "x": {
          this.align(3);
          word0 = this.readInt32();
          word1 = this.readInt32();
          const signedLong = new Long(word0, word1, false);
          if (getBigIntCompat()) {
            return JSBI.BigInt(signedLong.toString());
          } else if (typeof BigInt !== "function") {
            throw new Error("BigInt is not supported in this Node version. Use dbus.setBigIntCompat(true) to use a polyfill");
          } else {
            return BigInt(signedLong.toString());
          }
        }
        case "t": {
          this.align(3);
          word0 = this.readInt32();
          word1 = this.readInt32();
          const unsignedLong = new Long(word0, word1, true);
          if (getBigIntCompat()) {
            return JSBI.BigInt(unsignedLong.toString());
          } else if (typeof BigInt !== "function") {
            throw new Error("BigInt is not supported in this Node version. Use dbus.setBigIntCompat(true) to use a polyfill");
          } else {
            return BigInt(unsignedLong.toString());
          }
        }
        case "d":
          return this.readDouble();
        default:
          throw new Error(`Unsupported type: ${t}`);
      }
    };
    module2.exports = DBusBuffer;
  }
});

// node_modules/dbus-next/lib/header-signature.json
var require_header_signature = __commonJS({
  "node_modules/dbus-next/lib/header-signature.json"(exports2, module2) {
    module2.exports = [
      {
        type: "a",
        child: [
          {
            type: "(",
            child: [
              {
                type: "y",
                child: []
              },
              {
                type: "v",
                child: []
              }
            ]
          }
        ]
      }
    ];
  }
});

// node_modules/dbus-next/lib/message.js
var require_message = __commonJS({
  "node_modules/dbus-next/lib/message.js"(exports2, module2) {
    var Buffer2 = require_safe_buffer().Buffer;
    var marshall = require_marshall();
    var constants = require_constants();
    var DBusBuffer = require_dbus_buffer();
    var headerSignature = require_header_signature();
    module2.exports.unmarshalMessages = function messageParser(stream, onMessage, opts) {
      let state = 0;
      let header, fieldsAndBody;
      let fieldsLength, fieldsLengthPadded;
      let fieldsAndBodyLength = 0;
      let bodyLength = 0;
      let endian = 0;
      const LE = constants.endianness.le;
      stream.on("readable", function() {
        while (1) {
          if (state === 0) {
            header = stream.read(16);
            if (!header) {
              break;
            }
            state = 1;
            endian = header.readUInt8(0);
            fieldsLength = endian === LE ? header.readUInt32LE(12) : header.readUInt32BE(12);
            fieldsLengthPadded = fieldsLength + 7 >> 3 << 3;
            bodyLength = endian === LE ? header.readUInt32LE(4) : header.readUInt32BE(4);
            fieldsAndBodyLength = fieldsLengthPadded + bodyLength;
          } else {
            const readBuf = stream.read(fieldsAndBodyLength, null);
            fieldsAndBody = readBuf ? readBuf.data || readBuf : readBuf;
            if (!fieldsAndBody) {
              break;
            }
            state = 0;
            const messageBuffer = new DBusBuffer(fieldsAndBody, 0, endian, readBuf.fds, opts);
            const unmarshalledHeader = messageBuffer.readArray(
              headerSignature[0].child[0],
              fieldsLength
            );
            messageBuffer.align(3);
            let headerName;
            const message = {};
            message.serial = endian === LE ? header.readUInt32LE(8) : header.readUInt32BE(8);
            for (let i = 0; i < unmarshalledHeader.length; ++i) {
              headerName = constants.headerTypeName[unmarshalledHeader[i][0]];
              message[headerName] = unmarshalledHeader[i][1][1][0];
            }
            message.type = header[1];
            message.flags = header[2];
            if (bodyLength > 0 && message.signature) {
              message.body = messageBuffer.read(message.signature);
            }
            onMessage(message);
          }
        }
      });
    };
    module2.exports.unmarshall = function unmarshall(buff, opts) {
      const endian = buff.readUInt8();
      const msgBuf = new DBusBuffer(buff, 0, endian, null, opts);
      const headers = msgBuf.read("yyyyuua(yv)");
      const message = {};
      for (let i = 0; i < headers[6].length; ++i) {
        const headerName = constants.headerTypeName[headers[6][i][0]];
        message[headerName] = headers[6][i][1][1][0];
      }
      message.type = headers[1];
      message.flags = headers[2];
      message.serial = headers[5];
      msgBuf.align(3);
      message.body = msgBuf.read(message.signature);
      return message;
    };
    module2.exports.marshall = function marshallMessage(message) {
      if (!message.serial) throw new Error("Missing or invalid serial");
      const flags = message.flags || 0;
      const type = message.type || constants.messageType.METHOD_CALL;
      let bodyLength = 0;
      let bodyBuff;
      const fds = [];
      if (message.signature && message.body) {
        bodyBuff = marshall(message.signature, message.body, 0, fds);
        bodyLength = bodyBuff.length;
        message.unixFd = fds.length;
      }
      const header = [
        constants.endianness.le,
        type,
        flags,
        constants.protocolVersion,
        bodyLength,
        message.serial
      ];
      const headerBuff = marshall("yyyyuu", header);
      const fields = [];
      constants.headerTypeName.forEach(function(fieldName) {
        const fieldVal = message[fieldName];
        if (fieldVal) {
          fields.push([
            constants.headerTypeId[fieldName],
            [constants.fieldSignature[fieldName], fieldVal]
          ]);
        }
      });
      const fieldsBuff = marshall("a(yv)", [fields], 12);
      const headerLenAligned = headerBuff.length + fieldsBuff.length + 7 >> 3 << 3;
      const messageLen = headerLenAligned + bodyLength;
      const messageBuff = Buffer2.alloc(messageLen);
      headerBuff.copy(messageBuff);
      fieldsBuff.copy(messageBuff, headerBuff.length);
      if (bodyLength > 0) bodyBuff.copy(messageBuff, headerLenAligned);
      return [messageBuff, fds];
    };
  }
});

// node_modules/dbus-next/lib/readline.js
var require_readline = __commonJS({
  "node_modules/dbus-next/lib/readline.js"(exports2, module2) {
    var Buffer2 = require_safe_buffer().Buffer;
    module2.exports = function readOneLine(stream, cb) {
      const bytes = [];
      function readable() {
        while (1) {
          const buf = stream.read(1);
          if (!buf) return;
          const b = buf[0];
          if (b === 10) {
            try {
              cb(Buffer2.from(bytes));
            } catch (error) {
              stream.emit("error", error);
            }
            stream.removeListener("readable", readable);
            return;
          }
          bytes.push(b);
        }
      }
      stream.on("readable", readable);
    };
  }
});

// node_modules/dbus-next/lib/handshake.js
var require_handshake = __commonJS({
  "node_modules/dbus-next/lib/handshake.js"(exports2, module2) {
    var Buffer2 = require_safe_buffer().Buffer;
    var crypto = require("crypto");
    var fs = require("fs");
    var path = require("path");
    var constants = require_constants();
    var readLine = require_readline();
    function sha1(input) {
      const shasum = crypto.createHash("sha1");
      shasum.update(input);
      return shasum.digest("hex");
    }
    function getUserHome() {
      return process.env[process.platform.match(/$win/) ? "USERPROFILE" : "HOME"];
    }
    function getCookie(context, id, cb) {
      const dirname = path.join(getUserHome(), ".dbus-keyrings");
      if (context.length === 0) context = "org_freedesktop_general";
      const filename = path.join(dirname, context);
      fs.stat(dirname, function(err, stat) {
        if (err) return cb(err);
        if (stat.mode & 18) {
          return cb(
            new Error(
              "User keyrings directory is writeable by other users. Aborting authentication"
            )
          );
        }
        if ("getuid" in process && stat.uid !== process.getuid()) {
          return cb(
            new Error(
              "Keyrings directory is not owned by the current user. Aborting authentication!"
            )
          );
        }
        fs.readFile(filename, "ascii", function(err2, keyrings) {
          if (err2) return cb(err2);
          const lines = keyrings.split("\n");
          for (let l = 0; l < lines.length; ++l) {
            const data = lines[l].split(" ");
            if (id === data[0]) return cb(null, data[2]);
          }
          return cb(new Error("cookie not found"));
        });
      });
    }
    function hexlify(input) {
      return Buffer2.from(input.toString(), "ascii").toString("hex");
    }
    module2.exports = function auth(stream, opts, cb) {
      let authMethods;
      if (opts.authMethods) {
        authMethods = opts.authMethods;
      } else {
        authMethods = constants.defaultAuthMethods;
      }
      stream.write("\0");
      tryAuth(stream, authMethods.slice(), cb);
    };
    function tryAuth(stream, methods, cb) {
      if (methods.length === 0) {
        return cb(new Error("No authentication methods left to try"));
      }
      const authMethod = methods.shift();
      const uid = "getuid" in process ? process.getuid() : 0;
      const id = hexlify(uid);
      let guid = "";
      function beginOrNextAuth() {
        readLine(stream, function(line) {
          const ok = line.toString("ascii").match(/^([A-Za-z]+) (.*)/);
          if (ok && ok[1] === "OK") {
            guid = ok[2];
            if (stream.supportsUnixFd) {
              negotiateUnixFd();
            } else {
              stream.write("BEGIN\r\n");
              return cb(null, guid);
            }
          } else {
            if (!methods.empty) {
              tryAuth(stream, methods, cb);
            } else {
              return cb(line);
            }
          }
        });
      }
      function negotiateUnixFd() {
        stream.write("NEGOTIATE_UNIX_FD\r\n");
        readLine(stream, function(line) {
          const res = line.toString("ascii").trim();
          if (res === "AGREE_UNIX_FD") {
          } else if (res === "ERROR") {
            stream.supportsUnixFd = false;
          } else {
            return cb(line);
          }
          stream.write("BEGIN\r\n");
          return cb(null, guid);
        });
      }
      switch (authMethod) {
        case "EXTERNAL":
          stream.write(`AUTH ${authMethod} ${id}\r
`);
          beginOrNextAuth();
          break;
        case "DBUS_COOKIE_SHA1":
          stream.write(`AUTH ${authMethod} ${id}\r
`);
          readLine(stream, function(line) {
            const data = Buffer2.from(
              line.toString().split(" ")[1].trim(),
              "hex"
            ).toString().split(" ");
            const cookieContext = data[0];
            const cookieId = data[1];
            const serverChallenge = data[2];
            const clientChallenge = crypto.randomBytes(16).toString("hex");
            getCookie(cookieContext, cookieId, function(err, cookie) {
              if (err) return cb(err);
              const response = sha1(
                [serverChallenge, clientChallenge, cookie].join(":")
              );
              const reply = hexlify(clientChallenge + response);
              stream.write(`DATA ${reply}\r
`);
              beginOrNextAuth();
            });
          });
          break;
        case "ANONYMOUS":
          stream.write("AUTH ANONYMOUS \r\n");
          beginOrNextAuth();
          break;
        default:
          console.error(`Unsupported auth method: ${authMethod}`);
          beginOrNextAuth();
          break;
      }
    }
  }
});

// node_modules/dbus-next/lib/address-x11.js
var require_address_x11 = __commonJS({
  "node_modules/dbus-next/lib/address-x11.js"(exports2, module2) {
    var fs = require("fs");
    var os2 = require("os");
    function getDbusAddressFromWindowSelection(callback) {
      const x11 = require("x11");
      if (x11 === null) {
        throw new Error("cannot get session bus address from window selection: dbus-next was installed without x11 support");
      }
      fs.readFile("/var/lib/dbus/machine-id", "ascii", function(err, uuid) {
        if (err) return callback(err);
        const hostname2 = os2.hostname().split("-")[0];
        x11.createClient(function(err2, display) {
          if (err2) return callback(err2);
          const X = display.client;
          const selectionName = `_DBUS_SESSION_BUS_SELECTION_${hostname2}_${uuid.trim()}`;
          X.InternAtom(false, selectionName, function(err3, id) {
            if (err3) return callback(err3);
            X.GetSelectionOwner(id, function(err4, win) {
              if (err4) return callback(err4);
              X.InternAtom(false, "_DBUS_SESSION_BUS_ADDRESS", function(err5, propId) {
                if (err5) return callback(err5);
                win = display.screen[0].root;
                X.GetProperty(0, win, propId, 0, 0, 1e7, function(err6, val) {
                  if (err6) return callback(err6);
                  callback(null, val.data.toString());
                });
              });
            });
          });
        });
      });
    }
    function getDbusAddressFromFs() {
      const home = process.env.HOME;
      const display = process.env.DISPLAY;
      if (!display) {
        throw new Error("could not get DISPLAY environment variable to get dbus address");
      }
      const reg = /.*:([0-9]+)\.?.*/;
      const match = display.match(reg);
      if (!match || !match[1]) {
        throw new Error("could not parse DISPLAY environment variable to get dbus address");
      }
      const displayNum = match[1];
      const machineId = fs.readFileSync("/var/lib/dbus/machine-id").toString().trim();
      const dbusInfo = fs.readFileSync(`${home}/.dbus/session-bus/${machineId}-${displayNum}`).toString().trim();
      for (let line of dbusInfo.split("\n")) {
        line = line.trim();
        if (line.startsWith("DBUS_SESSION_BUS_ADDRESS=")) {
          let address = line.split("DBUS_SESSION_BUS_ADDRESS=")[1];
          if (!address) {
            throw new Error("DBUS_SESSION_BUS_ADDRESS variable is set incorrectly in dbus info file");
          }
          const removeQuotes = /^['"]?(.*?)['"]?$/;
          address = address.match(removeQuotes)[1];
          return address;
        }
      }
      throw new Error("DBUS_SESSION_BUS_ADDRESS was not set in dbus info file");
    }
    module2.exports = {
      getDbusAddressFromFs,
      getDbusAddressFromWindowSelection
    };
  }
});

// node_modules/dbus-next/lib/marshall-compat.js
var require_marshall_compat = __commonJS({
  "node_modules/dbus-next/lib/marshall-compat.js"(exports2, module2) {
    var { parseSignature, collapseSignature } = require_signature();
    var { Variant } = require_variant();
    var message = require_message();
    function valueIsMarshallVariant(value) {
      return Array.isArray(value) && value.length === 2 && Array.isArray(value[0]) && value[0].length > 0 && value[0][0].type;
    }
    function marshallVariantToJs(variant) {
      const type = variant[0][0];
      const value = variant[1][0];
      if (!type.child.length) {
        if (valueIsMarshallVariant(value)) {
          return new Variant(collapseSignature(value[0][0]), marshallVariantToJs(value));
        } else {
          return value;
        }
      }
      if (type.type === "a") {
        if (type.child[0].type === "y") {
          return value;
        } else if (type.child[0].type === "{") {
          const result = {};
          for (let i = 0; i < value.length; ++i) {
            result[value[i][0]] = marshallVariantToJs([[type.child[0].child[1]], [value[i][1]]]);
          }
          return result;
        } else {
          const result = [];
          for (let i = 0; i < value.length; ++i) {
            result[i] = marshallVariantToJs([[type.child[0]], [value[i]]]);
          }
          return result;
        }
      } else if (type.type === "(") {
        const result = [];
        for (let i = 0; i < value.length; ++i) {
          result[i] = marshallVariantToJs([[type.child[i]], [value[i]]]);
        }
        return result;
      }
    }
    function messageToJsFmt(message2) {
      const { signature = "", body = [] } = message2;
      const bodyJs = [];
      const signatureTree = parseSignature(signature);
      for (let i = 0; i < signatureTree.length; ++i) {
        const tree = signatureTree[i];
        bodyJs.push(marshallVariantToJs([[tree], [body[i]]]));
      }
      message2.body = bodyJs;
      message2.signature = signature;
      return message2;
    }
    function jsToMarshalFmt(signature, value) {
      if (value === void 0) {
        throw new Error(`expected value for signature: ${signature}`);
      }
      if (signature === void 0) {
        throw new Error(`expected signature for value: ${value}`);
      }
      let signatureStr = null;
      if (typeof signature === "string") {
        signatureStr = signature;
        signature = parseSignature(signature)[0];
      } else {
        signatureStr = collapseSignature(signature);
      }
      if (signature.child.length === 0) {
        if (signature.type === "v") {
          if (value.constructor !== Variant) {
            throw new Error(`expected a Variant for value (got ${typeof value})`);
          }
          return [signature.type, jsToMarshalFmt(value.signature, value.value)];
        } else {
          return [signature.type, value];
        }
      }
      if (signature.type === "a" && signature.child[0].type === "y" && value.constructor === Buffer) {
        return [signatureStr, value];
      } else if (signature.type === "a") {
        let result = [];
        if (signature.child[0].type === "y") {
          result = value;
        } else if (signature.child[0].type === "{") {
          if (value.constructor !== Object) {
            throw new Error(`expecting an object for signature '${signatureStr}' (got ${typeof value})`);
          }
          for (const k of Object.keys(value)) {
            const v = value[k];
            if (v.constructor === Variant) {
              result.push([k, jsToMarshalFmt(v.signature, v.value)]);
            } else {
              result.push([k, jsToMarshalFmt(signature.child[0].child[1], v)[1]]);
            }
          }
        } else {
          if (!Array.isArray(value)) {
            throw new Error(`expecting an array for signature '${signatureStr}' (got ${typeof value})`);
          }
          for (const v of value) {
            if (v.constructor === Variant) {
              result.push(jsToMarshalFmt(v.signature, v.value));
            } else {
              result.push(jsToMarshalFmt(signature.child[0], v)[1]);
            }
          }
        }
        return [signatureStr, result];
      } else if (signature.type === "(") {
        if (!Array.isArray(value)) {
          throw new Error(`expecting an array for signature '${signatureStr}' (got ${typeof value})`);
        }
        if (value.length !== signature.child.length) {
          throw new Error(`expecting struct to have ${signature.child.length} members (got ${value.length} members)`);
        }
        const result = [];
        for (let i = 0; i < value.length; ++i) {
          const v = value[i];
          if (signature.child[i] === "v") {
            if (v.constructor !== Variant) {
              throw new Error(`expected a Variant for struct member ${i + 1} (got ${v})`);
            }
            result.push(jsToMarshalFmt(v.signature, v.value));
          } else {
            result.push(jsToMarshalFmt(signature.child[i], v)[1]);
          }
        }
        return [signatureStr, result];
      } else {
        throw new Error(`got unknown complex type: ${signature.type}`);
      }
    }
    function marshallMessage(msg) {
      const { signature = "", body = [] } = msg;
      const signatureTree = parseSignature(signature);
      if (signatureTree.length !== body.length) {
        throw new Error(`Expected ${signatureTree.length} body elements for signature '${signature}' (got ${body.length})`);
      }
      const marshallerBody = [];
      for (let i = 0; i < body.length; ++i) {
        if (signatureTree[i].type === "v") {
          if (body[i].constructor !== Variant) {
            throw new Error(`Expected a Variant() argument for position ${i + 1} (value='${body[i]}')`);
          }
          marshallerBody.push(jsToMarshalFmt(body[i].signature, body[i].value));
        } else {
          marshallerBody.push(jsToMarshalFmt(signatureTree[i], body[i])[1]);
        }
      }
      msg.signature = signature;
      msg.body = marshallerBody;
      return message.marshall(msg);
    }
    module2.exports = {
      messageToJsFmt,
      marshallMessage
    };
  }
});

// node_modules/through/index.js
var require_through = __commonJS({
  "node_modules/through/index.js"(exports2, module2) {
    var Stream = require("stream");
    exports2 = module2.exports = through;
    through.through = through;
    function through(write, end, opts) {
      write = write || function(data) {
        this.queue(data);
      };
      end = end || function() {
        this.queue(null);
      };
      var ended = false, destroyed = false, buffer = [], _ended = false;
      var stream = new Stream();
      stream.readable = stream.writable = true;
      stream.paused = false;
      stream.autoDestroy = !(opts && opts.autoDestroy === false);
      stream.write = function(data) {
        write.call(this, data);
        return !stream.paused;
      };
      function drain() {
        while (buffer.length && !stream.paused) {
          var data = buffer.shift();
          if (null === data)
            return stream.emit("end");
          else
            stream.emit("data", data);
        }
      }
      stream.queue = stream.push = function(data) {
        if (_ended) return stream;
        if (data === null) _ended = true;
        buffer.push(data);
        drain();
        return stream;
      };
      stream.on("end", function() {
        stream.readable = false;
        if (!stream.writable && stream.autoDestroy)
          process.nextTick(function() {
            stream.destroy();
          });
      });
      function _end() {
        stream.writable = false;
        end.call(stream);
        if (!stream.readable && stream.autoDestroy)
          stream.destroy();
      }
      stream.end = function(data) {
        if (ended) return;
        ended = true;
        if (arguments.length) stream.write(data);
        _end();
        return stream;
      };
      stream.destroy = function() {
        if (destroyed) return;
        destroyed = true;
        ended = true;
        buffer.length = 0;
        stream.writable = stream.readable = false;
        stream.emit("close");
        return stream;
      };
      stream.pause = function() {
        if (stream.paused) return;
        stream.paused = true;
        return stream;
      };
      stream.resume = function() {
        if (stream.paused) {
          stream.paused = false;
          stream.emit("resume");
        }
        drain();
        if (!stream.paused)
          stream.emit("drain");
        return stream;
      };
      return stream;
    }
  }
});

// node_modules/from/index.js
var require_from = __commonJS({
  "node_modules/from/index.js"(exports2, module2) {
    "use strict";
    var Stream = require("stream");
    module2.exports = function from(source) {
      if (Array.isArray(source)) {
        var source_index = 0, source_len = source.length;
        return from(function(i2) {
          if (source_index < source_len)
            this.emit("data", source[source_index++]);
          else
            this.emit("end");
          return true;
        });
      }
      var s = new Stream(), i = 0;
      s.ended = false;
      s.started = false;
      s.readable = true;
      s.writable = false;
      s.paused = false;
      s.ended = false;
      s.pause = function() {
        s.started = true;
        s.paused = true;
      };
      function next() {
        s.started = true;
        if (s.ended) return;
        while (!s.ended && !s.paused && source.call(s, i++, function() {
          if (!s.ended && !s.paused)
            process.nextTick(next);
        }))
          ;
      }
      s.resume = function() {
        s.started = true;
        s.paused = false;
        next();
      };
      s.on("end", function() {
        s.ended = true;
        s.readable = false;
        process.nextTick(s.destroy);
      });
      s.destroy = function() {
        s.ended = true;
        s.emit("close");
      };
      process.nextTick(function() {
        if (!s.started) s.resume();
      });
      return s;
    };
  }
});

// node_modules/duplexer/index.js
var require_duplexer = __commonJS({
  "node_modules/duplexer/index.js"(exports2, module2) {
    var Stream = require("stream");
    var writeMethods = ["write", "end", "destroy"];
    var readMethods = ["resume", "pause"];
    var readEvents = ["data", "close"];
    var slice = Array.prototype.slice;
    module2.exports = duplex;
    function forEach(arr, fn) {
      if (arr.forEach) {
        return arr.forEach(fn);
      }
      for (var i = 0; i < arr.length; i++) {
        fn(arr[i], i);
      }
    }
    function duplex(writer, reader) {
      var stream = new Stream();
      var ended = false;
      forEach(writeMethods, proxyWriter);
      forEach(readMethods, proxyReader);
      forEach(readEvents, proxyStream);
      reader.on("end", handleEnd);
      writer.on("drain", function() {
        stream.emit("drain");
      });
      writer.on("error", reemit);
      reader.on("error", reemit);
      stream.writable = writer.writable;
      stream.readable = reader.readable;
      return stream;
      function proxyWriter(methodName) {
        stream[methodName] = method;
        function method() {
          return writer[methodName].apply(writer, arguments);
        }
      }
      function proxyReader(methodName) {
        stream[methodName] = method;
        function method() {
          stream.emit(methodName);
          var func = reader[methodName];
          if (func) {
            return func.apply(reader, arguments);
          }
          reader.emit(methodName);
        }
      }
      function proxyStream(methodName) {
        reader.on(methodName, reemit2);
        function reemit2() {
          var args = slice.call(arguments);
          args.unshift(methodName);
          stream.emit.apply(stream, args);
        }
      }
      function handleEnd() {
        if (ended) {
          return;
        }
        ended = true;
        var args = slice.call(arguments);
        args.unshift("end");
        stream.emit.apply(stream, args);
      }
      function reemit(err) {
        stream.emit("error", err);
      }
    }
  }
});

// node_modules/map-stream/index.js
var require_map_stream = __commonJS({
  "node_modules/map-stream/index.js"(exports2, module2) {
    var Stream = require("stream").Stream;
    module2.exports = function(mapper, opts) {
      var stream = new Stream(), self = this, inputs = 0, outputs = 0, ended = false, paused = false, destroyed = false, lastWritten = 0, inNext = false;
      this.opts = opts || {};
      var errorEventName = this.opts.failures ? "failure" : "error";
      var writeQueue = {};
      stream.writable = true;
      stream.readable = true;
      function queueData(data, number) {
        var nextToWrite = lastWritten + 1;
        if (number === nextToWrite) {
          if (data !== void 0) {
            stream.emit.apply(stream, ["data", data]);
          }
          lastWritten++;
          nextToWrite++;
        } else {
          writeQueue[number] = data;
        }
        if (writeQueue.hasOwnProperty(nextToWrite)) {
          var dataToWrite = writeQueue[nextToWrite];
          delete writeQueue[nextToWrite];
          return queueData(dataToWrite, nextToWrite);
        }
        outputs++;
        if (inputs === outputs) {
          if (paused) paused = false, stream.emit("drain");
          if (ended) end();
        }
      }
      function next(err, data, number) {
        if (destroyed) return;
        inNext = true;
        if (!err || self.opts.failures) {
          queueData(data, number);
        }
        if (err) {
          stream.emit.apply(stream, [errorEventName, err]);
        }
        inNext = false;
      }
      function wrappedMapper(input, number, callback) {
        return mapper.call(null, input, function(err, data) {
          callback(err, data, number);
        });
      }
      stream.write = function(data) {
        if (ended) throw new Error("map stream is not writable");
        inNext = false;
        inputs++;
        try {
          var written = wrappedMapper(data, inputs, next);
          paused = written === false;
          return !paused;
        } catch (err) {
          if (inNext)
            throw err;
          next(err);
          return !paused;
        }
      };
      function end(data) {
        ended = true;
        stream.writable = false;
        if (data !== void 0) {
          return queueData(data, inputs);
        } else if (inputs == outputs) {
          stream.readable = false, stream.emit("end"), stream.destroy();
        }
      }
      stream.end = function(data) {
        if (ended) return;
        end();
      };
      stream.destroy = function() {
        ended = destroyed = true;
        stream.writable = stream.readable = paused = false;
        process.nextTick(function() {
          stream.emit("close");
        });
      };
      stream.pause = function() {
        paused = true;
      };
      stream.resume = function() {
        paused = false;
      };
      return stream;
    };
  }
});

// node_modules/pause-stream/index.js
var require_pause_stream = __commonJS({
  "node_modules/pause-stream/index.js"(exports2, module2) {
    module2.exports = require_through();
  }
});

// node_modules/split/index.js
var require_split = __commonJS({
  "node_modules/split/index.js"(exports2, module2) {
    var through = require_through();
    var Decoder = require("string_decoder").StringDecoder;
    module2.exports = split;
    function split(matcher, mapper, options) {
      var decoder = new Decoder();
      var soFar = "";
      var maxLength = options && options.maxLength;
      if ("function" === typeof matcher)
        mapper = matcher, matcher = null;
      if (!matcher)
        matcher = /\r?\n/;
      function emit(stream, piece) {
        if (mapper) {
          try {
            piece = mapper(piece);
          } catch (err) {
            return stream.emit("error", err);
          }
          if ("undefined" !== typeof piece)
            stream.queue(piece);
        } else
          stream.queue(piece);
      }
      function next(stream, buffer) {
        var pieces = ((soFar != null ? soFar : "") + buffer).split(matcher);
        soFar = pieces.pop();
        if (maxLength && soFar.length > maxLength)
          stream.emit("error", new Error("maximum buffer reached"));
        for (var i = 0; i < pieces.length; i++) {
          var piece = pieces[i];
          emit(stream, piece);
        }
      }
      return through(
        function(b) {
          next(this, decoder.write(b));
        },
        function() {
          if (decoder.end)
            next(this, decoder.end());
          if (soFar != null)
            emit(this, soFar);
          this.queue(null);
        }
      );
    }
  }
});

// node_modules/stream-combiner/index.js
var require_stream_combiner = __commonJS({
  "node_modules/stream-combiner/index.js"(exports2, module2) {
    var duplexer = require_duplexer();
    module2.exports = function() {
      var streams = [].slice.call(arguments), first = streams[0], last = streams[streams.length - 1], thepipe = duplexer(first, last);
      if (streams.length == 1)
        return streams[0];
      else if (!streams.length)
        throw new Error("connect called with empty args");
      function recurse(streams2) {
        if (streams2.length < 2)
          return;
        streams2[0].pipe(streams2[1]);
        recurse(streams2.slice(1));
      }
      recurse(streams);
      function onerror() {
        var args = [].slice.call(arguments);
        args.unshift("error");
        thepipe.emit.apply(thepipe, args);
      }
      for (var i = 1; i < streams.length - 1; i++)
        streams[i].on("error", onerror);
      return thepipe;
    };
  }
});

// node_modules/event-stream/index.js
var require_event_stream = __commonJS({
  "node_modules/event-stream/index.js"(exports2) {
    var Stream = require("stream").Stream;
    var es = exports2;
    var through = require_through();
    var from = require_from();
    var duplex = require_duplexer();
    var map = require_map_stream();
    var pause = require_pause_stream();
    var split = require_split();
    var pipeline = require_stream_combiner();
    var immediately = global.setImmediate || process.nextTick;
    es.Stream = Stream;
    es.through = through;
    es.from = from;
    es.duplex = duplex;
    es.map = map;
    es.pause = pause;
    es.split = split;
    es.pipeline = es.connect = es.pipe = pipeline;
    es.concat = //actually this should be called concat
    es.merge = function() {
      var toMerge = [].slice.call(arguments);
      if (toMerge.length === 1 && toMerge[0] instanceof Array) {
        toMerge = toMerge[0];
      }
      var stream = new Stream();
      stream.setMaxListeners(0);
      var endCount = 0;
      stream.writable = stream.readable = true;
      if (toMerge.length) {
        toMerge.forEach(function(e) {
          e.pipe(stream, { end: false });
          var ended = false;
          e.on("end", function() {
            if (ended) return;
            ended = true;
            endCount++;
            if (endCount == toMerge.length)
              stream.emit("end");
          });
        });
      } else {
        process.nextTick(function() {
          stream.emit("end");
        });
      }
      stream.write = function(data) {
        this.emit("data", data);
      };
      stream.destroy = function() {
        toMerge.forEach(function(e) {
          if (e.destroy) e.destroy();
        });
      };
      return stream;
    };
    es.writeArray = function(done) {
      if ("function" !== typeof done)
        throw new Error("function writeArray (done): done must be function");
      var a = new Stream(), array = [], isDone = false;
      a.write = function(l) {
        array.push(l);
      };
      a.end = function() {
        isDone = true;
        done(null, array);
      };
      a.writable = true;
      a.readable = false;
      a.destroy = function() {
        a.writable = a.readable = false;
        if (isDone) return;
        done(new Error("destroyed before end"), array);
      };
      return a;
    };
    es.readArray = function(array) {
      var stream = new Stream(), i = 0, paused = false, ended = false;
      stream.readable = true;
      stream.writable = false;
      if (!Array.isArray(array))
        throw new Error("event-stream.read expects an array");
      stream.resume = function() {
        if (ended) return;
        paused = false;
        var l = array.length;
        while (i < l && !paused && !ended) {
          stream.emit("data", array[i++]);
        }
        if (i == l && !ended)
          ended = true, stream.readable = false, stream.emit("end");
      };
      process.nextTick(stream.resume);
      stream.pause = function() {
        paused = true;
      };
      stream.destroy = function() {
        ended = true;
        stream.emit("close");
      };
      return stream;
    };
    es.readable = function(func, continueOnError) {
      var stream = new Stream(), i = 0, paused = false, ended = false, reading = false;
      stream.readable = true;
      stream.writable = false;
      if ("function" !== typeof func)
        throw new Error("event-stream.readable expects async function");
      stream.on("end", function() {
        ended = true;
      });
      function get(err, data) {
        if (err) {
          stream.emit("error", err);
          if (!continueOnError) stream.emit("end");
        } else if (arguments.length > 1)
          stream.emit("data", data);
        immediately(function() {
          if (ended || paused || reading) return;
          try {
            reading = true;
            func.call(stream, i++, function() {
              reading = false;
              get.apply(null, arguments);
            });
          } catch (err2) {
            stream.emit("error", err2);
          }
        });
      }
      stream.resume = function() {
        paused = false;
        get();
      };
      process.nextTick(get);
      stream.pause = function() {
        paused = true;
      };
      stream.destroy = function() {
        stream.emit("end");
        stream.emit("close");
        ended = true;
      };
      return stream;
    };
    es.mapSync = function(sync) {
      return es.through(function write(data) {
        var mappedData;
        try {
          mappedData = sync(data);
        } catch (err) {
          return this.emit("error", err);
        }
        if (mappedData !== void 0)
          this.emit("data", mappedData);
      });
    };
    es.log = function(name) {
      return es.through(function(data) {
        var args = [].slice.call(arguments);
        if (name) console.error(name, data);
        else console.error(data);
        this.emit("data", data);
      });
    };
    es.child = function(child) {
      return es.duplex(child.stdin, child.stdout);
    };
    es.parse = function(options) {
      var emitError = !!(options ? options.error : false);
      return es.through(function(data) {
        var obj;
        try {
          if (data)
            obj = JSON.parse(data.toString());
        } catch (err) {
          if (emitError)
            return this.emit("error", err);
          return console.error(err, "attempting to parse:", data);
        }
        if (obj !== void 0)
          this.emit("data", obj);
      });
    };
    es.stringify = function() {
      var Buffer2 = require("buffer").Buffer;
      return es.mapSync(function(e) {
        return JSON.stringify(Buffer2.isBuffer(e) ? e.toString() : e) + "\n";
      });
    };
    es.replace = function(from2, to) {
      return es.pipeline(es.split(from2), es.join(to));
    };
    es.join = function(str) {
      if ("function" === typeof str)
        return es.wait(str);
      var first = true;
      return es.through(function(data) {
        if (!first)
          this.emit("data", str);
        first = false;
        this.emit("data", data);
        return true;
      });
    };
    es.wait = function(callback) {
      var arr = [];
      return es.through(
        function(data) {
          arr.push(data);
        },
        function() {
          var body = Buffer.isBuffer(arr[0]) ? Buffer.concat(arr) : arr.join("");
          this.emit("data", body);
          this.emit("end");
          if (callback) callback(null, body);
        }
      );
    };
    es.pipeable = function() {
      throw new Error("[EVENT-STREAM] es.pipeable is deprecated");
    };
  }
});

// node_modules/dbus-next/lib/connection.js
var require_connection = __commonJS({
  "node_modules/dbus-next/lib/connection.js"(exports2, module2) {
    var EventEmitter = require("events").EventEmitter;
    var net = require("net");
    var message = require_message();
    var clientHandshake = require_handshake();
    var { getDbusAddressFromFs } = require_address_x11();
    var { Message } = require_message_type();
    var { messageToJsFmt, marshallMessage } = require_marshall_compat();
    function createStream(opts) {
      let { busAddress, negotiateUnixFd } = opts;
      if (negotiateUnixFd === void 0) {
        negotiateUnixFd = false;
      }
      if (!busAddress) {
        busAddress = process.env.DBUS_SESSION_BUS_ADDRESS;
      }
      if (!busAddress) {
        busAddress = getDbusAddressFromFs();
      }
      const addresses = busAddress.split(";");
      for (let i = 0; i < addresses.length; ++i) {
        const address = addresses[i];
        const familyParams = address.split(":");
        const family = familyParams[0];
        const params = {};
        familyParams[1].split(",").forEach(function(p) {
          const keyVal = p.split("=");
          params[keyVal[0]] = keyVal[1];
        });
        try {
          switch (family.toLowerCase()) {
            case "tcp": {
              const host = params.host || "localhost";
              const port2 = params.port;
              return net.createConnection(port2, host);
            }
            case "unix": {
              if (params.socket) {
                return net.createConnection(params.socket);
              }
              if (params.abstract) {
                const usocket = require("usocket");
                const sock = new usocket.USocket({ path: "\0" + params.abstract });
                sock.supportsUnixFd = negotiateUnixFd;
                return sock;
              }
              if (params.path) {
                try {
                  const usocket = require("usocket");
                  const sock = new usocket.USocket({ path: params.path });
                  sock.supportsUnixFd = negotiateUnixFd;
                  return sock;
                } catch (err) {
                  return net.createConnection(params.path);
                }
              }
              throw new Error(
                "not enough parameters for 'unix' connection - you need to specify 'socket' or 'abstract' or 'path' parameter"
              );
            }
            case "unixexec": {
              const eventStream = require_event_stream();
              const spawn = require("child_process").spawn;
              const args = [];
              for (let n = 1; params["arg" + n]; n++) args.push(params["arg" + n]);
              const child = spawn(params.path, args);
              setTimeout(() => eventStream.emit("connected"), 0);
              return eventStream.duplex(child.stdin, child.stdout);
            }
            default: {
              throw new Error("unknown address type:" + family);
            }
          }
        } catch (e) {
          if (i < addresses.length - 1) {
            console.warn(e.message);
            continue;
          } else {
            throw e;
          }
        }
      }
    }
    function createConnection(opts) {
      const self = new EventEmitter();
      opts = opts || {};
      const stream = self.stream = createStream(opts);
      stream.setNoDelay && stream.setNoDelay();
      stream.on("error", function(err) {
        self.emit("error", err);
      });
      stream.on("end", function() {
        self.emit("end");
        self.message = function() {
          self.emit("error", new Error("Tried to write a message to a closed stream"));
        };
      });
      self.end = function() {
        stream.end();
        return self;
      };
      function afterHandshake(error, guid) {
        if (error) {
          return self.emit("error", error);
        }
        self.guid = guid;
        self.emit("connect");
        message.unmarshalMessages(
          stream,
          function(message2) {
            try {
              message2 = new Message(messageToJsFmt(message2));
            } catch (err) {
              self.emit("error", err, `There was an error receiving a message (this is probably a bug in dbus-next): ${message2}`);
              return;
            }
            self.emit("message", message2);
          },
          opts
        );
      }
      stream.once("connect", () => clientHandshake(stream, opts, afterHandshake));
      stream.once("connected", () => clientHandshake(stream, opts, afterHandshake));
      self._messages = [];
      self.message = function(msg) {
        self._messages.push(msg);
      };
      self.once("connect", function() {
        self.state = "connected";
        for (let i = 0; i < self._messages.length; ++i) {
          const [data, fds] = marshallMessage(self._messages[i]);
          if (stream.supportsUnixFd) {
            stream.write({ data, fds });
          } else {
            stream.write(data);
          }
        }
        self._messages.length = 0;
        self.message = function(msg) {
          if (!stream.writable) {
            throw new Error("Cannot send message, stream is closed");
          }
          const [data, fds] = marshallMessage(msg);
          if (stream.supportsUnixFd) {
            stream.write({ data, fds });
          } else {
            if (fds.length > 0) {
              console.warn("Sending file descriptors is not supported in current bus connection");
            }
            stream.write(data);
          }
        };
      });
      return self;
    }
    module2.exports = createConnection;
  }
});

// node_modules/dbus-next/index.js
var require_dbus_next = __commonJS({
  "node_modules/dbus-next/index.js"(exports2, module2) {
    var constants = require_constants();
    var MessageBus = require_bus();
    var errors = require_errors();
    var { Variant } = require_variant();
    var { Message } = require_message_type();
    var iface = require_interface();
    var createConnection = require_connection();
    var createClient = function(params) {
      let connection = createConnection(params || {});
      return new MessageBus(connection);
    };
    module2.exports.systemBus = function(opts) {
      if (!opts)
        opts = {};
      return createClient({
        negotiateUnixFd: opts.negotiateUnixFd,
        busAddress: process.env.DBUS_SYSTEM_BUS_ADDRESS || "unix:path=/var/run/dbus/system_bus_socket"
      });
    };
    module2.exports.sessionBus = function(opts) {
      return createClient(opts);
    };
    module2.exports.setBigIntCompat = require_library_options().setBigIntCompat;
    module2.exports.NameFlag = constants.NameFlag;
    module2.exports.RequestNameReply = constants.RequestNameReply;
    module2.exports.ReleaseNameReply = constants.ReleaseNameReply;
    module2.exports.MessageType = constants.MessageType;
    module2.exports.MessageFlag = constants.MessageFlag;
    module2.exports.interface = iface;
    module2.exports.Variant = Variant;
    module2.exports.Message = Message;
    module2.exports.validators = require_validators();
    module2.exports.DBusError = errors.DBusError;
  }
});

// src/node/k4-advertise.ts
var os = __toESM(require("os"));
var dbus = __toESM(require_dbus_next());

// src/node/serviceName.ts
var MAX_NAME_BYTES = 63;
function serviceName(host, port2) {
  const suffix = ` - Knobbler4 Device :${port2}`;
  let h = host.trim() || "Push";
  while (h.length > 1 && Buffer.byteLength(h + suffix) > MAX_NAME_BYTES) {
    h = h.slice(0, -1);
  }
  return h + suffix;
}
function parsePort(value) {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n)) return null;
  return n >= 1 && n <= 65535 ? n : null;
}

// src/node/k4-advertise.ts
var maxApi = null;
try {
  maxApi = require("max-api");
} catch (_) {
  maxApi = null;
}
var log = (...args) => maxApi ? maxApi.post("k4-advertise:", ...args) : console.log(...args);
var AVAHI = "org.freedesktop.Avahi";
var IF_UNSPEC = -1;
var PROTO_UNSPEC = -1;
var SERVICE_TYPE = "_osc._udp";
var GROUP_ESTABLISHED = 2;
var GROUP_COLLISION = 3;
var GROUP_FAILURE = 4;
var COLLISION_ERROR = "org.freedesktop.Avahi.CollisionError";
var MAX_RENAMES = 10;
var port = null;
var alternativeName = null;
var bus = null;
var server = null;
var group = null;
var queue = Promise.resolve();
function schedule(fn) {
  queue = queue.then(fn).catch((e) => log("error:", e && e.message));
}
function currentName() {
  return alternativeName || serviceName(os.hostname(), port);
}
async function connect() {
  if (server) return true;
  if (!bus) {
    try {
      bus = dbus.systemBus();
    } catch (e) {
      log("no system D-Bus, not advertising:", e.message);
      return false;
    }
    bus.on("error", (e) => {
      log("system D-Bus unavailable, not advertising:", e.message);
      bus = null;
      server = null;
      group = null;
    });
    const dbusObj = await bus.getProxyObject(
      "org.freedesktop.DBus",
      "/org/freedesktop/DBus"
    );
    const dbusIface = dbusObj.getInterface("org.freedesktop.DBus");
    dbusIface.on(
      "NameOwnerChanged",
      (name, _old, owner) => {
        if (name !== AVAHI) return;
        server = null;
        group = null;
        if (owner) {
          log("avahi restarted, re-publishing");
          schedule(publish);
        }
      }
    );
  }
  try {
    const serverObj = await bus.getProxyObject(AVAHI, "/");
    server = serverObj.getInterface("org.freedesktop.Avahi.Server");
    return true;
  } catch (e) {
    log("avahi not available yet:", e.message);
    return false;
  }
}
async function publish() {
  if (port == null) return;
  if (!await connect()) return;
  if (!group) {
    const path = await server.EntryGroupNew();
    const groupObj = await bus.getProxyObject(AVAHI, path);
    const g = groupObj.getInterface("org.freedesktop.Avahi.EntryGroup");
    g.on("StateChanged", (state, error) => {
      if (g !== group) return;
      if (state === GROUP_ESTABLISHED) {
        log(`advertising "${currentName()}" (${SERVICE_TYPE} port ${port})`);
      } else if (state === GROUP_COLLISION) {
        schedule(async () => {
          await rename();
          await publish();
        });
      } else if (state === GROUP_FAILURE) {
        log("avahi failed to publish:", error);
      }
    });
    group = g;
  } else {
    await group.Reset();
  }
  for (let attempt = 0; ; attempt++) {
    try {
      await group.AddService(
        IF_UNSPEC,
        PROTO_UNSPEC,
        0,
        currentName(),
        SERVICE_TYPE,
        "",
        "",
        port,
        []
      );
      break;
    } catch (e) {
      const type = e.type;
      if (type !== COLLISION_ERROR || attempt >= MAX_RENAMES) throw e;
      await rename();
    }
  }
  await group.Commit();
}
async function rename() {
  alternativeName = await server.GetAlternativeServiceName(currentName());
  log("name in use, renaming to", alternativeName);
}
function setPort(value) {
  const p = parsePort(value);
  if (p == null) {
    log("ignoring invalid port", value);
    return;
  }
  if (p === port) return;
  port = p;
  alternativeName = null;
  schedule(publish);
}
if (maxApi) {
  maxApi.addHandler("port", setPort);
} else {
  setPort(process.argv[2] || "2346");
  const stop = () => {
    if (bus) bus.disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
/*! Bundled license information:

sax/lib/sax.js:
  (*! http://mths.be/fromcodepoint v0.1.0 by @mathias *)

safe-buffer/index.js:
  (*! safe-buffer. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> *)
*/
