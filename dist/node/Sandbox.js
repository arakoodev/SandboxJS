"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecReturn = void 0;
class ExecReturn {
    constructor(auditReport, result, returned, breakLoop = false, continueLoop = false) {
        this.auditReport = auditReport;
        this.result = result;
        this.returned = returned;
        this.breakLoop = breakLoop;
        this.continueLoop = continueLoop;
    }
}
exports.ExecReturn = ExecReturn;
class Prop {
    constructor(context, prop, isConst = false, isGlobal = false, isVariable = false) {
        this.context = context;
        this.prop = prop;
        this.isConst = isConst;
        this.isGlobal = isGlobal;
        this.isVariable = isVariable;
    }
}
class Lisp {
    constructor(obj) {
        this.op = obj.op;
        this.a = obj.a;
        this.b = obj.b;
    }
}
class If {
    constructor(t, f) {
        this.t = t;
        this.f = f;
    }
}
class KeyVal {
    constructor(key, val) {
        this.key = key;
        this.val = val;
    }
}
class SpreadObject {
    constructor(item) {
        this.item = item;
    }
}
class SpreadArray {
    constructor(item) {
        this.item = item;
    }
}
const reservedWords = new Set([
    'instanceof',
    'typeof',
    'return',
    'try',
    'catch',
    'if',
    'else',
    'in',
    'of',
    'var',
    'let',
    'const',
    'for',
    'delete',
    'false',
    'true',
    'while',
    'do',
    'break',
    'continue',
    'new',
    'function'
]);
var VarType;
(function (VarType) {
    VarType["let"] = "let";
    VarType["const"] = "const";
    VarType["var"] = "var";
})(VarType || (VarType = {}));
class Scope {
    constructor(parent, vars = {}, functionThis) {
        this.const = new Set();
        this.let = new Set();
        const isFuncScope = functionThis !== undefined || parent === null;
        this.parent = parent;
        this.allVars = vars;
        this.let = isFuncScope ? this.let : new Set(Object.keys(vars));
        this.var = isFuncScope ? new Set(Object.keys(vars)) : this.var;
        this.globals = parent === null ? new Set(Object.keys(vars)) : new Set();
        this.functionThis = functionThis;
        if (isFuncScope && this.allVars['this'] === undefined) {
            this.var.add('this');
            this.allVars['this'] = functionThis;
        }
    }
    get(key, functionScope = false) {
        if (reservedWords.has(key))
            throw new SyntaxError("Unexepected token '" + key + "'");
        if (this.parent === null || !functionScope || this.functionThis !== undefined) {
            if (this.globals.has(key)) {
                return new Prop(this.functionThis, key, false, true, true);
            }
            if (key in this.allVars && (!(key in {}) || this.allVars.hasOwnProperty(key))) {
                return new Prop(this.allVars, key, this.const.has(key), this.globals.has(key), true);
            }
            if (this.parent === null) {
                return new Prop(undefined, key);
            }
        }
        return this.parent.get(key, functionScope);
    }
    set(key, val) {
        if (key === 'this')
            throw new SyntaxError('"this" cannot be assigned');
        if (reservedWords.has(key))
            throw new SyntaxError("Unexepected token '" + key + "'");
        let prop = this.get(key);
        if (prop.context === undefined) {
            throw new ReferenceError(`Variable '${key}' was not declared.`);
        }
        ``;
        if (prop.isConst) {
            throw new TypeError(`Cannot assign to const variable '${key}'`);
        }
        if (prop.isGlobal) {
            throw new SandboxError(`Cannot override global variable '${key}'`);
        }
        prop.context[prop] = val;
        return prop;
    }
    declare(key, type = null, value = undefined, isGlobal = false) {
        if (key === 'this')
            throw new SyntaxError('"this" cannot be declared');
        if (reservedWords.has(key))
            throw new SyntaxError("Unexepected token '" + key + "'");
        if (type === 'var' && this.functionThis === undefined && this.parent !== null) {
            return this.parent.declare(key, type, value, isGlobal);
        }
        else if ((this[type].has(key) && type !== 'const' && !this.globals.has(key)) || !(key in this.allVars)) {
            if (isGlobal) {
                this.globals.add(key);
            }
            this[type].add(key);
            this.allVars[key] = value;
        }
        else {
            throw Error(`Identifier '${key}' has already been declared`);
        }
        return new Prop(this.allVars, key, this.const.has(key), isGlobal);
    }
}
class ParseError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}
class SandboxError extends Error {
}
class SandboxGlobal {
    constructor(globals) {
        if (globals === globalThis)
            return globalThis;
        for (let i in globals) {
            this[i] = globals[i];
        }
    }
}
function sandboxFunction(context) {
    return SandboxFunction;
    function SandboxFunction(...params) {
        let code = params.pop() || "";
        let parsed = parse(code);
        return createFunction(params, parsed, context, undefined, 'anonymous');
    }
}
const sandboxedFunctions = new WeakSet();
function createFunction(argNames, parsed, context, scope, name) {
    let func = function (...args) {
        const vars = {};
        argNames.forEach((arg, i) => {
            if (arg.startsWith('...')) {
                vars[arg.substring(3)] = args.slice(i);
            }
            else {
                vars[arg] = args[i];
            }
        });
        const res = context.sandbox.executeTree(parsed, scope === undefined ? [] : [new Scope(scope, vars, name === undefined ? undefined : this)]);
        return res.result;
    };
    if (name !== undefined) {
        Object.defineProperty(func, 'name', { value: name, writable: false });
    }
    sandboxedFunctions.add(func);
    return func;
}
function sandboxedEval(func) {
    return sandboxEval;
    function sandboxEval(code) {
        return func(code)();
    }
}
function sandboxedSetTimeout(func) {
    return function sandboxSetTimeout(handler, ...args) {
        if (typeof handler !== 'string')
            return setTimeout(handler, ...args);
        return setTimeout(func(handler), args[0]);
    };
}
function sandboxedSetInterval(func) {
    return function sandboxSetInterval(handler, ...args) {
        if (typeof handler !== 'string')
            return setInterval(handler, ...args);
        return setTimeout(func(handler), args[0]);
    };
}
let expectTypes = {
    op: {
        types: { op: /^(\/|\*\*(?!\=)|\*(?!\=)|\%(?!\=))/ },
        next: [
            'void',
            'value',
            'prop',
            'modifier',
            'incrementerBefore',
        ]
    },
    splitter: {
        types: {
            split: /^(&&|&|\|\||\||<=|>=|<|>|!==|!=|===|==|instanceof(?![\w$_])|in(?![\w$_])|\+(?!\+)|\-(?!\-))(?!\=)/,
        },
        next: [
            'void',
            'value',
            'prop',
            'modifier',
            'incrementerBefore',
        ]
    },
    inlineIf: {
        types: {
            inlineIf: /^\?/,
            else: /^:/,
        },
        next: [
            'expEnd'
        ]
    },
    assignment: {
        types: {
            assignModify: /^(\-=|\+=|\/=|\*\*=|\*=|%=|\^=|\&=|\|=)/,
            assign: /^(=)/
        },
        next: [
            'void',
            'value',
            'prop',
            'modifier',
            'incrementerBefore',
        ]
    },
    incrementerBefore: {
        types: { incrementerBefore: /^(\+\+|\-\-)/ },
        next: [
            'prop',
        ]
    },
    incrementerAfter: {
        types: { incrementerAfter: /^(\+\+|\-\-)/ },
        next: [
            'splitter',
            'op',
            'expEnd'
        ]
    },
    expEdge: {
        types: {
            call: /^[\(]/,
        },
        next: [
            'splitter',
            'op',
            'expEdge',
            'inlineIf',
            'dot',
            'expEnd'
        ]
    },
    modifier: {
        types: {
            not: /^!/,
            inverse: /^~/,
            negative: /^\-(?!\-)/,
            positive: /^\+(?!\+)/,
            typeof: /^typeof(?![\w$_])/,
            delete: /^delete(?![\w$_])/,
        },
        next: [
            'modifier',
            'void',
            'value',
            'prop',
            'incrementerBefore',
        ]
    },
    dot: {
        types: {
            arrayProp: /^[\[]/,
            dot: /^\.(?!\.)/
        },
        next: [
            'splitter',
            'incrementerAfter',
            'assignment',
            'op',
            'expEdge',
            'inlineIf',
            'dot',
            'expEnd'
        ]
    },
    prop: {
        types: {
            prop: /^[a-zA-Z\$_][a-zA-Z\d\$_]*/,
        },
        next: [
            'splitter',
            'incrementerAfter',
            'assignment',
            'op',
            'expEdge',
            'inlineIf',
            'dot',
            'expEnd'
        ]
    },
    value: {
        types: {
            createObject: /^\{/,
            createArray: /^\[/,
            number: /^\-?\d+(\.\d+)?/,
            string: /^"(\d+)"/,
            literal: /^`(\d+)`/,
            boolean: /^(true|false)(?![\w$_])/,
            null: /^null(?![\w$_])/,
            und: /^undefined(?![\w$_])/,
            arrowFunctionSingle: /^([a-zA-Z\$_][a-zA-Z\d\$_]*)\s*=>\s*({)?/,
            arrowFunction: /^\(\s*((\.\.\.)?\s*[a-zA-Z\$_][a-zA-Z\d\$_]*(\s*,\s*(\.\.\.)?\s*[a-zA-Z\$_][a-zA-Z\d\$_]*)*)?\s*\)\s*=>\s*({)?/,
            inlineFunction: /^function(\s*[a-zA-Z\$_][a-zA-Z\d\$_]*)?\s*\(\s*((\.\.\.)?\s*[a-zA-Z\$_][a-zA-Z\d\$_]*(\s*,\s*(\.\.\.)?\s*[a-zA-Z\$_][a-zA-Z\d\$_]*)*)?\s*\)\s*{/,
            group: /^\(/,
            NaN: /^NaN(?![\w$_])/,
            Infinity: /^Infinity(?![\w$_])/,
        },
        next: [
            'splitter',
            'op',
            'expEdge',
            'inlineIf',
            'dot',
            'expEnd'
        ]
    },
    void: {
        types: {
            void: /^void(?![\w$_])/
        },
        next: [
            'splitter',
            'op',
            'expEdge',
            'inlineIf',
            'dot',
            'expEnd'
        ]
    },
    initialize: {
        types: {
            initialize: /^(var|let|const)\s+([a-zA-Z\$_][a-zA-Z\d\$_]*)\s*(=)?/
        },
        next: [
            'void',
            'value',
            'modifier',
            'prop',
            'incrementerBefore',
            'expEnd'
        ]
    },
    spreadObject: {
        types: {
            spreadObject: /^\.\.\./
        },
        next: [
            'void',
            'value',
            'prop',
        ]
    },
    spreadArray: {
        types: {
            spreadArray: /^\.\.\./
        },
        next: [
            'void',
            'value',
            'prop',
        ]
    },
    expEnd: { types: {}, next: [] },
    expStart: {
        types: {
            return: /^return(?![\w$_])/,
            for: /^for\s*\(/,
            do: /^do\s*\{/,
            while: /^while\s*\(/,
            loopAction: /^(break|continue)(?![\w$_])/,
            if: /^if\s*\(/,
            try: /^try\s*{/,
            // block: /^{/,
            function: /^function(\s*[a-zA-Z\$_][a-zA-Z\d\$_]*)\s*\(\s*((\.\.\.)?\s*[a-zA-Z\$_][a-zA-Z\d\$_]*(\s*,\s*(\.\.\.)?\s*[a-zA-Z\$_][a-zA-Z\d\$_]*)*)?\s*\)\s*{/,
        },
        next: [
            'void',
            'value',
            'modifier',
            'prop',
            'incrementerBefore',
            'expEnd'
        ]
    }
};
let closings = {
    "(": ")",
    "[": "]",
    "{": "}",
    "'": "'",
    '"': '"',
    "`": "`"
};
let closingsRegex = {
    "(": /^\)/,
    "[": /^\]/,
    "{": /^\}/,
    "'": /^\'/,
    '"': /^\"/,
    "`": /^\`/
};
const okFirstChars = /^[\+\-~ !]/;
const restOfExp = (part, tests, quote) => {
    let isStart = true;
    tests = tests || [
        expectTypes.op.types.op,
        expectTypes.splitter.types.split,
        expectTypes.inlineIf.types.inlineIf,
        expectTypes.inlineIf.types.else
    ];
    let escape = false;
    let done = false;
    let i;
    for (i = 0; i < part.length && !done; i++) {
        let char = part[i];
        if (quote === '"' || quote === "'" || quote === "`") {
            if (quote === "`" && char === "$" && part[i + 1] === "{" && !escape) {
                let skip = restOfExp(part.substring(i + 2), [closingsRegex['{']]);
                i += skip.length + 2;
            }
            else if (char === quote && !escape) {
                return part.substring(0, i);
            }
            escape = char === "\\";
        }
        else if (closings[char]) {
            let skip = restOfExp(part.substring(i + 1), [closingsRegex[quote]], char);
            i += skip.length + 1;
            isStart = false;
        }
        else if (!quote) {
            let sub = part.substring(i);
            for (let test of tests) {
                done = test.test(sub);
                if (done)
                    break;
            }
            if (isStart) {
                if (okFirstChars.test(sub)) {
                    done = false;
                }
                else {
                    isStart = false;
                }
            }
            if (done)
                break;
        }
        else if (char === closings[quote]) {
            return part.substring(0, i);
        }
    }
    return part.substring(0, i);
};
restOfExp.next = [
    'splitter',
    'op',
    'expEnd',
    'inlineIf'
];
function assignCheck(obj, context, op = 'assign') {
    var _a, _b, _c, _d;
    if (obj.context === undefined) {
        throw new ReferenceError(`Cannot ${op} value to undefined.`);
    }
    if (typeof obj.context !== 'object' && typeof obj.context !== 'function') {
        throw new SyntaxError(`Cannot ${op} value to a primitive.`);
    }
    if (obj.isConst) {
        throw new TypeError(`Cannot set value to const variable '${obj.prop}'`);
    }
    if (obj.isGlobal) {
        throw new SandboxError(`Cannot ${op} property '${obj.prop}' of a global object`);
    }
    if (typeof obj.context[obj.prop] === 'function' && !obj.context.hasOwnProperty(obj.prop)) {
        throw new SandboxError(`Override prototype property '${obj.prop}' not allowed`);
    }
    if (op === "delete") {
        if (obj.context.hasOwnProperty(obj.prop)) {
            (_a = context.changeSubscriptions.get(obj.context)) === null || _a === void 0 ? void 0 : _a.forEach((cb) => cb({ type: "delete", prop: obj.prop }));
        }
    }
    else if (obj.context.hasOwnProperty(obj.prop)) {
        (_c = (_b = context.setSubscriptions.get(obj.context)) === null || _b === void 0 ? void 0 : _b.get(obj.prop)) === null || _c === void 0 ? void 0 : _c.forEach((cb) => cb({
            type: "replace"
        }));
    }
    else {
        (_d = context.changeSubscriptions.get(obj.context)) === null || _d === void 0 ? void 0 : _d.forEach((cb) => cb({ type: "create", prop: obj.prop }));
    }
}
const arrayChange = new Set([
    [].push,
    [].pop,
    [].shift,
    [].unshift,
    [].splice,
    [].reverse,
    [].sort,
    [].copyWithin
]);
let ops2 = {
    'prop': (a, b, obj, context, scope) => {
        if (a === null) {
            throw new TypeError(`Cannot get property ${b} of null`);
        }
        const type = typeof a;
        if (type === 'undefined' && obj === undefined) {
            let prop = scope.get(b);
            if (prop.context === undefined)
                throw new ReferenceError(`${b} is not defined`);
            if (prop.context === context.sandboxGlobal) {
                if (context.options.audit) {
                    context.auditReport.globalsAccess.add(b);
                }
                const rep = context.evals.get(context.sandboxGlobal[b]);
                if (rep)
                    return rep;
            }
            if (prop.context && prop.context[b] === globalThis) {
                return context.globalScope.get('this');
            }
            context.getSubscriptions.forEach((cb) => cb(prop.context, prop.prop));
            return prop;
        }
        else if (a === undefined) {
            throw new Error("Cannot get property '" + b + "' of undefined");
        }
        if (type !== 'object') {
            if (type === 'number') {
                a = new Number(a);
            }
            else if (type === 'string') {
                a = new String(a);
            }
            else if (type === 'boolean') {
                a = new Boolean(a);
            }
        }
        else if (typeof a.hasOwnProperty === 'undefined') {
            return new Prop(undefined, b);
        }
        const isFunction = type === 'function';
        let prototypeAccess = isFunction || !(a.hasOwnProperty(b) || typeof b === 'number');
        if (context.options.audit && prototypeAccess) {
            if (typeof b === 'string') {
                let prot = a.constructor.prototype;
                do {
                    if (prot.hasOwnProperty(b)) {
                        if (!context.auditReport.prototypeAccess[prot.constructor.name]) {
                            context.auditReport.prototypeAccess[prot.constructor.name] = new Set();
                        }
                        context.auditReport.prototypeAccess[prot.constructor.name].add(b);
                    }
                } while (prot = Object.getPrototypeOf(prot));
            }
        }
        if (prototypeAccess) {
            if (isFunction) {
                if (!['name', 'length', 'constructor'].includes(b) && a.hasOwnProperty(b)) {
                    const whitelist = context.prototypeWhitelist.get(a);
                    const replace = context.prototypeReplacements.get(a);
                    if (replace) {
                        return new Prop(replace(a, true), b);
                    }
                    if (whitelist && (!whitelist.size || whitelist.has(b))) {
                    }
                    else {
                        throw new SandboxError(`Static method or property access not permitted: ${a.name}.${b}`);
                    }
                }
            }
            else if (b !== 'constructor') {
                let prot = a.constructor.prototype;
                do {
                    if (prot.hasOwnProperty(b)) {
                        const whitelist = context.prototypeWhitelist.get(prot.constructor);
                        const replace = context.prototypeReplacements.get(prot.constuctor);
                        if (replace) {
                            return new Prop(replace(a, false), b);
                        }
                        if (whitelist && (!whitelist.size || whitelist.has(b))) {
                            break;
                        }
                        throw new SandboxError(`Method or property access not permitted: ${prot.constructor.name}.${b}`);
                    }
                } while (prot = Object.getPrototypeOf(prot));
            }
        }
        const rep = context.evals.get(a[b]);
        if (rep)
            return rep;
        if (a[b] === globalThis) {
            return context.globalScope.get('this');
        }
        let g = obj.isGlobal || (isFunction && !sandboxedFunctions.has(a)) || context.globalsWhitelist.has(a);
        if (!g) {
            context.getSubscriptions.forEach((cb) => cb(a, b));
        }
        return new Prop(a, b, false, g);
    },
    'call': (a, b, obj, context, scope) => {
        var _a;
        if (context.options.forbidMethodCalls)
            throw new SandboxError("Method calls are not allowed");
        if (typeof a !== 'function') {
            throw new TypeError(`${obj.prop} is not a function`);
        }
        const args = b.map((item) => {
            if (item instanceof SpreadArray) {
                return [...item.item];
            }
            else {
                return [item];
            }
        }).flat();
        if (typeof obj === 'function') {
            return obj(...args.map((item) => exec(item, scope, context)));
        }
        const vals = args.map((item) => exec(item, scope, context));
        if (obj.context[obj.prop] === JSON.stringify && context.getSubscriptions.size) {
            const cache = new Set();
            const recurse = (x) => {
                if (!x || !(typeof x === 'object') || cache.has(x))
                    return;
                cache.add(x);
                for (let y in x) {
                    context.getSubscriptions.forEach((cb) => cb(x, y));
                    recurse(x[y]);
                }
            };
            recurse(vals[0]);
        }
        if (obj.context instanceof Array && arrayChange.has(obj.context[obj.prop]) && context.changeSubscriptions.get(obj.context)) {
            let change;
            let changed = false;
            if (obj.prop === "push") {
                change = {
                    type: "push",
                    added: vals
                };
                changed = !!vals.length;
            }
            else if (obj.prop === "pop") {
                change = {
                    type: "pop",
                    removed: obj.context.slice(-1)
                };
                changed = !!change.removed.length;
            }
            else if (obj.prop === "shift") {
                change = {
                    type: "shift",
                    removed: obj.context.slice(0, 1)
                };
                changed = !!change.removed.length;
            }
            else if (obj.prop === "unshift") {
                change = {
                    type: "unshift",
                    added: vals
                };
                changed = !!vals.length;
            }
            else if (obj.prop === "splice") {
                change = {
                    type: "splice",
                    startIndex: vals[0],
                    deleteCount: vals[1] === undefined ? obj.context.length : vals[1],
                    added: vals.slice(2),
                    removed: obj.context.slice(vals[0], vals[1] === undefined ? undefined : vals[0] + vals[1])
                };
                changed = !!change.added.length || !!change.removed.length;
            }
            else if (obj.prop === "reverse" || obj.prop === "sort") {
                change = { type: obj.prop };
                changed = !!obj.context.length;
            }
            else if (obj.prop === "copyWithin") {
                let len = vals[2] === undefined ? obj.context.length - vals[1] : Math.min(obj.context.length, vals[2] - vals[1]);
                change = {
                    type: "copyWithin",
                    startIndex: vals[0],
                    endIndex: vals[0] + len,
                    added: obj.context.slice(vals[1], vals[1] + len),
                    removed: obj.context.slice(vals[0], vals[0] + len)
                };
                changed = !!change.added.length || !!change.removed.length;
            }
            if (changed) {
                (_a = context.changeSubscriptions.get(obj.context)) === null || _a === void 0 ? void 0 : _a.forEach((cb) => cb(change));
            }
            return obj.context[obj.prop](...vals);
        }
        return obj.context[obj.prop](...args.map((item) => exec(item, scope, context)));
    },
    'createObject': (a, b, obj, context, scope) => {
        let res = {};
        for (let item of b) {
            if (item instanceof SpreadObject) {
                res = { ...res, ...item.item };
            }
            else {
                res[item.key] = item.val;
            }
        }
        return res;
    },
    'keyVal': (a, b) => new KeyVal(a, b),
    'createArray': (a, b, obj, context, scope) => {
        return b.map((item) => {
            if (item instanceof SpreadArray) {
                return [...item.item];
            }
            else {
                return [item];
            }
        }).flat().map((item) => exec(item, scope, context));
    },
    'group': (a, b) => b,
    'string': (a, b, obj, context) => context.strings[b],
    'literal': (a, b, obj, context, scope) => {
        let name = context.literals[b].a;
        return name.replace(/(\$\$)*(\$)?\${(\d+)}/g, (match, $$, $, num) => {
            if ($)
                return match;
            let res = exec(context.literals[b].b[parseInt(num, 10)], scope, context);
            res = res instanceof Prop ? res.context[res.prop] : res;
            return ($$ ? $$ : '') + `${res}`.replace(/\$/g, '$$');
        }).replace(/\$\$/g, '$');
    },
    'spreadArray': (a, b, obj, context, scope) => {
        return new SpreadArray(exec(b, scope, context));
    },
    'spreadObject': (a, b, obj, context, scope) => {
        return new SpreadObject(exec(b, scope, context));
    },
    '!': (a, b) => !b,
    '~': (a, b) => ~b,
    '++$': (a, b, obj, context) => {
        assignCheck(obj, context);
        return ++obj.context[obj.prop];
    },
    '$++': (a, b, obj, context) => {
        assignCheck(obj, context);
        return obj.context[obj.prop]++;
    },
    '--$': (a, b, obj, context) => {
        assignCheck(obj, context);
        return --obj.context[obj.prop];
    },
    '$--': (a, b, obj, context) => {
        assignCheck(obj, context);
        return obj.context[obj.prop]--;
    },
    '=': (a, b, obj, context) => {
        assignCheck(obj, context);
        obj.context[obj.prop] = b;
        return new Prop(obj.context, obj.prop, false, obj.isGlobal);
    },
    '+=': (a, b, obj, context) => {
        assignCheck(obj, context);
        return obj.context[obj.prop] += b;
    },
    '-=': (a, b, obj, context) => {
        assignCheck(obj, context);
        return obj.context[obj.prop] -= b;
    },
    '/=': (a, b, obj, context) => {
        assignCheck(obj, context);
        return obj.context[obj.prop] /= b;
    },
    '*=': (a, b, obj, context) => {
        assignCheck(obj, context);
        return obj.context[obj.prop] *= b;
    },
    '**=': (a, b, obj, context) => {
        assignCheck(obj, context);
        return obj.context[obj.prop] **= b;
    },
    '%=': (a, b, obj, context) => {
        assignCheck(obj, context);
        return obj.context[obj.prop] %= b;
    },
    '^=': (a, b, obj, context) => {
        assignCheck(obj, context);
        return obj.context[obj.prop] ^= b;
    },
    '&=': (a, b, obj, context) => {
        assignCheck(obj, context);
        return obj.context[obj.prop] &= b;
    },
    '|=': (a, b, obj, context) => {
        assignCheck(obj, context);
        return obj.context[obj.prop] |= b;
    },
    '?': (a, b) => {
        if (!(b instanceof If)) {
            throw new SyntaxError('Invalid inline if');
        }
        return a ? b.t : b.f;
    },
    '>': (a, b) => a > b,
    '<': (a, b) => a < b,
    '>=': (a, b) => a >= b,
    '<=': (a, b) => a <= b,
    '==': (a, b) => a == b,
    '===': (a, b) => a === b,
    '!=': (a, b) => a != b,
    '!==': (a, b) => a !== b,
    '&&': (a, b) => a && b,
    '||': (a, b) => a || b,
    '&': (a, b) => a & b,
    '|': (a, b) => a | b,
    ':': (a, b) => new If(a, b),
    '+': (a, b) => a + b,
    '-': (a, b) => a - b,
    '$+': (a, b) => +b,
    '$-': (a, b) => -b,
    '/': (a, b) => a / b,
    '*': (a, b) => a * b,
    '%': (a, b) => a % b,
    'typeof': (a, b) => typeof b,
    'instanceof': (a, b) => a instanceof b,
    'in': (a, b) => a in b,
    'delete': (a, b, obj, context, scope, bobj) => {
        if (bobj.context === undefined) {
            return true;
        }
        assignCheck(bobj, context, 'delete');
        if (bobj.isVariable)
            return false;
        return delete bobj.context[bobj.prop];
    },
    'return': (a, b, obj, context) => b,
    'var': (a, b, obj, context, scope, bobj) => {
        return scope.declare(a, VarType.var, exec(b, scope, context));
    },
    'let': (a, b, obj, context, scope, bobj) => {
        return scope.declare(a, VarType.let, exec(b, scope, context), bobj && bobj.isGlobal);
    },
    'const': (a, b, obj, context, scope, bobj) => {
        return scope.declare(a, VarType.const, exec(b, scope, context));
    },
    'arrowFunc': (a, b, obj, context, scope) => {
        return createFunction(a, b, context, scope);
    },
    'function': (a, b, obj, context, scope) => {
        let name = a.shift();
        let func = createFunction(a, b, context, scope, name);
        if (name) {
            scope.declare(name, VarType.var, func);
        }
        return func;
    },
    'inlineFunction': (a, b, obj, context, scope) => {
        let name = a.shift();
        if (name) {
            scope = new Scope(scope, {});
        }
        const func = createFunction(a, b, context, scope, name);
        if (name) {
            scope.declare(name, VarType.let, func);
        }
        return func;
    },
    'loop': (a, b, obj, context, scope) => {
        const [checkFirst, startStep, step, condition, beforeStep] = a;
        let loop = true;
        const outScope = new Scope(scope, {});
        exec(startStep, outScope, context);
        if (checkFirst)
            loop = exec(condition, outScope, context);
        while (loop) {
            exec(beforeStep, outScope, context);
            let res = context.sandbox.executeTree(b, [new Scope(outScope, {})], true);
            if (res.returned) {
                return res;
            }
            if (res.breakLoop) {
                break;
            }
            exec(step, outScope, context);
            loop = exec(condition, outScope, context);
        }
    },
    'loopAction': (a, b, obj, context, scope) => {
        if (!context.inLoop)
            throw new Error("Illegal " + a + " statement");
        return new ExecReturn(context.auditReport, undefined, false, a === "break", a === "continue");
    },
    'if': (a, b, obj, context, scope) => {
        if (!(b instanceof If)) {
            throw new SyntaxError('Invalid inline if');
        }
        if (exec(a, scope, context)) {
            return context.sandbox.executeTree(b.t, [new Scope(scope)]);
        }
        else {
            return context.sandbox.executeTree(b.f, [new Scope(scope)]);
        }
    },
    'try': (a, b, obj, context, scope) => {
        const [exception, catchBody] = b;
        try {
            return context.sandbox.executeTree(a, [new Scope(scope)], context.inLoop);
        }
        catch (e) {
            let sc = {};
            if (exception)
                sc[exception] = e;
            return context.sandbox.executeTree(catchBody, [new Scope(scope, sc)], context.inLoop);
        }
    },
    'void': (a) => { }
};
let ops = new Map();
for (let op in ops2) {
    ops.set(op, ops2[op]);
}
let lispTypes = new Map();
const setLispType = (types, fn) => {
    types.forEach((type) => {
        lispTypes.set(type, fn);
    });
};
const closingsCreate = {
    'createArray': /^\]/,
    'createObject': /^\}/,
    'group': /^\)/,
    'arrayProp': /^\]/,
    'call': /^\)/
};
setLispType(['createArray', 'createObject', 'group', 'arrayProp', 'call'], (strings, type, part, res, expect, ctx) => {
    let extract = "";
    let arg = [];
    let end = false;
    let i = 1;
    while (i < part.length && !end) {
        extract = restOfExp(part.substring(i), [
            closingsCreate[type],
            /^,/
        ]);
        i += extract.length;
        if (extract) {
            arg.push(extract);
        }
        if (part[i] !== ',') {
            end = true;
        }
        else {
            i++;
        }
    }
    const next = ['void', 'value', 'prop', 'modifier', 'incrementerBefore'];
    let l;
    let funcFound;
    switch (type) {
        case 'group':
        case 'arrayProp':
            l = lispify(strings, arg.pop());
            break;
        case 'call':
        case 'createArray':
            l = arg.map((e) => lispify(strings, e, [...next, 'spreadArray']));
            break;
        case 'createObject':
            l = arg.map((str) => {
                str = str.trimStart();
                let value;
                let key;
                funcFound = expectTypes.expStart.types.function.exec('function ' + str);
                if (funcFound) {
                    key = funcFound[1].trimStart();
                    value = lispify(strings, 'function ' + str.replace(key, ""));
                }
                else {
                    let extract = restOfExp(str, [/^:/]);
                    key = lispify(strings, extract, [...next, 'spreadObject']);
                    if (key instanceof Lisp && key.op === 'prop') {
                        key = key.b;
                    }
                    if (extract.length === str.length)
                        return key;
                    value = lispify(strings, str.substring(extract.length + 1));
                }
                return new Lisp({
                    op: 'keyVal',
                    a: key,
                    b: value
                });
            });
            break;
    }
    type = type === 'arrayProp' ? 'prop' : type;
    ctx.lispTree = lispify(strings, part.substring(i + 1), expectTypes[expect].next, new Lisp({
        op: type,
        a: ctx.lispTree,
        b: l,
    }));
});
setLispType(['inverse', 'not', 'negative', 'positive', 'typeof', 'delete', 'op'], (strings, type, part, res, expect, ctx) => {
    let extract = restOfExp(part.substring(res[0].length));
    ctx.lispTree = lispify(strings, part.substring(extract.length + res[0].length), restOfExp.next, new Lisp({
        op: ['positive', 'negative'].includes(type) ? '$' + res[0] : res[0],
        a: ctx.lispTree,
        b: lispify(strings, extract, expectTypes[expect].next),
    }));
});
setLispType(['incrementerBefore'], (strings, type, part, res, expect, ctx) => {
    let extract = restOfExp(part.substring(2));
    ctx.lispTree = lispify(strings, part.substring(extract.length + 2), restOfExp.next, new Lisp({
        op: res[0] + "$",
        a: lispify(strings, extract, expectTypes[expect].next),
    }));
});
setLispType(['incrementerAfter'], (strings, type, part, res, expect, ctx) => {
    ctx.lispTree = lispify(strings, part.substring(res[0].length), expectTypes[expect].next, new Lisp({
        op: "$" + res[0],
        a: ctx.lispTree,
    }));
});
setLispType(['assign', 'assignModify'], (strings, type, part, res, expect, ctx) => {
    ctx.lispTree = new Lisp({
        op: res[0],
        a: ctx.lispTree,
        b: lispify(strings, part.substring(res[0].length), expectTypes[expect].next)
    });
});
setLispType(['split'], (strings, type, part, res, expect, ctx) => {
    let extract = restOfExp(part.substring(res[0].length), [
        expectTypes.splitter.types.split,
        expectTypes.inlineIf.types.inlineIf,
        expectTypes.inlineIf.types.else
    ]);
    ctx.lispTree = lispify(strings, part.substring(extract.length + res[0].length), restOfExp.next, new Lisp({
        op: res[0],
        a: ctx.lispTree,
        b: lispify(strings, extract, expectTypes[expect].next),
    }));
});
setLispType(['inlineIf'], (strings, type, part, res, expect, ctx) => {
    let found = false;
    let extract = "";
    let quoteCount = 1;
    while (!found && extract.length < part.length) {
        extract += restOfExp(part.substring(extract.length + 1), [
            expectTypes.inlineIf.types.inlineIf,
            expectTypes.inlineIf.types.else
        ]);
        if (part[extract.length + 1] === '?') {
            quoteCount++;
        }
        else {
            quoteCount--;
        }
        if (!quoteCount) {
            found = true;
        }
        else {
            extract += part[extract.length + 1];
        }
    }
    ctx.lispTree = new Lisp({
        op: '?',
        a: ctx.lispTree,
        b: new Lisp({
            op: ':',
            a: lispify(strings, extract),
            b: lispify(strings, part.substring(res[0].length + extract.length + 1))
        })
    });
});
setLispType(['if'], (strings, type, part, res, expect, ctx) => {
    let condition = restOfExp(part.substring(res[0].length), [/^\)/]);
    let trueBlock = restOfExp(part.substring(res[0].length + condition.length + 1), [/^else(?!=\w\$)/]);
    let elseBlock = part.substring(res[0].length + condition.length + trueBlock.length + 1 + 4);
    condition = condition.trim();
    trueBlock = trueBlock.trim();
    elseBlock = elseBlock.trim();
    if (trueBlock[0] === "{")
        trueBlock = trueBlock.slice(1, -1);
    if (elseBlock[0] === "{")
        trueBlock = elseBlock.slice(1, -1);
    ctx.lispTree = new Lisp({
        op: 'if',
        a: lispify(strings, condition),
        b: new Lisp({
            op: ':',
            a: parse(trueBlock, strings.strings, strings.literals, true),
            b: parse(elseBlock, strings.strings, strings.literals, true)
        })
    });
});
setLispType(['dot', 'prop'], (strings, type, part, res, expect, ctx) => {
    let prop = res[0];
    let index = res[0].length;
    if (res[0] === '.') {
        let matches = part.substring(res[0].length).match(expectTypes.prop.types.prop);
        if (matches.length) {
            prop = matches[0];
            index = prop.length + res[0].length;
        }
        else {
            throw Error('Hanging  dot:' + part);
        }
    }
    ctx.lispTree = lispify(strings, part.substring(index), expectTypes[expect].next, new Lisp({
        op: 'prop',
        a: ctx.lispTree,
        b: prop
    }));
});
setLispType(['spreadArray', 'spreadObject', 'return'], (strings, type, part, res, expect, ctx) => {
    ctx.lispTree = new Lisp({
        op: type,
        b: lispify(strings, part.substring(res[0].length), expectTypes[expect].next)
    });
});
setLispType(['number', 'boolean', 'null'], (strings, type, part, res, expect, ctx) => {
    ctx.lispTree = lispify(strings, part.substring(res[0].length), expectTypes[expect].next, JSON.parse(res[0]));
});
const constants = {
    NaN,
    Infinity,
};
setLispType(['und', 'NaN', 'Infinity'], (strings, type, part, res, expect, ctx) => {
    ctx.lispTree = lispify(strings, part.substring(res[0].length), expectTypes[expect].next, constants[type]);
});
setLispType(['string', 'literal'], (strings, type, part, res, expect, ctx) => {
    ctx.lispTree = lispify(strings, part.substring(res[0].length), expectTypes[expect].next, new Lisp({
        op: type,
        b: parseInt(JSON.parse(res[1]), 10),
    }));
});
setLispType(['initialize'], (strings, type, part, res, expect, ctx) => {
    if (!res[3]) {
        ctx.lispTree = lispify(strings, part.substring(res[0].length), expectTypes[expect].next, new Lisp({
            op: res[1],
            a: res[2]
        }));
    }
    else {
        ctx.lispTree = new Lisp({
            op: res[1],
            a: res[2],
            b: lispify(strings, part.substring(res[0].length + 1), expectTypes[expect].next)
        });
    }
});
setLispType(['function', 'inlineFunction', 'arrowFunction', 'arrowFunctionSingle'], (strings, type, part, res, expect, ctx) => {
    const isArrow = type !== 'function' && type !== 'inlineFunction';
    const isReturn = isArrow && !res[res.length - 1];
    const argPos = isArrow ? 1 : 2;
    const args = res[argPos] ? res[argPos].replace(/\s+/g, "").split(/,/g) : [];
    if (!isArrow) {
        args.unshift((res[1] || "").trimStart());
    }
    let ended = false;
    args.forEach((arg) => {
        if (ended)
            throw new SyntaxError('Rest parameter must be last formal parameter');
        if (arg.startsWith('...'))
            ended = true;
    });
    const func = (isReturn ? 'return ' : '') + restOfExp(part.substring(res[0].length), !isReturn ? [/^}/] : [/^[,;\)\}\]]/]);
    ctx.lispTree = lispify(strings, part.substring(res[0].length + func.length + 1), expectTypes[expect].next, new Lisp({
        op: isArrow ? 'arrowFunc' : type,
        a: args,
        b: parse(func, strings.strings, strings.literals, true)
    }));
});
const iteratorRegex = /^((let|var|const)\s+[a-zA-Z\$_][a-zA-Z\d\$_]*)\s+(in|of)\s+/;
setLispType(['for', 'do', 'while'], (strings, type, part, res, expect, ctx) => {
    let i = part.indexOf("(") + 1;
    let startStep = true;
    let beforeStep = false;
    let checkFirst = true;
    let condition;
    let step = true;
    let body;
    switch (type) {
        case 'while':
            let extract = restOfExp(part.substring(i), [/^\)/]);
            condition = lispify(strings, extract);
            body = restOfExp(part.substring(i + extract.length + 1)).trim();
            if (body[0] === "{")
                body = body.slice(1, -1);
            break;
        case 'for':
            let args = [];
            let extract2 = "";
            for (let k = 0; k < 3; k++) {
                extract2 = restOfExp(part.substring(i), [/^[;\)]/]);
                args.push(extract2.trim());
                i += extract2.length + 1;
                if (part[i - 1] === ")")
                    break;
            }
            let iterator;
            if (args.length === 1 && (iterator = iteratorRegex.exec(args[0]))) {
                if (iterator[3] === 'of') {
                    startStep = [
                        lispify(strings, 'let $$obj = ' + args[0].substring(iterator[0].length)),
                        lispify(strings, 'let $$iterator = $$obj[Symbol.iterator]()'),
                        lispify(strings, 'let $$next = $$iterator.next()')
                    ];
                    condition = lispify(strings, 'return !$$next.done');
                    step = lispify(strings, '$$next = $$iterator.next()');
                    beforeStep = lispify(strings, iterator[1] + ' = $$next.value');
                }
                else {
                    startStep = [
                        lispify(strings, 'let $$obj = ' + args[0].substring(iterator[0].length)),
                        lispify(strings, 'let $$keys = Object.keys($$obj)'),
                        lispify(strings, 'let $$keyIndex = 0')
                    ];
                    step = lispify(strings, '$$keyIndex++');
                    condition = lispify(strings, 'return $$keyIndex < $$keys.length');
                    beforeStep = lispify(strings, iterator[1] + ' = $$keys[$$keyIndex]');
                }
            }
            else if (args.length === 3) {
                startStep = lispify(strings, args.shift());
                condition = lispify(strings, 'return ' + args.shift());
                step = lispify(strings, args.shift());
            }
            else {
                throw new SyntaxError("Invalid for loop definition");
            }
            body = restOfExp(part.substring(i)).trim();
            if (body[0] === "{")
                body = body.slice(1, -1);
            break;
        case 'do':
            checkFirst = false;
            const start = part.indexOf("{") + 1;
            let extract3 = restOfExp(part.substring(start), [/^}/]);
            body = extract3;
            condition = lispify(strings, restOfExp(part.substring(part.indexOf("(", start + extract3.length) + 1), [/^\)/]));
            break;
    }
    ctx.lispTree = new Lisp({
        op: 'loop',
        a: [checkFirst, startStep, step, condition, beforeStep],
        b: parse(body, strings.strings, strings.literals, true)
    });
    setLispType(['block'], (strings, type, part, res, expect, ctx) => {
        ctx.lispTree = parse(restOfExp(part.substring(1), [/^}/]), strings.strings, strings.literals, true);
    });
    setLispType(['loopAction'], (strings, type, part, res, expect, ctx) => {
        ctx.lispTree = new Lisp({
            op: 'loopAction',
            a: res[1],
        });
    });
    const catchReg = /^\s*catch\s*(\(\s*([a-zA-Z\$_][a-zA-Z\d\$_]*)\s*\))?\s*\{/;
    setLispType(['try'], (strings, type, part, res, expect, ctx) => {
        const body = restOfExp(part.substring(res[0].length), [/^}/]);
        const catchRes = catchReg.exec(part.substring(res[0].length + body.length + 1));
        const exception = catchRes[2];
        const catchBody = restOfExp(part.substring(res[0].length + body.length + 1 + catchRes[0].length), [/^}/]);
        ctx.lispTree = new Lisp({
            op: 'try',
            a: parse(body, strings.strings, strings.literals, true),
            b: [
                exception,
                parse(catchBody, strings.strings, strings.literals, true),
            ]
        });
    });
    setLispType(['void'], (strings, type, part, res, expect, ctx) => {
        const extract = restOfExp(part.substring(res[0].length), expectTypes[expect].next.map((ex) => Object.values(expectTypes[ex].types)).flat());
        ctx.lispTree = lispify(strings, part.substring(res[0].length + extract.length), expectTypes[expect].next, new Lisp({
            op: 'void',
            a: lispify(strings, extract),
        }));
    });
});
let lastType;
function lispify(strings, part, expected, lispTree) {
    expected = expected || ['initialize', 'expStart', 'void', 'value', 'prop', 'modifier', 'incrementerBefore', 'expEnd'];
    if (part === undefined)
        return lispTree;
    if (!part.length && !expected.includes('expEnd')) {
        throw new SyntaxError("Unexpected end of expression");
    }
    part = part.trimStart();
    let ctx = { lispTree: lispTree };
    let res;
    for (let expect of expected) {
        if (expect === 'expEnd') {
            continue;
        }
        for (let type in expectTypes[expect].types) {
            if (type === 'expEnd') {
                continue;
            }
            if (res = expectTypes[expect].types[type].exec(part)) {
                lastType = type;
                lispTypes.get(type)(strings, type, part, res, expect, ctx);
                break;
            }
        }
        if (res)
            break;
    }
    if (!res && part.length) {
        throw SyntaxError(`Unexpected token (${lastType}): ${part}`);
    }
    return ctx.lispTree;
}
function exec(tree, scope, context) {
    if (tree instanceof Prop) {
        return tree.context[tree.prop];
    }
    if (Array.isArray(tree)) {
        let res = [];
        for (let item of tree) {
            const ret = exec(item, scope, context);
            if (ret instanceof ExecReturn) {
                res.push(ret.result);
                if (ret.returned || ret.breakLoop || ret.continueLoop) {
                    res = ret;
                    break;
                }
            }
            else {
                res.push(ret);
            }
        }
        return res;
    }
    if (!(tree instanceof Lisp)) {
        return tree;
    }
    if (tree.op === 'arrowFunc' || tree.op === 'function' || tree.op === 'loop' || tree.op === 'try') {
        return ops.get(tree.op)(tree.a, tree.b, undefined, context, scope);
    }
    if (tree.op === 'if') {
        return ops.get(tree.op)(tree.a, exec(tree.b, scope, context), undefined, context, scope);
    }
    let obj = exec(tree.a, scope, context);
    let a = obj instanceof Prop ? (obj.context ? obj.context[obj.prop] : undefined) : obj;
    let bobj = exec(tree.b, scope, context);
    let b = bobj instanceof Prop ? (bobj.context ? bobj.context[bobj.prop] : undefined) : bobj;
    if (ops.has(tree.op)) {
        let res = ops.get(tree.op)(a, b, obj, context, scope, bobj);
        return res;
    }
    throw new SyntaxError('Unknown operator: ' + tree.op);
}
function parse(code, strings = [], literals = [], skipStrings = false) {
    if (typeof code !== 'string')
        throw new ParseError(`Cannot parse ${code}`, code);
    // console.log('parse', str);
    let str = code;
    let quote;
    let extract = "";
    let escape = false;
    let js = [];
    let currJs = [];
    if (!skipStrings) {
        let extractSkip = 0;
        for (let i = 0; i < str.length; i++) {
            let char = str[i];
            if (escape) {
                if (char === "$" && quote === '`') {
                    extractSkip--;
                    char = '$$';
                }
                else if (char === 'u') {
                    let reg = /^[a-fA-F\d]{2,4}/.exec(str.substring(i + 1));
                    let num;
                    if (!reg) {
                        num = Array.from(/^{[a-fA-F\d]+}/.exec(str.substring(i + 1)) || [""]);
                    }
                    else {
                        num = Array.from(reg);
                    }
                    char = JSON.parse(`"\\u${num[0]}"`);
                    str = str.substring(0, i - 1) + char + str.substring(i + (1 + num[0].length));
                    i -= 1;
                }
                else if (char != '`') {
                    char = JSON.parse(`"\\${char}"`);
                }
            }
            else if (char === '$' && quote === '`' && str[i + 1] !== '{') {
                extractSkip--;
                char = '$$';
            }
            if (quote === "`" && char === "$" && str[i + 1] === "{") {
                let skip = restOfExp(str.substring(i + 2), [/^}/]);
                currJs.push(skip);
                extractSkip += skip.length + 3;
                extract += `\${${currJs.length - 1}}`;
                i += skip.length + 2;
            }
            else if (!quote && (char === "'" || char === '"' || char === '`') && !escape) {
                currJs = [];
                extractSkip = 0;
                quote = char;
            }
            else if (quote === char && !escape) {
                let len;
                if (quote === '`') {
                    literals.push({
                        op: 'literal',
                        a: extract,
                        b: currJs
                    });
                    js.push(currJs);
                    str = str.substring(0, i - extractSkip - 1) + `\`${literals.length - 1}\`` + str.substring(i + 1);
                    len = (literals.length - 1).toString().length;
                }
                else {
                    strings.push(extract);
                    str = str.substring(0, i - extract.length - 1) + `"${strings.length - 1}"` + str.substring(i + 1);
                    len = (strings.length - 1).toString().length;
                }
                quote = null;
                i -= extract.length - len;
                extract = "";
            }
            else if (quote && !(!escape && char === "\\")) {
                extractSkip += escape ? 1 + char.length : char.length;
                extract += char;
            }
            escape = quote && !escape && char === "\\";
        }
        js.forEach((j) => {
            const a = j.map((skip) => parse(skip, strings, literals).tree[0]);
            j.length = 0;
            j.push(...a);
        });
    }
    let parts = [];
    let part;
    let pos = 0;
    while ((part = restOfExp(str.substring(pos), [/^;/]))) {
        parts.push(part);
        pos += part.length + 1;
    }
    parts = parts.filter(Boolean);
    const tree = parts.filter((str) => str.length).map((str) => {
        let subExpressions = [];
        let sub;
        let pos = 0;
        while ((sub = restOfExp(str.substring(pos), [/^,/]))) {
            subExpressions.push(sub);
            pos += sub.length + 1;
        }
        try {
            const exprs = subExpressions.map((str) => lispify({ strings, literals }, str));
            if (exprs.length > 1 && exprs[0] instanceof Lisp) {
                if (exprs[0].op === 'return') {
                    const last = exprs.pop();
                    return [exprs.shift().b, ...exprs, new Lisp({
                            op: 'return',
                            b: last
                        })];
                }
            }
            return exprs;
        }
        catch (e) {
            // throw e;
            throw new ParseError(e.message + ": " + str, str);
        }
    });
    return { tree: tree.flat(), strings, literals };
}
class Sandbox {
    constructor(globals = Sandbox.SAFE_GLOBALS, prototypeWhitelist = Sandbox.SAFE_PROTOTYPES, prototypeReplacements = new Map(), options = { audit: false }) {
        const sandboxGlobal = new SandboxGlobal(globals);
        this.context = {
            sandbox: this,
            globals,
            prototypeWhitelist,
            prototypeReplacements,
            globalsWhitelist: new Set(Object.values(globals)),
            options,
            globalScope: new Scope(null, globals, sandboxGlobal),
            sandboxGlobal,
            evals: new Map(),
            getSubscriptions: new Set(),
            setSubscriptions: new WeakMap(),
            changeSubscriptions: new WeakMap(),
            inLoop: false
        };
        const func = sandboxFunction(this.context);
        this.context.evals.set(Function, func);
        this.context.evals.set(eval, sandboxedEval(func));
        this.context.evals.set(setTimeout, sandboxedSetTimeout(func));
        this.context.evals.set(setInterval, sandboxedSetInterval(func));
    }
    static get SAFE_GLOBALS() {
        return {
            Function,
            console: {
                debug: console.debug,
                error: console.error,
                info: console.info,
                log: console.log,
                table: console.table,
                warn: console.warn
            },
            isFinite,
            isNaN,
            parseFloat,
            parseInt,
            decodeURI,
            decodeURIComponent,
            encodeURI,
            encodeURIComponent,
            escape,
            unescape,
            Boolean,
            Number,
            String,
            Object,
            Array,
            Symbol,
            Error,
            EvalError,
            RangeError,
            ReferenceError,
            SyntaxError,
            TypeError,
            URIError,
            Int8Array,
            Uint8Array,
            Uint8ClampedArray,
            Int16Array,
            Uint16Array,
            Int32Array,
            Uint32Array,
            Float32Array,
            Float64Array,
            Map,
            Set,
            WeakMap,
            WeakSet,
            Promise,
            Intl,
            JSON,
            Math,
        };
    }
    static get SAFE_PROTOTYPES() {
        let protos = [
            SandboxGlobal,
            Function,
            Boolean,
            Number,
            String,
            Date,
            RegExp,
            Error,
            Array,
            Int8Array,
            Uint8Array,
            Uint8ClampedArray,
            Int16Array,
            Uint16Array,
            Int32Array,
            Uint32Array,
            Float32Array,
            Float64Array,
            Map,
            Set,
            WeakMap,
            WeakSet,
            Promise,
            Symbol,
        ];
        let map = new Map();
        protos.forEach((proto) => {
            map.set(proto, new Set());
        });
        map.set(Object, new Set([
            'entries',
            'fromEntries',
            'getOwnPropertyNames',
            'is',
            'keys',
            'hasOwnProperty',
            'isPrototypeOf',
            'propertyIsEnumerable',
            'toLocaleString',
            'toString',
            'valueOf',
            'values'
        ]));
        return map;
    }
    subscribeGet(callback) {
        this.context.getSubscriptions.add(callback);
        return { unsubscribe: () => this.context.getSubscriptions.delete(callback) };
    }
    subscribeSet(obj, name, callback) {
        const names = this.context.setSubscriptions.get(obj) || new Map();
        this.context.setSubscriptions.set(obj, names);
        const callbacks = names.get(name) || new Set();
        names.set(name, callbacks);
        callbacks.add(callback);
        let changeCbs;
        if (obj && obj[name] && typeof obj[name] === "object") {
            changeCbs = this.context.changeSubscriptions.get(obj[name]) || new Set();
            changeCbs.add(callback);
            this.context.changeSubscriptions.set(obj[name], changeCbs);
        }
        return { unsubscribe: () => {
                callbacks.delete(callback);
                if (changeCbs)
                    changeCbs.delete(callback);
            } };
    }
    static audit(code, scopes = []) {
        return new Sandbox(globalThis, new Map(), new Map(), {
            audit: true,
        }).executeTree(parse(code), scopes);
    }
    static parse(code) {
        return parse(code);
    }
    executeTree(executionTree, scopes = [], inLoop = false) {
        const execTree = executionTree.tree;
        const contextb = { ...this.context, strings: executionTree.strings, literals: executionTree.literals, inLoop };
        let scope = this.context.globalScope;
        let s;
        while (s = scopes.shift()) {
            if (typeof s !== "object")
                continue;
            if (s instanceof Scope) {
                scope = s;
            }
            else {
                scope = new Scope(scope, s, null);
            }
        }
        let context = Object.assign({}, contextb);
        if (contextb.options.audit) {
            context.auditReport = {
                globalsAccess: new Set(),
                prototypeAccess: {},
            };
        }
        let returned = false;
        let isBreak = false;
        let isContinue = false;
        let res;
        if (!(execTree instanceof Array))
            throw new SyntaxError('Bad execution tree');
        for (let tree of execTree) {
            let r;
            try {
                r = exec(tree, scope, context);
                if (r instanceof ExecReturn) {
                    res = r;
                    break;
                }
            }
            catch (e) {
                // throw e;
                throw new e.constructor(e.message);
            }
            if (tree instanceof Lisp && tree.op === 'return') {
                returned = true;
                res = r;
            }
        }
        res = res instanceof Prop ? res.context[res.prop] : res;
        return res instanceof ExecReturn ? res : new ExecReturn(context.auditReport, res, returned, isBreak, isContinue);
    }
    compile(code) {
        const executionTree = parse(code);
        return (...scopes) => {
            return this.executeTree(executionTree, scopes).result;
        };
    }
    ;
}
exports.default = Sandbox;
