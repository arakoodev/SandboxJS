import { sandboxFunction, sandboxedEval, sandboxedSetTimeout, sandboxedSetInterval, executeTree, executeTreeAsync, ops, assignCheck, execMany, execAsync, execSync, asyncDone, Scope, FunctionScope, LocalScope, syncDone } from "./executor.js";
import { parse, expectTypes, setLispType } from "./parser.js";
export { expectTypes, setLispType, ops as executionOps, assignCheck, execMany, execAsync, execSync, asyncDone, syncDone, executeTree, executeTreeAsync, FunctionScope, LocalScope, };
export class SandboxGlobal {
    constructor(globals) {
        if (globals === globalThis)
            return globalThis;
        for (let i in globals) {
            this[i] = globals[i];
        }
    }
}
export class ExecContext {
    constructor(ctx, constants, tree, getSubscriptions, setSubscriptions, changeSubscriptions, evals) {
        this.ctx = ctx;
        this.constants = constants;
        this.tree = tree;
        this.getSubscriptions = getSubscriptions;
        this.setSubscriptions = setSubscriptions;
        this.changeSubscriptions = changeSubscriptions;
        this.evals = evals;
    }
}
const contextStore = new WeakMap();
export default class Sandbox {
    constructor(options) {
        options = Object.assign({
            audit: false,
            forbidFunctionCalls: false,
            forbidFunctionCreation: false,
            globals: Sandbox.SAFE_GLOBALS,
            prototypeWhitelist: Sandbox.SAFE_PROTOTYPES,
            prototypeReplacements: new Map(),
        }, options || {});
        const sandboxGlobal = new SandboxGlobal(options.globals);
        this.context = {
            sandbox: this,
            globalsWhitelist: new Set(Object.values(options.globals)),
            prototypeWhitelist: new Map([...options.prototypeWhitelist].map((a) => [a[0].prototype, a[1]])),
            options,
            globalScope: new Scope(null, options.globals, sandboxGlobal),
            sandboxGlobal
        };
        this.context.prototypeWhitelist.set(Object.getPrototypeOf([][Symbol.iterator]()), new Set());
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
            BigInt,
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
            Date,
            RegExp
        };
    }
    static get SAFE_PROTOTYPES() {
        let protos = [
            SandboxGlobal,
            Function,
            Boolean,
            Number,
            BigInt,
            String,
            Date,
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
            Date,
            RegExp
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
    subscribeGet(exec, callback) {
        var _a;
        (_a = contextStore.get(exec)) === null || _a === void 0 ? void 0 : _a.getSubscriptions.add(callback);
        return { unsubscribe: () => { var _a; return (_a = contextStore.get(exec)) === null || _a === void 0 ? void 0 : _a.getSubscriptions.delete(callback); } };
    }
    subscribeSet(exec, obj, name, callback) {
        var _a, _b, _c, _d;
        const names = ((_a = contextStore.get(exec)) === null || _a === void 0 ? void 0 : _a.setSubscriptions.get(obj)) || new Map();
        (_b = contextStore.get(exec)) === null || _b === void 0 ? void 0 : _b.setSubscriptions.set(obj, names);
        const callbacks = names.get(name) || new Set();
        names.set(name, callbacks);
        callbacks.add(callback);
        let changeCbs;
        if (obj && obj[name] && typeof obj[name] === "object") {
            changeCbs = ((_c = contextStore.get(exec)) === null || _c === void 0 ? void 0 : _c.changeSubscriptions.get(obj[name])) || new Set();
            changeCbs.add(callback);
            (_d = contextStore.get(exec)) === null || _d === void 0 ? void 0 : _d.changeSubscriptions.set(obj[name], changeCbs);
        }
        return {
            unsubscribe: () => {
                callbacks.delete(callback);
                if (changeCbs)
                    changeCbs.delete(callback);
            }
        };
    }
    static audit(code, scopes = []) {
        const globals = {};
        for (let i of Object.getOwnPropertyNames(globalThis)) {
            globals[i] = globalThis[i];
        }
        const sandbox = new Sandbox({
            globals,
            audit: true,
        });
        return sandbox.executeTree(sandbox.createContext(sandbox.context, parse(code)), scopes);
    }
    static parse(code) {
        return parse(code);
    }
    createContext(context, executionTree) {
        const evals = new Map();
        const execContext = new ExecContext(context, executionTree.constants, executionTree.tree, new Set(), new WeakMap(), new WeakMap(), evals);
        const func = sandboxFunction(execContext);
        evals.set(Function, func);
        evals.set(eval, sandboxedEval(func));
        evals.set(setTimeout, sandboxedSetTimeout(func));
        evals.set(setInterval, sandboxedSetInterval(func));
        return execContext;
    }
    executeTree(context, scopes = []) {
        return executeTree({
            ticks: BigInt(0),
        }, context, context.tree, scopes);
    }
    executeTreeAsync(context, scopes = []) {
        return executeTreeAsync({
            ticks: BigInt(0),
        }, context, context.tree, scopes);
    }
    compile(code, optimize = false) {
        const parsed = parse(code, optimize);
        const exec = (...scopes) => {
            const context = this.createContext(this.context, parsed);
            return { context, run: () => this.executeTree(context, scopes).result };
        };
        return exec;
    }
    ;
    compileAsync(code, optimize = false) {
        const parsed = parse(code, optimize);
        const exec = (...scopes) => {
            const context = this.createContext(this.context, parsed);
            return { context, run: async () => (await this.executeTreeAsync(context, scopes)).result };
        };
        return exec;
    }
    ;
    compileExpression(code, optimize = false) {
        const parsed = parse(code, optimize, true);
        const exec = (...scopes) => {
            const context = this.createContext(this.context, parsed);
            return { context, run: () => this.executeTree(context, scopes).result };
        };
        return exec;
    }
    compileExpressionAsync(code, optimize = false) {
        const parsed = parse(code, optimize, true);
        const exec = (...scopes) => {
            const context = this.createContext(this.context, parsed);
            return { context, run: async () => (await this.executeTreeAsync(context, scopes)).result };
        };
        return exec;
    }
}
