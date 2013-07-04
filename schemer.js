// A lisp implementation inspired by the one used in The Little Schemer and The
// Seasoned Schemer.

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
    this.prevtok = undefined;
    this.ungotten = false;
};

// Throws an exception with some extra information:
Tokenizer.prototype.mythrow = function(message, notusersfault) {
    if (notusersfault) {
        // The user should not be able to make this happen:
        message = "Not your fault: " + message;
    }

    throw message + " at line " + this.linenum;
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
    if (this.prevtok === undefined) {
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
        return this.car + ")";
    } else if (this.cdr instanceof Pair) {
        return this.car + " " + this.cdr.toStringHelper();
    } else {
        // This implementation doesn't understand improper lists and should
        // never produce them:
        throw "Not your fault: Improper list found: (" +
            this.car + " . " + this.cdr + ")";
    }
};

Pair.prototype.toString = function() {
    return "(" + this.toStringHelper();
};

// Returns the list whose open paren has already been read:
var readlist = function(tokenizer) {
    var tok = tokenizer.get(),
        car;

    if (tok === EOF) {
        tokenizer.mythrow("Unexpected end of input");
    } else if (tok === ")") {
        return EMPTYLIST;
    } else {
        tokenizer.unget();
        car = read(tokenizer);
        return new Pair(car, readlist(tokenizer));
    }
};

// Returns the internal representation (a string, number, Pair, or EMPTYLIST)
// of the next expression in tokenizer, or EOF if there is no expression there:
var read = function(tokenizer) {
    var tok = tokenizer.get(),
        expr;

    if (tok === EOF) {
        return EOF;
    } else if (tok === "(") {
        return readlist(tokenizer);
    } else if (tok === ")") {
        tokenizer.mythrow("Unexpected \")\"");
    } else if (tok === "'") {
        expr = read(tokenizer);
        if (expr === EOF) {
            tokenizer.mythrow("Unexpected end of input");
        }

        return new Pair("quote", new Pair(expr, EMPTYLIST));
    } else {
        return tok;
    }
};

var Closure = function(lambdacdr, env) {
    this.formals = lambdacdr.car;

    if (this.formals !== EMPTYLIST && !(this.formals instanceof Pair)) {
        throw "lambda's second argument must be a list, not " + formals;
    }

    this.body = lambdacdr.cdr.car;
    this.env = env;
};

Closure.prototype.toString = function() {
    return "#closure";
};

// Built-in functions.  These all take a single JavaScript argument that is a
// list of their (already evaluated) lisp arguments.  For simplicity, they
// return a value (rather than taking a continuation and returning a thunk), so
// some of them do grow the JavaScript stack, but only a limited amount.
// (E.g., builtin_plus recurses once for each argument.)
var builtins = {
    "+": function builtin_plus(args) {
        if (args === EMPTYLIST) {
            return 0;
        } else {
            return args.car + builtin_plus(args.cdr);
        }
    },

    list: function builtin_list(args) {
        return args;
    },

    cons: function builtin_cons(args) {
        // FIXME:  These built-in functions should check how many arguments
        // they have and that they're the right types.
        return new Pair(args.car, args.cdr.car);
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
        return args.car === args.cdr.car ? "#t" : "#f";
    },

    "null?": function builtin_nullp(args) {
        return args.car === EMPTYLIST ? "#t" : "#f";
    },

    alert: function builtin_alert(args) {
        window.alert(args);
        return args;
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

var isatom = function(x) {
    return x !== EMPTYLIST && !(x instanceof Pair);
};

var isselfevaluating = function(expr) {
    return typeof expr == "number"
        || expr == "#t"
        || expr == "#f"
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
// by eval:
var operators = {
    quote: function(args, env, cont) {
        if (lengthbetween(args, 1, 1)) {
            return function() {
                return cont(args.car);
            };
        } else {
            throw "quote must take exactly one argument. ";
        }
    },

    "if": function(args, env, cont) {
        if (lengthbetween(args, 3, 3)) {
            var argsarr = listtoarray(args);

            return function() {
                var ifcont = function(condres) {
                    return eval(argsarr[condres === "#f" ? 2 : 1], env, cont);
                };

                return eval(argsarr[0], env, ifcont);
            };
        } else {
            throw "if must take exactly three arguments";
        }
    },

    lambda: function(args, env, cont) {
        if (lengthbetween(args, 2, 2)) {
            return function() {
                return cont(new Closure(args, env));
            };
        } else {
            throw "lambda must take exactly two arguments";
        }
    },

    letcc: function(args, env, cont) {
        if (lengthbetween(args, 2, 2)) {
            var ccname = args.car,
                body = args.cdr.car,
                letccmap = {};

            // apply uses the name "cc" to know that it can throw away its
            // continuation.
            letccmap[ccname] = function continuation(ccargs) {
                if (lengthbetween(ccargs, 1, 1)) {
                    return cont(ccargs.car);
                } else {
                    throw "A continuation must have exactly one argument";
                }
            };

            letccmap[ccname].toString = functioncustomtostring;

            return function() {
                return eval(body, new Env(letccmap, env), cont);
            };
        } else {
            throw "letcc must take exactly two arguments";
        }
    },

    define: function(args, env, cont) {
        if (lengthbetween(args, 2, 2)) {
            var name = args.car,
                valexpr = args.cdr.car;

            if (typeof name != "string") {
                throw "define's first argument must be a name, not " +
                    name;
            }

            return function() {
                var assign = function(val) {
                    env.globalenv.map[name] = val;
                    return cont(val);
                };

                return eval(valexpr, env, assign);
            };
        } else {
            throw "define must have exactly two arguments";
        }
    },

    begin: function(args, env, cont) {
        if (args === EMPTYLIST) {
            throw "begin needs at least one argument";
        }

        var beginhelper = function beginhelper(args) {
            return function() {
                if (args.cdr == EMPTYLIST) {
                    // We are at the end; eval and return the last value.
                    return eval(args.car, env, cont);
                } else {
                    // cdr down the list.
                    var begincont = function(ignored) {
                            return beginhelper(args.cdr);
                    };

                    return eval(args.car, env, begincont);
                }
            };
        };

        return beginhelper(args);
    },

    "set!": function(args, env, cont) {
        var argsarr = listtoarray(args);

        if (argsarr.length != 2) {
            throw "set! needs exactly two arguments";
        }

        var name = argsarr[0],
            valexpr = argsarr[1];

        if (typeof name != "string") {
            throw "set!'s first argument must be an identifier";
        }

        if (env.isset(name)) {
            return function() {
                var assign = function(val) {
                    env.set(name, val);
                    return cont(val);
                };

                return eval(valexpr, env, assign);
            };
        } else {
            throw "Cannot set! " + name + " -- not defined or not in scope";
        }
    },

    // apply is an operator rather than a builtin so it won't grow the
    // JavaScript stack:
    apply: function(args, env, cont) {
        if (args === EMPTYLIST || args.cdr === EMPTYLIST ||
            args.cdr.cdr !== EMPTYLIST
        ) {
            throw "apply needs 2 arguments";
        }

        return function() {
            var evalarglist = function(fn) {
                return function() {
                    var applyfntoarglist = function(arglist) {
                        return apply(fn, arglist, cont);
                    };

                    return eval(args.cdr.car, env, applyfntoarglist);
                };
            };

            return eval(args.car, env, evalarglist);
        };
    }
};

// Takes a lisp expression, an environment, and a continuation; returns a thunk
// that when called evaluates the expression, passes the value to the
// continuation, and returns whatever the continuation returns:
var eval = function(expr, env, cont) {
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

                return eval(oporfn, env, evalargs);
            };
        }
    } else if (typeof expr == "string") {
        return function() {
            return cont(env.get(expr));
        };
    } else {
        throw "I don't know how to evaluate " + expr;
    }
};

