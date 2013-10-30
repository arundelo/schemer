// A Lisp implementation.  Features and function names are inspired by the
// Scheme dialect used in The Little Schemer and The Seasoned Schemer.

"use strict";

(function() {

// Some constants:
var EOF = {toString: function() {return "EOF";}},
    // BIGPRECISEINT is 9007199254740992, the biggest a double can get before
    // losing the precision necessary to represent a specific integer:
    BIGPRECISEINT = Math.pow(2, 53),
    EMPTYLIST = {toString: function() {return "()";}},
    KEYCODEENTER = 13;

var Tokenizer = function(inputstring, pos) {
    this.input = inputstring.replace(/\r\n|\n\r|\r/g, "\n");
    // pos is the position at which to start looking for the next token:
    this.pos = pos || 0;
    // pos is the line currently being read.  (After get() is called, it will
    // be the line the token was found on.)
    this.linenum = 1;
    // atomchre (atom character r.e.) matches a character in an atom (any ASCII
    // character except for whitespace, controls, single quote, parentheses,
    // and semicolon):
    this.atomchre = /[!-&*-:<-~]/;
    this.prevtok = null;
    this.ungotten = false;
};

// Throws an exception with some extra information:
Tokenizer.prototype.mythrow = function(message, notusersfault) {
    if (notusersfault) {
        // The user should not be able to make this happen:
        message = "Not your fault: " + message;
    }

    throw new Error(message + " at line " + this.linenum);
};

// Skips past whitespace and comments:
Tokenizer.prototype.munchwhitespace = function() {
    var incomment = false,
        loop = true,
        ch;

    while (loop) {
        ch = this.input.charAt(this.pos);

        if (incomment) {
            if (ch === "\n") {
                this.pos++;
                this.linenum++;
                incomment = false;
            } else if (ch === "") {
                // End of input.
                loop = false;
            } else {
                this.pos++;
            }
        } else {
            if (ch === " " || ch === "\t") {
                this.pos++;
            } else if (ch === "\n") {
                this.pos++;
                this.linenum++;
            } else if (ch === ";") {
                this.pos++;
                incomment = true;
            } else {
                loop = false;
            }
        }
    }
};

// Returns the atom starting at the current position:
Tokenizer.prototype.readatom = function() {
    var atom = "",
        ch, num;

    while (true) {
        ch = this.input.charAt(this.pos);

        if (ch.search(this.atomchre) != -1) {
            atom += ch;
            this.pos++;
        } else {
            break;
        }
    }

    // Is it a number?  (Whole numbers in non-scientific decimal notation
    // only.)
    if (atom.search(/^-?[0-9]+$/) != -1) {
        num = parseInt(atom, 10);

        // Make sure it's a real number and it has whole-number precision:
        if (isFinite(num)
            && Math.abs(num) <= BIGPRECISEINT
            // Make sure it round-trips (this is an easy way to catch
            // 9007199254740993, which passes the Math.abs test because it
            // rounds to 9007199254740992):
            && num.toString() === atom
        ) {
            atom = num;
        } else if (atom.charAt(0) === "-") {
            this.mythrow("Number (" + atom +
                ") too low (should be no lower than -" + BIGPRECISEINT + ")");
        } else {
            this.mythrow("Number (" + atom +
                ") too high (should be no higher than " + BIGPRECISEINT + ")");
        }
    } else if (atom == "#t") {
        return true;
    } else if (atom == "#f") {
        return false;
    }

    return atom;
};

Tokenizer.prototype.get = function() {
    var ch, tok;

    if (this.ungotten) {
        // unget() was called; return the token we returned last time:
        this.ungotten = false;
        tok = this.prevtok;
    } else {
        this.munchwhitespace();

        if (this.pos >= this.input.length) {
            tok = EOF;
        } else {
            ch = this.input.charAt(this.pos);

            if (ch.search(/^[()']$/) != -1) {
                // A single-character token.
                this.pos++;
                tok = ch;
            } else if (ch.search(this.atomchre) != -1) {
                tok = this.readatom();
            } else {
                this.pos++;
                tok = "?";
            }
        }
    }

    this.prevtok = tok;

    return tok;
};

Tokenizer.prototype.unget = function() {
    if (this.prevtok === null) {
        this.mythrow("Unexpected unget", true);
    } else if (this.ungotten) {
        this.mythrow("Multi-level unget not supported", true);
    }

    this.ungotten = true;
};

var Pair = function(car, cdr) {
    this.car = car;
    this.cdr = cdr;
};

// Returns a string representation of a list without the open paren:
Pair.prototype.toStringHelper = function() {
    if (this.cdr === EMPTYLIST) {
        return lisptostring(this.car) + ")";
    } else if (this.cdr instanceof Pair) {
        return lisptostring(this.car) + " " + this.cdr.toStringHelper();
    } else {
        return lisptostring(this.car) + " . " + lisptostring(this.cdr) + ")";
    }
};

Pair.prototype.toString = function() {
    return "(" + this.toStringHelper();
};

// A placeholder value to use as the result of an expression whose value is
// undefined and should not be used.  Among other things, this lets the main
// loop refrain from printing something every time there's a define.  More
// generally, the idea is that if an expression's result is undefined and that
// result is not thrown away, there should be an error.  Currently there is not
// enough error checking so it is possible to make data structures that include
// undefined values (e.g., "(list (set! foo 'bar))").
var Undeffed = function(source) {
    this.source = source;
};

// A quick way to make an error about how an undefined value was used.  FIXME:
// This should be used in more places (but ideally that can be combined with
// more abstracted error handling).
Undeffed.prototype.error = function(site) {
    return new Error(site + ": (" + this.source + " ...) has no value");
};

Undeffed.prototype.toString = function() {
    return "#[undefined: " + this.source + "]";
};

// Returns the cdr of a dotted list whose dot has already been read.  (Dotted
// lists are never used in The Little Schemer.  They break the Law of Cdr and
// the Law of Cons.)
var readdottedlistcdr = function(tokenizer) {
    var expr, tok;

    expr = read(tokenizer, true);
    tok = tokenizer.get();
    if (tok === EOF) {
        tokenizer.mythrow("Unexpected end of input");
    } else if (tok !== ")") {
        tokenizer.mythrow("Malformed dotted list");
    }

    return expr;
};

// Returns the list whose open paren has already been read:
var readlist = function(tokenizer) {
    var tok = tokenizer.get();

    if (tok === ")") {
        return EMPTYLIST;
    } else if (tok === ".") {
        // Note that accepting a dot here means that the degenerate dotted list
        // case of "(. foo)" is valid.  It is read as "foo".
        return readdottedlistcdr(tokenizer);
    } else {
        tokenizer.unget();
        return new Pair(read(tokenizer, true), readlist(tokenizer));
    }
};

// Returns the internal representation (a string, number, Pair, or EMPTYLIST)
// of the next expression in tokenizer, or EOF if there is no expression there.
// If noeof is true, throws an exception instead of returning EOF.
var read = function(tokenizer, noeof) {
    var tok = tokenizer.get();

    if (tok === EOF) {
        if (noeof) {
            tokenizer.mythrow("Unexpected end of input");
        } else {
            return EOF;
        }
    } else if (tok === "(") {
        return readlist(tokenizer);
    } else if (tok === ")") {
        tokenizer.mythrow("Unexpected \")\"");
    } else if (tok === "'") {
        return new Pair("quote", new Pair(read(tokenizer, true), EMPTYLIST));
    } else if (tok === ".") {
        tokenizer.mythrow("Unexpected \".\"");
    } else {
        return tok;
    }
};

var Closure = function(lambdacdr, env) {
    this.formals = lambdacdr.car;

    if (this.formals !== EMPTYLIST && !(this.formals instanceof Pair)) {
        throw new Error(
            "lambda's second argument must be a list, not " + formals);
    }

    this.body = lambdacdr.cdr.car;
    this.env = env;
};

Closure.prototype.toString = function() {
    return "#closure";
};

// Built-in functions.  These all take a single JavaScript argument that is a
// list of their (already evaluated) Lisp arguments.  For simplicity, they
// return a value (rather than taking a continuation and returning a thunk), so
// some of them do grow the JavaScript stack, but only a limited amount.
// (E.g., builtin_plus recurses once for each argument.)  FIXME:  They should
// check how many arguments they're called with and that they're the right
// types.
var builtins = {
    "+": function builtin_plus(args) {
        if (args === EMPTYLIST) {
            return 0;
        } else {
            return args.car + builtin_plus(args.cdr);
        }
    },

    "*": function builtin_times(args) {
        if (args === EMPTYLIST) {
            return 1;
        } else {
            return args.car * builtin_times(args.cdr);
        }
    },

    list: function builtin_list(args) {
        return args;
    },

    cons: function builtin_cons(args) {
        var a = args.car,
            d = args.cdr.car;
        if (a instanceof Undeffed) {
            throw a.error("cons");
        } else if (d instanceof Undeffed) {
            throw d.error("cons");
        }
        return new Pair(a, d);
    },

    car: function builtin_car(args) {
        return args.car.car;
    },

    cdr: function builtin_cdr(args) {
        return args.car.cdr;
    },

    "eq?": function builtin_eq(args) {
        // FIXME:  In The Little Schemer it's undefined to ask eq? about lists
        // or numbers.
        return args.car === args.cdr.car;
    },

    "null?": function builtin_nullp(args) {
        return args.car === EMPTYLIST;
    },

    alert: function builtin_alert(args) {
        window.alert(args);
        return args;
    },

    "atom?": function builtin_atom(args) {
        return args.car !== EMPTYLIST && !(args.car instanceof Pair);
    },

    "<": function builtin_lt(args) {
        return args.car < args.cdr.car;
    },

    ">": function builtin_gt(args) {
        return args.car > args.cdr.car;
    },

    "-": function builtin_minus(args) {
        return args.car - args.cdr.car;
    },

    "add1": function builtin_add1(args) {
        return args.car + 1;
    },

    "sub1": function builtin_sub1(args) {
        return args.car - 1;
    },

    "not": function builtin_not(args) {
        return args.car === false;
    },

    "current-milliseconds": function builtin_current_milliseconds(args) {
        return Math.floor(Date.now());
    }
};

// A custom toString method for built-in functions and continuations:
var functioncustomtostring = function() {
    return "#" + this.name;
};

// Give the built-in functions their toString method:
for (var lispname in builtins) {
    if (builtins.hasOwnProperty(lispname)) {
        builtins[lispname].toString = functioncustomtostring;;
    };
};

var isselfevaluating = function(expr) {
    return typeof expr == "number"
        || typeof expr == "boolean"
        || expr == EMPTYLIST;
};

var list = function() {
    var rest;

    if (arguments.length == 0) {
        return EMPTYLIST;
    } else {
        rest = [].slice.call(arguments, 1);
        return new Pair(arguments[0], list.apply(list, rest));
    }
};

var listtoarray = function(l) {
    var arr = [],
        i = 0;

    for (i = 0; l !== EMPTYLIST; l = l.cdr) {
        arr[i++] = l.car;
    }

    return arr;
};

// Returns true only if the length of l is between min and max (inclusive):
var lengthbetween = function(l, min, max) {
    if (l == EMPTYLIST) {
        return min <= 0 && max >= 0;
    } else if (max <= 0) {
        return false;
    } else {
        return lengthbetween(l.cdr, min - 1, max - 1);
    }
};

// Special operators; each function takes an unevaluated list of "arguments",
// an environment, and a continuation, and returns a thunk like that returned
// by evl:
var operators = {
    quote: function(args, env, cont) {
        if (lengthbetween(args, 1, 1)) {
            return function() {
                return cont(args.car);
            };
        } else {
            throw new Error("quote must take exactly one argument.");
        }
    },

    "if": function(args, env, cont) {
        if (lengthbetween(args, 3, 3)) {
            var argsarr = listtoarray(args);

            return function() {
                var ifcont = function(condres) {
                    if (condres instanceof Undeffed) {
                        throw condres.error("if");
                    }
                    return evl(argsarr[condres ? 1 : 2], env, cont);
                };

                return evl(argsarr[0], env, ifcont);
            };
        } else {
            throw new Error("if must take exactly three arguments");
        }
    },

    lambda: function(args, env, cont) {
        if (lengthbetween(args, 2, 2)) {
            return function() {
                return cont(new Closure(args, env));
            };
        } else {
            throw new Error("lambda must take exactly two arguments");
        }
    },

    letcc: function(args, env, cont) {
        if (lengthbetween(args, 2, 2)) {
            var ccname = args.car,
                body = args.cdr.car,
                letccmap = {};

            // apply uses the name "cc" to know that it can throw away the
            // continuation it normally would pass control to and use this one
            // instead.
            letccmap[ccname] = function cc(ccargs) {
                if (lengthbetween(ccargs, 1, 1)) {
                    return cont(ccargs.car);
                } else {
                    throw new Error(
                        "A continuation must have exactly one argument");
                }
            };

            letccmap[ccname].toString = functioncustomtostring;

            return function() {
                return evl(body, new Env(letccmap, env), cont);
            };
        } else {
            throw new Error("letcc must take exactly two arguments");
        }
    },

    define: function(args, env, cont) {
        if (lengthbetween(args, 2, 2)) {
            var name = args.car,
                valexpr = args.cdr.car;

            if (typeof name != "string") {
                throw new Error(
                    "define's first argument must be a name, not " + name);
            }

            return function() {
                var assign = function(val) {
                    env.globalenv.map[name] = val;
                    return cont(new Undeffed("define"));
                };

                return evl(valexpr, env, assign);
            };
        } else {
            throw new Error("define must have exactly two arguments");
        }
    },

    begin: function(args, env, cont) {
        if (args === EMPTYLIST) {
            throw new Error("begin needs at least one argument");
        }

        var beginhelper = function beginhelper(args) {
            return function() {
                if (args.cdr == EMPTYLIST) {
                    // We are at the end; evaluate and return the last value.
                    return evl(args.car, env, cont);
                } else {
                    // cdr down the list.
                    var begincont = function(ignored) {
                            return beginhelper(args.cdr);
                    };

                    return evl(args.car, env, begincont);
                }
            };
        };

        return beginhelper(args);
    },

    "set!": function(args, env, cont) {
        var argsarr = listtoarray(args);

        if (argsarr.length != 2) {
            throw new Error("set! needs exactly two arguments");
        }

        var name = argsarr[0],
            valexpr = argsarr[1];

        if (typeof name != "string") {
            throw new Error("set!'s first argument must be an identifier");
        }

        if (env.isset(name)) {
            return function() {
                var assign = function(val) {
                    env.set(name, val);
                    return cont(new Undeffed("set!"));
                };

                return evl(valexpr, env, assign);
            };
        } else {
            // FIXME: The Seasoned Schemer creates a global binding in this
            // case (pp. 91-95).
            throw new Error(
                "Cannot set! " + name + " -- not defined or not in scope");
        }
    },

    // apply is an operator rather than a builtin so it won't grow the
    // JavaScript stack:
    apply: function(args, env, cont) {
        if (args === EMPTYLIST || args.cdr === EMPTYLIST ||
            args.cdr.cdr !== EMPTYLIST
        ) {
            throw new Error("apply needs 2 arguments");
        }

        return function() {
            var evalarglist = function(fn) {
                return function() {
                    var applyfntoarglist = function(arglist) {
                        return apply(fn, arglist, cont);
                    };

                    return evl(args.cdr.car, env, applyfntoarglist);
                };
            };

            return evl(args.car, env, evalarglist);
        };
    }
};

// Takes a Lisp expression, an environment, and a continuation; returns a thunk
// that when called evaluates the expression, passes the value to the
// continuation, and returns whatever the continuation returns.  (This is
// called "evl" instead of "eval" because "use strict" doesn't allow binding to
// the latter name.)
var evl = function(expr, env, cont) {
    if (isselfevaluating(expr)) {
        return function() {
            return cont(expr);
        };
    } else if (expr instanceof Pair) {
        var oporfn = expr.car, // An operator or (unevaluated) function.
            args = expr.cdr; // Arguments (also unevaluated).

        if (typeof oporfn == "string" && operators.hasOwnProperty(oporfn)) {
            return operators[oporfn](args, env, cont);
        } else {
            return function() {
                var evalargs = function(fn) {
                    var applyfntoargs = function(args) {
                        return apply(fn, args, cont);
                    };

                    return evlis(args, env, applyfntoargs);
                };

                return evl(oporfn, env, evalargs);
            };
        }
    } else if (typeof expr == "string") {
        return function() {
            return cont(env.get(expr));
        };
    } else {
        throw new Error("I don't know how to evaluate " + expr);
    }
};

// Like evl, but evaluates a list of expressions:
var evlis = function(exprs, env, cont) {
    if (exprs === EMPTYLIST) {
        return function() {
            return cont(EMPTYLIST);
        };
    } else {
        return function() {
            var evalrest = function(evaledfirst) {
                var consfirstonrest = function(evaledrest) {
                    return cont(new Pair(evaledfirst, evaledrest));
                };

                return evlis(exprs.cdr, env, consfirstonrest);
            };

            return evl(exprs.car, env, evalrest);
        };
    }
};

// Applies a function (already evaluated) to a list of arguments (already
// evaluated); returns a thunk that calls the given continuation with the
// result:
var apply = function(fn, args, cont) {
    if (fn instanceof Closure) {
        var formals = fn.formals,
            applymap = {};

        while (formals !== EMPTYLIST && args !== EMPTYLIST) {
            applymap[formals.car] = args.car;
            formals = formals.cdr;
            args = args.cdr;
        }

        if (args !== EMPTYLIST) {
            throw new Error("Not enough arguments");
        } else if (formals !== EMPTYLIST) {
            throw new Error("Too many arguments");
        }

        return function() {
            return evl(fn.body, new Env(applymap, fn.env), cont);
        };
    } else if (typeof fn == "function") {
        if (fn.name === "cc") {
            // A continuation from letcc.
            return function() {
                return fn(args);
            };
        } else {
            // A built-in function.
            return function() {
                return cont(fn(args));
            };
        }
    } else {
        throw new Error("I don't know how to apply " + fn);
    }

};

// Converts a Lisp value to its string representation:
var lisptostring = function(val) {
    var str, firstchar;

    switch (typeof val) {
    case "boolean":
        return val ? "#t" : "#f";
    case "string":
    case "number":
        return val.toString();
    case "function":
    case "object":
        str = val.toString();
        firstchar = str.charAt(0);
        if (firstchar === "#" || firstchar === "(") {
            return str;
        } else {
            throw new Error("Not a Lisp value: " + val);
        }
    default:
        throw new Error("Not a Lisp value: " + val);
    }
};

var Env = function(map, parentenv) {
    this.map = map;

    if (parentenv !== undefined) {
        // parentenv is the innermost environment this environment inherits
        // from.  globalenv is the outermost.
        this.parentenv = parentenv;
        this.globalenv = parentenv.globalenv;
    } else {
        // We're not inheriting from anything, so we are the global
        // environment.
        this.globalenv = this;
    }
};

Env.prototype.get = function(name) {
    if (this.map.hasOwnProperty(name)) {
        return this.map[name];
    } else if (this.parentenv) {
        return this.parentenv.get(name);
    } else {
        throw new Error("\"" + name + "\" is undefined");
    }
};

Env.prototype.isset = function(name) {
    return this.map.hasOwnProperty(name)
      || this.parentenv && this.parentenv.isset(name);
};

Env.prototype.set = function(name, val) {
    if (this.map.hasOwnProperty(name)) {
        this.map[name] = val;
    } else if (this.parentenv) {
        this.parentenv.set(name, val);
    } else {
        // The variable doesn't already exist in this environment so create it
        // in the global one:
        this.globalenv.map[name] = val;
    }
};

var View = function(document, names) {
    var outputtextarea = document.getElementById(names.output),
        evalmode = false,
        styles,
        setcursors,
        sep;

    styles = [
        document.body.style,
        outputtextarea.style,
        document.getElementById(names.input).style
    ];

    this.clear = function() {
        outputtextarea.value = "";
        sep = "";
    };

    // Prints a string (separated from the previous one with a blank line):
    this.print = function(str) {
        outputtextarea.value += sep + str;
        sep = "\n\n";
    };

    setcursors = function(cursorstyle) {
        for (var i = 0; i < styles.length; i++) {
            styles[i].cursor = cursorstyle;
        }
    };

    // With a true argument, puts the view in "evaluating mode" (hourglassing
    // the mouse cursor).  With a false argument, does the opposite.  This and
    // the counterpart in Controller should always be called at the same time,
    // so they are called directly only by Model's setevalmode, and Model's
    // setevalmode is the one that most calls are made to.
    this.setevalmode = function(flag) {
        evalmode = flag;

        if (flag) {
            setcursors("wait");
        } else {
            setcursors("default");
        }
    };

    this.getevalmode = function() {
        return evalmode;
    };

    this.clear();
};

var shallowcopy = function(obj) {
    var copy = {};

    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            copy[key] = obj[key];
        };
    };

    return copy;
};

var exceptiontostring = function(e) {
    var errormsg = e.toString();

    if (e.stack) {
        // In Firefox the stack trace does not include the error message but in
        // Chrome it does, so it'll be repeated.  Annoying but not worth it to
        // code around now.
        errormsg += "\n" + e.stack;
    }

    return errormsg;
};

var Controller = function(model, document, names) {
    var inputtextarea = document.getElementById(names.input),
        evalbutton = document.getElementById(names.evalbutton),
        interruptbutton = document.getElementById(names.interruptbutton),
        evalmode = false;

    interruptbutton.disabled = true;

    // Asynchronously evaluates the expressions in the input textarea and puts
    // the results in the output textarea:
    this.evl = function() {
        model.evl(inputtextarea.value);
    };

    this.interrupt = function() {
        model.interrupted = true;
    };

    // With a true argument, puts the controller in "evaluating mode"
    // (disabling the eval button and enabling the interrupt button).  With a
    // false argument, does the opposite.  This and the counterpart in View
    // should always be called at the same time, so they are called directly
    // only by Model's setevalmode, and Model's setevalmode is the one that
    // most calls are made to.
    this.setevalmode = function(flag) {
        evalmode = flag;

        if (flag) {
            evalbutton.disabled = true;
            interruptbutton.disabled = false;
        } else {
            evalbutton.disabled = false;
            interruptbutton.disabled = true;
        }
    };

    this.getevalmode = function() {
        return evalmode;
    };
};

var Model = function(view) {
    var that = this,
        env = new Env(shallowcopy(builtins)),
        evalmode = false,
        thunk,
        controller;

    this.interrupted = false;

    // Calls f in a try structure and returns the result.  On exception, prints
    // the exception, exits eval mode, and returns nothing.
    this.protectedcall = function(f) {
        var e;

        try {
            return f();
        } catch (e) {
            view.print(exceptiontostring(e));
            this.setevalmode(false);
        }
    };

    // Asynchronously evaluates the expressions in the given string and puts
    // the results in the output textarea:
    this.evl = function(str) {
        var tokenizer = new Tokenizer(str);

        view.clear();
        this.setevalmode(true);

        // This is the first thunk:
        thunk = function() {
            var expr, cont, e;

            return that.protectedcall(
                function() {
                    // The main loop is in timeoutcallback, but cont() below is
                    // an important part of it.  It's just a read-eval-print
                    // loop but expressed in trampolined continuation-passing
                    // style and encapsulated in timeoutcallback so it can be
                    // run asynchronously.  Both thunks and continuations
                    // always return another thunk or nothing if there's
                    // nothing left to do.
                    expr = read(tokenizer);

                    if (expr !== EOF) {
                        cont = function(val) {
                            var expr;

                            if (!(val instanceof Undeffed)) {
                                view.print(lisptostring(val));
                            }

                            expr = read(tokenizer);

                            if (expr === EOF) {
                                that.setevalmode(false);
                            } else {
                                return evl(expr, env, cont);
                            }
                        };

                        return evl(expr, env, cont);
                    }
                }
            );
        };

        // Tell the browser to call timeoutcallback as soon as possible.
        // (timeoutcallback will call thunk.)  FIXME: IE < 9 doesn't support
        // Function.prototype.bind.
        window.setTimeout(this.timeoutcallback.bind(this), 0);
    };

    this.timeoutcallback = function() {
        var that = this,
            count = 0;

        that.protectedcall(
            function() {
                // This is the main loop (but see also cont() in thunk() in
                // evl()).  It's just a read-eval-print loop but expressed in
                // trampolined continuation-passing style and encapsulated in
                // timeoutcallback so it can be run asynchronously.  Thunks and
                // continuations both always return another thunk or nothing if
                // there's nothing left to do.
                while (thunk) {
                    if (that.interrupted) {
                        // THE USER TOLD US TO QUIT.
                        view.print("INTERRUPTED");
                        that.setevalmode(false);
                        that.interrupted = false;
                        return;
                    } else if (count < 500) {
                        // One more step of evaluation:
                        thunk = thunk();
                        count++;
                    } else {
                        // Let the event loop breathe by setting up the next
                        // timeout callback invocation ...
                        window.setTimeout(that.timeoutcallback.bind(that), 0);
                        // ....then EXITING THIS ONE:
                        return;
                    }
                }
            }
        );
    };

    this.setcontroller = function(innercontroller) {
        if (controller) {
            throw new Error("setcontroller called twice");
        }

        controller = innercontroller;
    };

    // With a true argument, puts the view and controller in "evaluating mode"
    // (hourglassing the mouse cursor, disabling the eval button, and enabling
    // the interrupt button).  With a false argument, does the opposite.
    this.setevalmode = function(flag) {
        evalmode = flag;
        view.setevalmode(flag);
        controller.setevalmode(flag);
    };

    this.getevalmode = function() {
        return evalmode;
    };
};

window.main = function() {
    var names, view, model, controller, listener;

    // These names look redundant but storing them like this allows them to be
    // changed here:
    names = {input: "input", output: "output", evalbutton: "evalbutton",
        interruptbutton: "interruptbutton"};

    view = new View(document, names);
    model = new Model(view);
    controller = new Controller(model, document, names);

    model.setcontroller(controller);

    listener = function(ev) {
        var evalbuttonpressed, evalkeypressed, interruptbuttonpressed;

        evalbuttonpressed = ev.type == "click" && ev.target.id == "evalbutton";

        evalkeypressed = ev.type == "keydown" &&
            ev.keyCode == KEYCODEENTER &&
            ev.shiftKey &&
            !(ev.altGraphKey || ev.altKey || ev.ctrlKey || ev.metaKey);

        interruptbuttonpressed = ev.type == "click" &&
            ev.target.id == "interruptbutton";

        if (evalbuttonpressed || evalkeypressed) {
            // This is our event so don't let it bubble up to the browser ...
            ev.preventDefault();
            ev.stopPropagation();
            // ... but take action only if we're in the right mode:
            if (!controller.getevalmode()) {
                controller.evl();
            }
        } else if (interruptbuttonpressed) {
            ev.preventDefault();
            ev.stopPropagation();
            if (controller.getevalmode()) {
                controller.interrupt();
            }
        }
    };

    // FIXME: IE < 9 doesn't have addEventListener.
    document.body.addEventListener("keydown", listener, false);
    document.body.addEventListener("click", listener, false);
};

})();

// vim: set sw=4 ts=4:
