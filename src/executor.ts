import { SpreadArray, LispItem, KeyVal, SpreadObject, If, Lisp, LispArray, toLispArray, parse, IRegEx, lispifyFunction, CodeString, lispArrayKey } from "./parser.js";
import { IExecContext, IContext, Ticks } from "./Sandbox.js";


export type SandboxFunction = (code: string, ...args: any[]) => () => any;
export type sandboxedEval = (code: string) => any;
export type sandboxSetTimeout = (handler: TimerHandler, timeout?: any, ...args: any[]) => any;
export type sandboxSetInterval = (handler: TimerHandler, timeout?: any, ...args: any[]) => any;
export type Done = (err?: any, res?: any) => void
export class ExecReturn {
  constructor(public auditReport: IAuditReport, public result: any, public returned: boolean, public breakLoop = false, public continueLoop = false) {}
}

export interface IAuditReport {
  globalsAccess: Set<any>;
  prototypeAccess: {[name: string]: Set<string>}
}

export interface IGlobals {
  [key: string]: any
}

export interface IChange {
  type: string;
}

export interface ICreate extends IChange {
  type: "create";
  prop: number|string;
}

export interface IReplace extends IChange {
  type: "replace";
}

export interface IDelete extends IChange {
  type: "delete";
  prop: number|string;
}

export interface IReverse extends IChange {
  type: "reverse";
}

export interface ISort extends IChange {
  type: "sort";
}

export interface IPush extends IChange {
  type: "push";
  added: unknown[];
}

export interface IPop extends IChange {
  type: "pop";
  removed: unknown[];
}

export interface IShift extends IChange {
  type: "shift";
  removed: unknown[];
}

export interface IUnShift extends IChange {
  type: "unshift";
  added: unknown[];
}

export interface ISplice extends IChange {
  type: "splice";
  startIndex: number;
  deleteCount: number; 
  added: unknown[];
  removed: unknown[];

}

export interface ICopyWithin extends IChange {
  type: "copyWithin";
  startIndex: number;
  endIndex: number;
  added: unknown[];
  removed: unknown[];
}

export type Change = ICreate | IReplace | IDelete | IReverse | ISort | IPush | IPop | IUnShift | IShift | ISplice | ICopyWithin

export type replacementCallback = (obj: any, isStaticAccess: boolean) => any

export class Prop {
  constructor(public context: {[key:string]: any}, public prop: string, public isConst = false, public isGlobal = false, public isVariable = false) {
  }

  get(): any {
    if (this.context === undefined) throw new ReferenceError(`${this.prop} is not defined`);
    return this.context[this.prop];
  }
}

const optional = Symbol('optional');

const reservedWords = new Set([
  'instanceof',
  'typeof',
  'return',
  'try',
  'catch',
  'if',
  'finally',
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
  'function',
  'async',
  'await',
  'switch',
  'case'
]);

enum VarType {
  let = "let",
  const = "const",
  var = "var"
}

function keysOnly(obj: any): {[key: string]: true} {
  const ret = Object.assign({}, obj);
  for (let key in ret) {
    ret[key] = true;
  }
  return ret;
}

export class Scope {
  parent: Scope;
  const: {[key: string]: true} = {};
  let: {[key: string]: true} = {};
  var: {[key: string]: true} = {};
  globals: {[key: string]: true};
  allVars: {[key:string]: any} & Object;
  functionThis?: any;
  constructor(parent: Scope, vars = {}, functionThis?: any) {
    const isFuncScope = functionThis !== undefined || parent === null;
    this.parent = parent;
    this.allVars = vars;
    this.let = isFuncScope ? this.let : keysOnly(vars);
    this.var = isFuncScope ? keysOnly(vars) : this.var;
    this.globals = parent === null ? keysOnly(vars) : {};
    this.functionThis = functionThis;
  }

  get(key: string, functionScope = false): any {
    if (key === 'this' && this.functionThis !== undefined) {
      return new Prop({this: this.functionThis}, key, true, false, true);
    }
    if (reservedWords.has(key)) throw new SyntaxError("Unexepected token '" + key + "'");
    if (this.parent === null || !functionScope || this.functionThis !== undefined) {
      if (this.globals.hasOwnProperty(key)) {
        return new Prop(this.functionThis, key, false, true, true);
      }
      if (key in this.allVars && (!(key in {}) || this.allVars.hasOwnProperty(key))) {
        return new Prop(this.allVars, key, this.const.hasOwnProperty(key), this.globals.hasOwnProperty(key), true);
      }
      if (this.parent === null) {
        return new Prop(undefined, key);
      }
    }
    return this.parent.get(key, functionScope)
  }

  set(key: string, val: any) {
    if (key === 'this') throw new SyntaxError('"this" cannot be assigned')
    if (reservedWords.has(key)) throw new SyntaxError("Unexepected token '" + key + "'");
    let prop = this.get(key);
    if(prop.context === undefined) {
      throw new ReferenceError(`Variable '${key}' was not declared.`);
    }
    if (prop.isConst) {
      throw new TypeError(`Cannot assign to const variable '${key}'`);
    }
    if (prop.isGlobal) {
      throw new SandboxError(`Cannot override global variable '${key}'`);
    }
    prop.context[prop] = val;
    return prop;
  }

  declare(key: string, type: VarType = null, value: any = undefined, isGlobal = false) {
    if (key === 'this') throw new SyntaxError('"this" cannot be declared');
    if (reservedWords.has(key)) throw new SyntaxError("Unexepected token '" + key + "'");
    if (type === 'var' && this.functionThis === undefined && this.parent !== null) {
      return this.parent.declare(key, type, value, isGlobal)
    } else if ((this[type].hasOwnProperty(key) && type !== 'const' && !this.globals.hasOwnProperty(key)) || !(key in this.allVars)) {
      if (isGlobal) {
        this.globals[key] = true;
      }
      this[type][key] = true;
      this.allVars[key] = value;
    } else {
      throw new SandboxError(`Identifier '${key}' has already been declared`);
    }
    return new Prop(this.allVars, key, this.const.hasOwnProperty(key), isGlobal);
  }
}

export interface IScope {
  [key: string]: any;
}

export class FunctionScope implements IScope {}

export class LocalScope implements IScope {}

export class SandboxError extends Error {}

let currentTicks: Ticks;

export function sandboxFunction(context: IContext, ticks?: Ticks): SandboxFunction {
  return SandboxFunction;
  function SandboxFunction(...params: any[]) {
    let code = params.pop() || "";
    let parsed = parse(code);
    return createFunction(params, parsed.tree, ticks || currentTicks, {
      ctx: context,
      constants: parsed.constants,
      tree: parsed.tree
    }, undefined, 'anonymous');
  }
}

function generateArgs(argNames: string[], args: unknown[]) {
  const vars: any = {};
  argNames.forEach((arg, i) => {
    if (arg.startsWith('...')) {
      vars[arg.substring(3)] = args.slice(i);
    } else {
      vars[arg] = args[i];
    }
  });
  return vars;
}

const sandboxedFunctions = new WeakSet();
export function createFunction(argNames: string[], parsed: LispItem, ticks: Ticks, context: IExecContext, scope?: Scope, name?: string) {
  if (context.ctx.options.forbidFunctionCreation) {
    throw new SandboxError("Function creation is forbidden");
  }
  let func;
  if (name === undefined) {
    func = (...args) => {
      const vars = generateArgs(argNames, args);
      const res = executeTree(ticks, context, parsed, scope === undefined ? [] : [new Scope(scope, vars)])
      return res.result;
    }
  } else {
    func = function sandboxedObject(...args) {
      const vars = generateArgs(argNames, args);
      const res = executeTree(ticks, context, parsed, scope === undefined ? [] : [new Scope(scope, vars, this)])
      return res.result;
    }
  }
  sandboxedFunctions.add(func);
  return func;
}

export function createFunctionAsync(argNames: string[], parsed: LispItem, ticks: Ticks, context: IExecContext, scope?: Scope, name?: string) {
  if (context.ctx.options.forbidFunctionCreation) {
    throw new SandboxError("Function creation is forbidden");
  }
  if (!context.ctx.prototypeWhitelist?.has(Promise.prototype)) {
    throw new SandboxError("Async/await not permitted");
  }
  let func;
  if (name === undefined) {
    func = async (...args) => {
      const vars = generateArgs(argNames, args);
      const res = await executeTreeAsync(ticks, context, parsed, scope === undefined ? [] : [new Scope(scope, vars)])
      return res.result;
    }
  } else {
    func = async function sandboxedObject(...args) {
      const vars = generateArgs(argNames, args);
      const res = await executeTreeAsync(ticks, context, parsed, scope === undefined ? [] : [new Scope(scope, vars, this)])
      return res.result;
    }
  }
  sandboxedFunctions.add(func);
  return func;
}

export function sandboxedEval(func: SandboxFunction): sandboxedEval {
  return sandboxEval;
  function sandboxEval(code: string) {
    return func(code)();
  }
}

export function sandboxedSetTimeout(func: SandboxFunction): sandboxSetTimeout {
  return function sandboxSetTimeout(handler, ...args) {
    if (typeof handler !== 'string') return setTimeout(handler, ...args);
    return setTimeout(func(handler), ...args);
  }
}

export function sandboxedSetInterval(func: SandboxFunction): sandboxSetInterval {
  return function sandboxSetInterval(handler, ...args) {
    if (typeof handler !== 'string') return setInterval(handler, ...args);
    return setInterval(func(handler), ...args);
  }
}

export function assignCheck(obj: Prop, context: IExecContext, op = 'assign') {
  if(obj.context === undefined) {
    throw new ReferenceError(`Cannot ${op} value to undefined.`)
  }
  if(typeof obj.context !== 'object' && typeof obj.context !== 'function') {
    throw new SyntaxError(`Cannot ${op} value to a primitive.`)
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
      context.ctx.changeSubscriptions.get(obj.context)?.forEach((cb) => cb({type: "delete", prop: obj.prop}));
    }
  } else if (obj.context.hasOwnProperty(obj.prop)) {
    context.ctx.setSubscriptions.get(obj.context)?.get(obj.prop)?.forEach((cb) => cb({
      type: "replace"
    }));
  } else {
    context.ctx.changeSubscriptions.get(obj.context)?.forEach((cb) => cb({type: "create", prop: obj.prop}));
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
const literalRegex = /(\$\$)*(\$)?\${(\d+)}/g;
type OpCallback = (exec: Execution, done: Done, ticks: Ticks, a: LispItem|string[], b: LispItem|Lisp[], obj: Prop|any|undefined, context: IExecContext, scope: Scope, bobj?: Prop|any|undefined, inLoopOrSwitch?: string) => void;
let ops2: {[op:string]: OpCallback} = {
  'prop': (exec, done, ticks, a: LispItem|any, b: string, obj, context, scope) => {
    if(a === null) {
      throw new TypeError(`Cannot get property ${b} of null`);
    }
    const type = typeof a;
    if (type === 'undefined' && obj === undefined) {
      let prop = scope.get(b);
      if (prop.context === context.ctx.sandboxGlobal) {
        if (context.ctx.options.audit) {
          context.ctx.auditReport.globalsAccess.add(b);
        }
        const rep = context.ctx.globalsWhitelist.has(context.ctx.sandboxGlobal[b]) ? context.ctx.evals.get(context.ctx.sandboxGlobal[b]) : undefined;
        if (rep) {
          done(undefined, rep);
          return;
        }
      }
      if (prop.context && prop.context[b] === globalThis) {
        done(undefined, context.ctx.globalScope.get('this'));
        return;
      }

      context.ctx.getSubscriptions.forEach((cb) => cb(prop.context, prop.prop));
      done(undefined, prop);
      return;
    } else if (a === undefined) {
      throw new SandboxError("Cannot get property '" + b + "' of undefined")
    }

    if (type !== 'object') {
      if(type === 'number') {
        a = new Number(a);
      } else if(type === 'string') {
        a = new String(a);
      } else if(type === 'boolean') {
        a = new Boolean(a);
      }
    } else if (typeof a.hasOwnProperty === 'undefined') {
      done(undefined, new Prop(undefined, b));
      return;
    }

    const isFunction = type === 'function';
    let prototypeAccess = isFunction || !(a.hasOwnProperty(b) || typeof b === 'number');

    if (context.ctx.options.audit && prototypeAccess) {
      if (typeof b === 'string') {
        let prot = Object.getPrototypeOf(a);
        do {
          if (prot.hasOwnProperty(b)) {
            if(!context.ctx.auditReport.prototypeAccess[prot.constructor.name]) {
              context.ctx.auditReport.prototypeAccess[prot.constructor.name] = new Set();
            }
            context.ctx.auditReport.prototypeAccess[prot.constructor.name].add(b);
          }
        } while(prot = Object.getPrototypeOf(prot))
      }
    }

    if (prototypeAccess) {
      if (isFunction) {
        if (!['name', 'length', 'constructor'].includes(b) && a.hasOwnProperty(b)) {
          const whitelist = context.ctx.prototypeWhitelist.get(a.prototype);
          const replace = context.ctx.options.prototypeReplacements.get(a);
          if (replace) {
            done(undefined, new Prop(replace(a, true), b));
            return;
          }
          if (whitelist && (!whitelist.size || whitelist.has(b))) {
          } else {
            throw new SandboxError(`Static method or property access not permitted: ${a.name}.${b}`);
          }
        }
      } else if (b !== 'constructor') {
        let prot = a;
        while(prot = Object.getPrototypeOf(prot)) {
          if (prot.hasOwnProperty(b)) {
            const whitelist = context.ctx.prototypeWhitelist.get(prot);
            const replace = context.ctx.options.prototypeReplacements.get(prot.constuctor);
            if (replace) {
              done(undefined, new Prop(replace(a, false), b));
              return;
            }
            if (whitelist && (!whitelist.size || whitelist.has(b))) {
              break;
            }
            throw new SandboxError(`Method or property access not permitted: ${prot.constructor.name}.${b}`);
          }
        };
      }
    }

    if (context.ctx.evals.has(a[b])) {
      done(undefined, context.ctx.evals.get(a[b]));
      return;
    }
    if (a[b] === globalThis) {
      done(undefined, context.ctx.globalScope.get('this'));
      return;
    }

    let g = obj.isGlobal || (isFunction && !sandboxedFunctions.has(a)) || context.ctx.globalsWhitelist.has(a);

    if (!g) {
      context.ctx.getSubscriptions.forEach((cb) => cb(a, b));
    }
    done(undefined, new Prop(a, b, false, g));
  },
  'call': (exec, done, ticks, a, b: LispArray, obj, context, scope) => {
    if (context.ctx.options.forbidFunctionCalls) throw new SandboxError("Method calls are not allowed");
    if (typeof a !== 'function') {
      throw new TypeError(`${obj.prop} is not a function`);
    }
    const args = b.map((item) => {
      if (item instanceof SpreadArray) {
        return [...item.item];
      } else {
        return [item];
      }
    }).flat();
    execMany(ticks, exec, toLispArray(args), (err, vals) => {
      if (err) {
        done(err);
        return;
      }
      if (typeof obj === 'function') {
        done(undefined, obj(...vals));
        return;
      }
      if (obj.context[obj.prop] === JSON.stringify && context.ctx.getSubscriptions.size) {
        const cache = new Set<any>();
        const recurse = (x: any) => {
          if (!x || !(typeof x === 'object') || cache.has(x)) return;
          cache.add(x);
          for (let y in x) {
            context.ctx.getSubscriptions.forEach((cb) => cb(x, y));
            recurse(x[y]);
          }
        };
        recurse(vals[0]);
      }
  
      if (obj.context instanceof Array && arrayChange.has(obj.context[obj.prop]) && context.ctx.changeSubscriptions.get(obj.context)) {
        let change: Change;
        let changed = false;
        if (obj.prop === "push") {
          change = {
            type: "push",
            added: vals
          }
          changed = !!vals.length;
        } else if (obj.prop === "pop") {
          change = {
            type: "pop",
            removed: obj.context.slice(-1)
          }
          changed = !!change.removed.length;
        }  else if (obj.prop === "shift") {
          change = {
            type: "shift",
            removed: obj.context.slice(0, 1)
          }
          changed = !!change.removed.length;
        } else if (obj.prop === "unshift") {
          change = {
            type: "unshift",
            added: vals
          }
          changed = !!vals.length;
        } else if (obj.prop === "splice") {
          change = {
            type: "splice",
            startIndex: vals[0],
            deleteCount: vals[1] === undefined ? obj.context.length : vals[1],
            added: vals.slice(2),
            removed: obj.context.slice(vals[0], vals[1] === undefined ? undefined : vals[0] + vals[1])
          }
          changed = !!change.added.length || !!change.removed.length;
        } else if (obj.prop === "reverse" || obj.prop === "sort") {
          change = {type: obj.prop}
          changed = !!obj.context.length;
        } else if (obj.prop === "copyWithin") {
          let len = vals[2] === undefined ? obj.context.length - vals[1] : Math.min(obj.context.length, vals[2] - vals[1]);
          change = {
            type: "copyWithin",
            startIndex: vals[0],
            endIndex: vals[0] + len,
            added: obj.context.slice(vals[1], vals[1] + len),
            removed: obj.context.slice(vals[0], vals[0] + len)
          }
          changed = !!change.added.length || !!change.removed.length;
        }
        if (changed) {
          context.ctx.changeSubscriptions.get(obj.context)?.forEach((cb) => cb(change));
        }
      }
      done(undefined, obj.context[obj.prop](...vals));
    }, scope, context);
  },
  'createObject': (exec, done, ticks, a, b: LispArray, obj, context, scope) => {
    let res = {} as any;
    for (let item of b as (KeyVal|SpreadObject)[]) {
      if (item instanceof SpreadObject) {
        res = {...res, ...item.item};
      } else {
        res[item.key] = item.val;
      }
    }
    done(undefined, res);
  },
  'keyVal': (exec, done, ticks, a: string, b: LispItem) => done(undefined, new KeyVal(a, b)),
  'createArray': (exec, done, ticks, a, b: LispArray, obj, context, scope) => {
    const items = b.map((item) => {
      if (item instanceof SpreadArray) {
        return [...item.item];
      } else {
        return [item];
      }
    }).flat()
    execMany(ticks, exec, toLispArray(items), done, scope, context);
  },
  'group': (exec, done, ticks, a, b) => done(undefined, b),
  'string': (exec, done, ticks, a, b: string, obj, context) => done(undefined, context.constants.strings[b]),
  'regex': (exec, done, ticks, a, b: string, obj, context) => {
    const reg: IRegEx = context.constants.regexes[b];
    if (!context.ctx.globalsWhitelist.has(RegExp)) {
      throw new SandboxError("Regex not permitted");
    } else {
      done(undefined, new RegExp(reg.regex, reg.flags));
    }
  },
  'literal': (exec, done, ticks, a, b: number, obj, context, scope) => {
    let name: string = context.constants.literals[b].a;
    let found = toLispArray([]);
    let f;
    let resnums = [];
    while(f = literalRegex.exec(name)) {
      if (!f[2]) {
        found.push(context.constants.literals[b].b[parseInt(f[3], 10)]);
        resnums.push(f[3]);
      }
    }

    execMany(ticks, exec, found, (err, processed) => {
      const reses = {};
      if(err) {
        done(err);
        return;
      }
      for (let i in resnums) {
        const num = resnums[i];
        reses[num] = processed[i];
      }
      done(undefined, name.replace(/(\\\\)*(\\)?\${(\d+)}/g, (match, $$, $, num) => {
        if ($) return match;
        let res = reses[num]
        res =  res instanceof Prop ? res.get() : res;
        return ($$ ? $$ : '') + `${res}`;
      }));
    }, scope, context)
  },
  'spreadArray': (exec, done, ticks, a, b: LispItem, obj, context, scope) => {
    exec(ticks, b, scope, context, (err, res) => {
      if (err) {
        done(err);
        return;
      }
      done(undefined, new SpreadArray(res));
    });
  },
  'spreadObject': (exec, done, ticks, a, b: LispItem, obj, context, scope) => {
    exec(ticks, b, scope, context, (err, res) => {
      if (err) {
        done(err);
        return;
      }
      done(undefined, new SpreadObject(res));
    });
  },
  '!': (exec, done, ticks, a, b) => done(undefined, !b),
  '~': (exec, done, ticks, a, b) => done(undefined, ~b),
  '++$': (exec, done, ticks, a, b, obj, context) => {
    assignCheck(obj, context);
    done(undefined, ++obj.context[obj.prop]);
  },
  '$++': (exec, done, ticks, a, b, obj, context) => {
    assignCheck(obj, context);
    done(undefined, obj.context[obj.prop]++);
  },
  '--$': (exec, done, ticks, a, b, obj, context) => {
    assignCheck(obj, context);
    done(undefined, --obj.context[obj.prop]);
  },
  '$--': (exec, done, ticks, a, b, obj, context) => {
    assignCheck(obj, context);
    done(undefined, obj.context[obj.prop]--);
  },
  '=': (exec, done, ticks, a, b, obj, context) => {
    assignCheck(obj, context);
    obj.context[obj.prop] = b;
    done(undefined, new Prop(obj.context, obj.prop, false, obj.isGlobal));
  },
  '+=': (exec, done, ticks, a, b, obj, context) => {
    assignCheck(obj, context);
    done(undefined, obj.context[obj.prop] += b);
  },
  '-=': (exec, done, ticks, a, b: number, obj, context) => {
    assignCheck(obj, context);
    done(undefined, obj.context[obj.prop] -= b);
  },
  '/=': (exec, done, ticks, a, b: number, obj, context) => {
    assignCheck(obj, context);
    done(undefined, obj.context[obj.prop] /= b);
  },
  '*=': (exec, done, ticks, a, b: number, obj, context) => {
    assignCheck(obj, context);
    done(undefined, obj.context[obj.prop] *= b);
  },
  '**=': (exec, done, ticks, a, b: number, obj, context) => {
    assignCheck(obj, context);
    done(undefined, obj.context[obj.prop] **= b);
  },
  '%=': (exec, done, ticks, a, b: number, obj, context) => {
    assignCheck(obj, context);
    done(undefined, obj.context[obj.prop] %= b);
  },
  '^=': (exec, done, ticks, a, b: number, obj, context) => {
    assignCheck(obj, context);
    done(undefined, obj.context[obj.prop] ^= b);
  },
  '&=': (exec, done, ticks, a, b: number, obj, context) => {
    assignCheck(obj, context);
    done(undefined, obj.context[obj.prop] &= b);
  },
  '|=': (exec, done, ticks, a, b: number, obj, context) => {
    assignCheck(obj, context);
    done(undefined, obj.context[obj.prop] |= b);
  },
  '<<=': (exec, done, ticks, a, b: number, obj, context) => {
    assignCheck(obj, context);
    done(undefined, obj.context[obj.prop] <<= b);
  },
  '>>=': (exec, done, ticks, a, b: number, obj, context) => {
    assignCheck(obj, context);
    done(undefined, obj.context[obj.prop] >>= b);
  },
  '>>>=': (exec, done, ticks, a, b: number, obj, context) => {
    assignCheck(obj, context);
    done(undefined, obj.context[obj.prop] >>= b);
  },
  '?': (exec, done, ticks, a, b) => {
    if (!(b instanceof If)) {
      throw new SyntaxError('Invalid inline if')
    }
    done(undefined, a ? (b as any).t : (b as any).f);
  },
  '>': (exec, done, ticks, a, b) => done(undefined, a > b),
  '<': (exec, done, ticks, a, b) => done(undefined, a < b),
  '>=': (exec, done, ticks, a, b) => done(undefined, a >= b),
  '<=': (exec, done, ticks, a, b) => done(undefined, a <= b),
  '==': (exec, done, ticks, a, b) => done(undefined, a == b),
  '===': (exec, done, ticks, a, b) => done(undefined, a === b),
  '!=': (exec, done, ticks, a, b) => done(undefined, a != b),
  '!==': (exec, done, ticks, a, b) => done(undefined, a !== b),
  '&&': (exec, done, ticks, a, b) => done(undefined, a && b),
  '||': (exec, done, ticks, a, b) => done(undefined, a || b),
  '&': (exec, done, ticks, a: number, b: number) => done(undefined, a & b),
  '|': (exec, done, ticks, a: number, b: number) => done(undefined, a | b),
  ':': (exec, done, ticks, a, b) => done(undefined, new If(a, b)),
  '+': (exec, done, ticks, a: number, b: number) => done(undefined, a + b),
  '-': (exec, done, ticks, a: number, b: number) => done(undefined, a - b),
  '$+': (exec, done, ticks, a, b) => done(undefined, +b),
  '$-': (exec, done, ticks, a, b) => done(undefined, -b),
  '/': (exec, done, ticks, a: number, b: number) => done(undefined, a / b),
  '^': (exec, done, ticks, a: number, b: number) => done(undefined, a ^ b),
  '*': (exec, done, ticks, a: number, b: number) => done(undefined, a * b),
  '%': (exec, done, ticks, a: number, b: number) => done(undefined, a % b),
  '<<': (exec, done, ticks, a: number, b: number) => done(undefined, a << b),
  '>>': (exec, done, ticks, a: number, b: number) => done(undefined, a >> b),
  '>>>': (exec, done, ticks, a: number, b: number) => done(undefined, a >>> b),
  'typeof': (exec, done, ticks, a, b: LispItem, obj, context, scope) => {
    exec(ticks, b, scope, context, (e, prop) => {
      if (prop instanceof Prop) {
        if (prop.context === undefined) {
          prop = undefined;
        } else {
          prop = prop.context[prop.prop];
        }
      }
      done(undefined, typeof prop);
    });
  },
  'instanceof': (exec, done, ticks, a, b:  { new(): any }) => done(undefined, a instanceof b),
  'in': (exec, done, ticks, a: string, b) => done(undefined, a in b),
  'delete': (exec, done, ticks, a, b, obj, context, scope, bobj: Prop) => {
    if (bobj.context === undefined) {
      done(undefined, true);
      return;
    }
    assignCheck(bobj, context, 'delete');
    if (bobj.isVariable) {
      done(undefined, false);
      return;
    }
    done(undefined, delete bobj.context[bobj.prop]);
  },
  'return': (exec, done, ticks, a, b, obj, context) => done(undefined, b),
  'var': (exec, done, ticks, a: string, b: LispItem, obj, context, scope, bobj) => {
    exec(ticks, b, scope, context, (err, res) => {
      if (err) {
        done(err);
        return;
      }
      done(undefined, scope.declare(a, VarType.var, res));
    });
  },
  'let': (exec, done, ticks, a: string, b: LispItem, obj, context, scope, bobj) => {
    exec(ticks, b, scope, context, (err, res) => {
      if (err) {
        done(err);
        return;
      }
      done(undefined, scope.declare(a, VarType.let, res, bobj && bobj.isGlobal));
    });
  },
  'const': (exec, done, ticks, a: string, b: LispItem, obj, context, scope, bobj) => {
    exec(ticks, b, scope, context, (err, res) => {
      if (err) {
        done(err);
        return;
      }
      done(undefined, scope.declare(a, VarType.const, res));
    });
  },
  'arrowFunc': (exec, done, ticks, a: string[], b: LispItem, obj: Lisp, context, scope) => {
    a = [...a];
    if (typeof obj.b === "string" || obj.b instanceof CodeString) {
      obj.b = b = lispifyFunction(new CodeString(obj.b), context.constants);
    }
    if (a.shift()) {
      done(undefined, createFunctionAsync(a, b, ticks, context, scope));
    } else {
      done(undefined, createFunction(a, b, ticks, context, scope));
    }
  },
  'function': (exec, done, ticks, a: string[]&LispArray, b: LispItem, obj: Lisp, context, scope) => {
    if (typeof obj.b === "string" || obj.b instanceof CodeString) {
      obj.b = b = lispifyFunction(new CodeString(obj.b), context.constants);
    }
    let isAsync = a.shift();
    let name = a.shift();
    let func;
    if (isAsync) {
      func = createFunctionAsync(a, b, ticks, context, scope, name);
    } else {
      func = createFunction(a, b, ticks, context, scope, name);
    }
    if (name) {
      scope.declare(name, VarType.var, func);
    }
    done(undefined, func);
  },
  'inlineFunction': (exec, done, ticks, a: string[]&LispArray, b: LispItem, obj: Lisp, context, scope) => {
    if (typeof obj.b === "string" || obj.b instanceof CodeString) {
      obj.b = b = lispifyFunction(new CodeString(obj.b), context.constants);
    }
    let isAsync = a.shift();
    let name = a.shift();
    if (name) {
      scope = new Scope(scope, {})
    }
    let func;
    if (isAsync) {
      func = createFunctionAsync(a, b, ticks, context, scope, name);
    } else {
      func = createFunction(a, b, ticks, context, scope, name);
    }
    if (name) {
      scope.declare(name, VarType.let, func);
    }
    done(undefined, func);
  },
  'loop': (exec, done, ticks, a: LispArray, b: LispItem, obj, context, scope) => {
    const [checkFirst, startInternal, getIterator, startStep, step, condition, beforeStep] = a;
    let loop = true;
    const loopScope = new Scope(scope, {});
    let internalVars = {
      '$$obj': undefined
    };
    const interalScope = new Scope(loopScope, internalVars);
    if (exec === execAsync) {
      (async() => {
        await asyncDone((d) => exec(ticks, startStep, loopScope, context, d));
        internalVars['$$obj'] = (await asyncDone((d) => exec(ticks, getIterator, loopScope, context, d))).result;
        await asyncDone((d) => exec(ticks, startInternal, interalScope, context, d));
        if (checkFirst) loop = (await asyncDone((d) => exec(ticks, condition, interalScope, context, d))).result;
        while (loop) {
          let innerLoopVars = {};
          await asyncDone((d) => exec(ticks, beforeStep, new Scope(interalScope, innerLoopVars), context, d));
          let res = await executeTreeAsync(ticks, context, b, [new Scope(loopScope, innerLoopVars)], "loop");
          if (res instanceof ExecReturn && res.returned) {
            done(undefined, res);
            return;
          }
          if (res instanceof ExecReturn && res.breakLoop) {
            break;
          }
          await asyncDone((d) => exec(ticks, step, interalScope, context, d));
          loop = (await asyncDone((d) => exec(ticks, condition, interalScope, context, d))).result;
        }
        done();
      })().catch(done);
    } else {
      syncDone((d) => exec(ticks, startStep, loopScope, context, d));
      internalVars['$$obj'] = syncDone((d) => exec(ticks, getIterator, loopScope, context, d)).result;
      syncDone((d) => exec(ticks, startInternal, interalScope, context, d));
      if (checkFirst) loop = (syncDone((d) => exec(ticks, condition, interalScope, context, d))).result;
      while (loop) {
        let innerLoopVars = {};
        syncDone((d) => exec(ticks, beforeStep, new Scope(interalScope, innerLoopVars), context, d));
        let res = executeTree(ticks, context, b, [new Scope(loopScope, innerLoopVars)], "loop");
        if (res instanceof ExecReturn && res.returned) {
          done(undefined, res);
          return;
        }
        if (res instanceof ExecReturn && res.breakLoop) {
          break;
        }
        syncDone((d) => exec(ticks, step, interalScope, context, d));
        loop = (syncDone((d) => exec(ticks, condition, interalScope, context, d))).result;
      }
      done();
    }
  },
  'loopAction': (exec, done, ticks, a: LispItem, b: LispItem, obj, context, scope, bobj, inLoopOrSwitch) => {
    if ((inLoopOrSwitch === "switch" && a === "continue") || !inLoopOrSwitch) {
      throw new SandboxError("Illegal " + a + " statement");
    }
    done(undefined, new ExecReturn(context.ctx.auditReport, undefined, false, a === "break", a === "continue"));
  },
  'if': (exec, done, ticks, a: LispItem, b: If, obj, context, scope, bobj, inLoopOrSwitch) => {
    if (!(b instanceof If)) {
      throw new SyntaxError('Invalid if')
    }
    exec(ticks, a, scope, context, (err, res) => {
      if (err) {
        done(err);
        return;
      }
      executeTreeWithDone(exec, done, ticks, context, res ? b.t : b.f, [new Scope(scope)], inLoopOrSwitch);
    });
  },
  'switch': (exec, done, ticks, a: LispItem, b: Lisp[], obj, context, scope) => {
    exec(ticks, a, scope, context, (err, toTest) => {
      if (err) {
        done(err);
        return;
      }
      if (exec === execSync) {
        let res: ExecReturn;
        let isTrue = false;
        for (let caseItem of b) {
          if (isTrue || (isTrue = !caseItem.a || toTest === valueOrProp((syncDone((d) => exec(ticks, caseItem.a, scope, context, d))).result))) {
            if (!caseItem.b) continue;
            res = executeTree(ticks, context, caseItem.b, [scope], "switch");
            if (res.breakLoop) break;
            if (res.returned) {
              done(undefined, res);
              return;
            }
            if (!caseItem.a) { // default case
              break;
            }
          }
        }
        done();
      } else {
        (async () => {
          let res: ExecReturn;
          let isTrue = false;
          for (let caseItem of b) {
            if (isTrue || (isTrue = !caseItem.a || toTest === valueOrProp((await asyncDone((d) => exec(ticks, caseItem.a, scope, context, d))).result))) {
              if (!caseItem.b) continue;
              res = await executeTreeAsync(ticks, context, caseItem.b, [scope], "switch");
              if (res.breakLoop) break;
              if (res.returned) {
                done(undefined, res);
                return;
              }
              if (!caseItem.a) { // default case
                break;
              }
            }
          }
          done();
        })().catch(done)
      }
    });
  },
  'try': (exec, done, ticks, a: LispItem, b: [string, LispItem, LispItem]&LispArray, obj, context, scope, bobj, inLoopOrSwitch) => {
    const [exception, catchBody, finallyBody] = b;
    executeTreeWithDone(exec, (err, res) => {
      executeTreeWithDone(exec, (e) => {
        if (e) done(e);
        else  if (err) {
          let sc = {};
          if (exception) sc[exception] = err;
          executeTreeWithDone(exec, done, ticks, context, catchBody, [new Scope(scope)], inLoopOrSwitch);
        } else {
          done(undefined, res);
        }
      }, ticks, context, finallyBody, [new Scope(scope, {})]);
    }, ticks, context, a, [new Scope(scope)], inLoopOrSwitch);
  },
  'void': (exec, done, ticks, a) => {done()},
  'new': (exec, done, ticks, a: new (...args: any[]) => any, b: any, obj, context) => {
    if (!context.ctx.globalsWhitelist.has(a) && !sandboxedFunctions.has(a)) {
      throw new SandboxError(`Object construction not allowed: ${a.constructor.name}`)
    }
    done(undefined, new a(...b))
  },
  'throw': (exec, done, ticks, a) => { done(a) },
  'multi': (exec, done, ticks, a: any[]) => done(undefined, a.pop())
}

export let ops = new Map<string, OpCallback>();
for (let op in ops2) {
  ops.set(op, ops2[op]);
}

function valueOrProp(a: any) {
  if (a instanceof Prop) return a.get();
  return a;
}

export function execMany(ticks: Ticks, exec: Execution, tree: LispArray, done: Done, scope: Scope, context: IExecContext, inLoopOrSwitch?: string) {
  if (exec === execSync) {
    _execManySync(ticks, tree, done, scope, context, inLoopOrSwitch);
  } else {
    _execManyAsync(ticks, tree, done, scope, context, inLoopOrSwitch).catch(done);
  }
}

function _execManySync(ticks: Ticks, tree: LispArray, done: Done, scope: Scope, context: IExecContext, inLoopOrSwitch?: string) {
  let ret = [];
  for (let i = 0; i < tree.length; i++) {
    let res;
    try {
      res = syncDone((d) => execSync(ticks, tree[i], scope, context, d, inLoopOrSwitch)).result;
    } catch(e) {
      done(e);
      return;
    }
    if (res instanceof ExecReturn && (res.returned || res.breakLoop || res.continueLoop)) {
      done(undefined, res);
      return;
    }
    ret.push(res);
  }
  done(undefined, ret);
}

async function _execManyAsync(ticks: Ticks, tree: LispArray, done: Done, scope: Scope, context: IExecContext, inLoopOrSwitch?: string) {
  let ret = [];
  for (let i = 0; i < tree.length; i++) {
    let res;
    try {
      res = (await asyncDone((d) => execAsync(ticks, tree[i], scope, context, d, inLoopOrSwitch))).result;
    } catch(e) {
      done(e);
      return;
    }
    if (res instanceof ExecReturn && (res.returned || res.breakLoop || res.continueLoop)) {
      done(undefined, res);
      return;
    }
    ret.push(res);
  }
  done(undefined, ret);
}

type Execution = (ticks: Ticks, tree: LispItem, scope: Scope, context: IExecContext, done: Done, inLoopOrSwitch?: string) => void

export function asyncDone(callback: (done: Done) => void): Promise<{result: any}> {
  return new Promise((resolve, reject) => {
    callback((err, result) => {
      if (err) reject(err);
      else resolve({result});
    });
  });
}

export function syncDone(callback: (done: Done) => void): {result: any} {
  let result;
  let err;
  callback((e, r) => {
    err = e;
    result = r;
  });
  if (err) throw err;
  return {result};
}

export async function execAsync(ticks: Ticks, tree: LispItem, scope: Scope, context: IExecContext, doneOriginal: Done, inLoopOrSwitch?: string): Promise<void> {
  let done: Done = doneOriginal;
  const p = new Promise<void>((resolve) => {
    done = (e, r?) => {
      doneOriginal(e, r);
      resolve();
    }
  });
  if(_execNoneRecurse(ticks, tree, scope, context, done, true, inLoopOrSwitch)) {
  } else if (tree instanceof Lisp) {
    let obj;
    try {
      obj = (await asyncDone((d) => execAsync(ticks, tree.a, scope, context, d, inLoopOrSwitch))).result;
    } catch (e) {
      done(e);
      return;
    }
    let a = obj;
    try {
      a = obj instanceof Prop ? obj.get() : obj;
    } catch (e) {
      done(e);
      return
    }
    let op = tree.op;
    if (op === '?prop' || op === '?call') {
      if (a === undefined || a === null) {
        done(undefined, optional);
        return;
      }
      op = op.slice(1);
    }
    if (a === optional) {
      if (op === 'prop' || op === 'call') {
        done(undefined, a);
        return;
      } else {
        a = undefined;
      }
    }
    let bobj;
    try {
      bobj = (await asyncDone((d) => execAsync(ticks, tree.b, scope, context, d, inLoopOrSwitch))).result;
    } catch (e) {
      done(e);
      return;
    }
    let b = bobj;
    try {
      b = bobj instanceof Prop ? bobj.get() : bobj;
    } catch (e) {
      done(e);
      return
    }
    if (b === optional) {
      b = undefined;
    }
    if (ops.has(op)) {
      try {
        ops.get(op)(execAsync, done, ticks, a, b, obj, context, scope, bobj, inLoopOrSwitch);
      } catch (err) {
        done(err);
      }
    } else {
      done(new SyntaxError('Unknown operator: ' + op));
    }
  }
  await p;
}


export function execSync(ticks: Ticks, tree: LispItem, scope: Scope, context: IExecContext, done: Done, inLoopOrSwitch?: string) {
  if(_execNoneRecurse(ticks, tree, scope, context, done, false, inLoopOrSwitch)) {
  } else if (tree instanceof Lisp) {
    let obj;
    try {
      obj = syncDone((d) => execSync(ticks, tree.a, scope, context, d, inLoopOrSwitch)).result;
    } catch (e) {
      done(e);
      return;
    }
    let a = obj;
    try {
      a = obj instanceof Prop ? obj.get() : obj;
    } catch (e) {
      done(e);
      return
    }
    let op = tree.op;
    if (op === '?prop' || op === '?call') {
      if (a === undefined || a === null) {
        done(undefined, optional);
        return;
      }
      op = op.slice(1);
    }
    if (a === optional) {
      if (op === 'prop' || op === 'call') {
        done(undefined, a);
        return;
      } else {
        a = undefined;
      }
    }
    let bobj;
    try {
      bobj = syncDone((d) => execSync(ticks, tree.b, scope, context, d, inLoopOrSwitch)).result;
    } catch (e) {
      done(e);
      return;
    }
    let b = bobj;
    try {
      b = bobj instanceof Prop ? bobj.get() : bobj;
    } catch (e) {
      done(e);
      return
    }
    if (b === optional) {
      b = undefined;
    }
    if (ops.has(op)) {
      try {
        ops.get(op)(execSync, done, ticks, a, b, obj, context, scope, bobj, inLoopOrSwitch);
      } catch (err) {
        done(err);
      }
    } else {
      done(new SyntaxError('Unknown operator: ' + op));
    }
  }
}

const unexecTypes = new Set(['arrowFunc', 'function', 'inlineFunction', 'loop', 'try', 'switch', 'if', 'typeof']);

function _execNoneRecurse(ticks: Ticks, tree: LispItem, scope: Scope, context: IExecContext, done: Done, isAsync: boolean, inLoopOrSwitch?: string): boolean {
  const exec = isAsync ? execAsync : execSync;
  if (tree instanceof Prop) {
    done(undefined, tree.get());
  } else if (Array.isArray(tree) && tree.lisp === lispArrayKey) {
    execMany(ticks, exec, tree, done, scope, context, inLoopOrSwitch);
  } else if (!(tree instanceof Lisp)) {
    done(undefined, tree);
  } else if (unexecTypes.has(tree.op)) {
    try {
      ops.get(tree.op)(exec, done, ticks, tree.a, tree.b, tree, context, scope, undefined, inLoopOrSwitch);
    } catch (err) {
      done(err);
    }
  } else if (tree.op === 'await') {
    if (!isAsync) {
      done(new SandboxError("Illegal use of 'await', must be inside async function"));
    } else if (context.ctx.prototypeWhitelist?.has(Promise.prototype)) {
      execAsync(ticks, tree.a, scope, context, async (e, r) => {
        if (e) done(e);
        else try {
          done(undefined, await r);
        } catch(err) {
          done(err);
        }
      }, inLoopOrSwitch).catch(done);
    } else {
      done(new SandboxError('Async/await is not permitted'))
    }
  } else {
    return false;
  }
  return true;
}
export function executeTree(ticks: Ticks, context: IExecContext, executionTree: LispItem, scopes: (IScope)[] = [], inLoopOrSwitch?: string): ExecReturn {
  return syncDone((done) => executeTreeWithDone(execSync, done, ticks, context, executionTree, scopes, inLoopOrSwitch)).result;
}

export async function executeTreeAsync(ticks: Ticks, context: IExecContext, executionTree: LispItem, scopes: (IScope)[] = [], inLoopOrSwitch?: string): Promise<ExecReturn> {
  return (await asyncDone((done) => executeTreeWithDone(execAsync, done, ticks, context, executionTree, scopes, inLoopOrSwitch))).result;
}

function executeTreeWithDone(exec: Execution, done: Done, ticks: Ticks, context: IExecContext, executionTree: LispItem, scopes: (IScope)[] = [], inLoopOrSwitch?: string) {
  if (!executionTree)  {
    done();
    return;
  }
  if (!(executionTree instanceof Array)) {
    throw new SyntaxError('Bad execution tree');
  }
  let scope = context.ctx.globalScope;
  let s;
  while (s = scopes.shift()) {
    if (typeof s !== "object") continue;
    if (s instanceof Scope) {
      scope = s;
    } else {
      scope = new Scope(scope, s, s instanceof LocalScope ? undefined : null);
    }
  }
  if (context.ctx.options.audit && !context.ctx.auditReport) {
    context.ctx.auditReport = {
      globalsAccess: new Set(),
      prototypeAccess: {},
    }
  }
  if (exec === execSync) {
    _executeWithDoneSync(done, ticks, context, executionTree, scope, inLoopOrSwitch);
  } else {
    _executeWithDoneAsync(done, ticks, context, executionTree, scope, inLoopOrSwitch).catch(done);
  }
}

function _executeWithDoneSync(done: Done, ticks: Ticks, context: IExecContext, executionTree: LispItem, scope: Scope, inLoopOrSwitch?: string) {
  if (!(executionTree instanceof Array)) throw new SyntaxError('Bad execution tree');
  let i = 0;
  for (i = 0; i < executionTree.length; i++) {
    let res;
    let err;
    const current = executionTree[i];
    try {
      execSync(ticks, current, scope, context, (e, r) => {
        err = e;
        res = r;
      }, inLoopOrSwitch);
    } catch (e) {
      err = e;
    }
    if (err) {
      done(err);
      return;
    }
    if (res instanceof ExecReturn) {
      done(undefined, res);
      return;
    }
    if (current instanceof Lisp && current.op === 'return') {
      done(undefined, new ExecReturn(context.ctx.auditReport, res, true))
      return;
    }
  }
  done(undefined, new ExecReturn(context.ctx.auditReport, undefined, false));
}

async function _executeWithDoneAsync(done: Done, ticks: Ticks, context: IExecContext, executionTree: LispItem, scope: Scope, inLoopOrSwitch?: string) {
  if (!(executionTree instanceof Array)) throw new SyntaxError('Bad execution tree');
  let i = 0;
  for (i = 0; i < executionTree.length; i++) {
    let res;
    let err;
    const current = executionTree[i];
    try {
      await execAsync(ticks, current, scope, context, (e, r) => {
        err = e;
        res = r;
      }, inLoopOrSwitch);
    } catch (e) {
      err = e;
    }
    if (err) {
      done(err);
      return;
    }
    if (res instanceof ExecReturn) {
      done(undefined, res);
      return;
    }
    if (current instanceof Lisp && current.op === 'return') {
      done(undefined, new ExecReturn(context.ctx.auditReport, res, true))
      return;
    }
  }
  done(undefined, new ExecReturn(context.ctx.auditReport, undefined, false));
}