// Like eval, but evaluates a list of expressions:
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

            return eval(exprs.car, env, evalrest);
        };
    }
};

// Applies a function (already evaluated) to a list of arguments; returns a
// thunk that calls the given continuation with the results:
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
            throw "Not enough arguments";
        } else if (formals !== EMPTYLIST) {
            throw "Too many arguments";
        }

        return function() {
            return eval(fn.body, new Env(applymap, fn.env), cont);
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
        throw "I don't know how to apply " + fn;
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
        throw "\"" + name + "\" is undefined";
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

window.main = function() {
    var inputtextarea = document.getElementById("input"),
        outputtextarea = document.getElementById("output"),
        button = document.getElementById("button"),
        listener;

    listener = function(ev) {
        var tokenizer, loop, sep, expr, val, e;

        if (ev.type == "keydown" && ev.keyCode == KEYCODEENTER && ev.shiftKey
                && !(ev.altGraphKey || ev.altKey || ev.ctrlKey || ev.metaKey)
            || ev.type == "click" && ev.target.id == "button"
        ) {
            ev.preventDefault();
            ev.stopPropagation();
        } else {
            return; // WE ARE NOT INTERESTED IN THIS EVENT.
        }

        tokenizer = new Tokenizer(inputtextarea.value);
        outputtextarea.value = "";
        loop = true;
        sep = "";
        env = new Env(builtins);

        // As far as the trampoline is concerned, a thunk is any function that
        // isn't a lisp continuation or lisp built-in function:
        var isthunk = function(x) {
            return typeof thunk == "function" &&
                (!thunk.name ||
                    thunk.name != "continuation" &&
                    thunk.name.search(/^builtin_/) == -1);
        };

        while (loop) {
            try {
                // FIXME:  At least on the browser I'm using now (old version
                // of Chrome) disabling the button and changing the mouse
                // cursor don't take effect until the next time control passes
                // back to the event loop.  Brief investigation says that to
                // get this to work I'll need to use setTimeout.
                button.disabled = true;
                document.body.style.cursor = "wait";
                expr = read(tokenizer);
                if (expr === EOF) {
                    val = undefined;
                    loop = false;
                } else {
                    // Trampoline:
                    var thunk = function() {
                        return eval(expr, env, function(val) {return val;});
                    };

                    while (isthunk(thunk)) {
                        thunk = thunk();
                    }

                    val = thunk.toString();
                }
            } catch (e) {
                loop = false;
                val = (e.stack || e).toString();
            }

            document.body.style.cursor = "default";
            button.disabled = false;

            if (val !== undefined) {
                outputtextarea.value += sep + val;
                sep = "\n\n";
            }
        }
    };

    document.body.addEventListener("keydown", listener, false);
    document.body.addEventListener("click", listener, false);
};

})();

// vim: set sw=4 ts=4:
