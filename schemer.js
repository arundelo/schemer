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

var Closure = function(lambdaexpr, env) {
    this.formals = lambdaexpr.cdr.car;

    if (this.formals !== EMPTYLIST && !(this.formals instanceof Pair)) {
        throw "lambda's second argument must be a list, not " + formals;
    }

    this.body = lambdaexpr.cdr.cdr.car;
    this.env = env;
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

// Takes a lisp expression, an environment, and a continuation; returns a thunk
// that when called evaluates the expression, passes the value to the
// continuation, and returns whatever the continuation returns:
var eval = function(expr, env, cont) {
    console.log("eval: " + expr);
    if (isselfevaluating(expr)) {
        return function() {
            return cont(expr);
        };
    } else if (expr instanceof Pair) {
        if (expr.car == "quote") {
            if (lengthbetween(expr, 2, 2)) {
                return function() {
                    return cont(expr.cdr.car);
                };
            } else {
                throw "quote must take exactly one argument. " + expr;
            }
        } else if (expr.car == "if") {
            if (lengthbetween(expr, 4, 4)) {
                var condexpr = expr.cdr.car,
                    thenexpr = expr.cdr.cdr.car,
                    elseexpr = expr.cdr.cdr.cdr.car;
                return function() {
                    var ifcont = function(condresult) {
                        if (condresult === "#f") {
                            return eval(elseexpr, env, cont);
                        } else {
                            return eval(thenexpr, env, cont);
                        }
                    };

                    return eval(condexpr, env, ifcont);
                };
            } else {
                throw "if must take exactly three arguments. " + expr;
            }
        } else if (expr.car == "lambda") {
            if (lengthbetween(expr, 3, 3)) {
                return function() {
                    return cont(new Closure(expr, env));
                };
            } else {
                throw "lambda must take exactly two arguments. " + expr;
            }
        } else if (expr.car == "letcc") {
            if (lengthbetween(expr, 3, 3)) {
                var ccname = expr.cdr.car,
                    body = expr.cdr.cdr.car,
                    letccmap = {};

                letccmap[ccname] = cont;

                return function() {
                    return eval(body, new Env(letccmap, env), cont);
                };
            } else {
                throw "letcc must take exactly two arguments. " + expr;
            }
        } else {
            return function() {
                var evalargs = function(fn) {
                    var applyfntoargs = function(args) {
                        return apply(fn, args, cont);
                    };

                    return evlis(expr.cdr, env, applyfntoargs);
                };

                return eval(expr.car, env, evalargs);
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
    if (fn === "+") {
        if (lengthbetween(args, 2, 2)) {
            var a = args.car,
                b = args.cdr.car;

            if (typeof a == "number" && typeof b == "number") {
                return function() {
                    return cont(a + b);
                };
            } else {
                throw "+ must take numeric arguments";
            }
        } else {
            throw "+ must take exactly two arguments";
        }
    } else if (fn instanceof Closure) {
        console.log("(apply " + fn + " " + args + ")");
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
        // A continuation from letcc.
        if (lengthbetween(args, 1, 1)) {
            return function() {
                return fn(args.car);
            };
        } else {
            throw "A continuation must have exactly one argument";
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
        this.globalenv
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

Env.prototype.set = function(name, val) {
    if (this.map.hasOwnProperty(name)) {
        this.map[name] = val;
    } else {
        // The variable doesn't already exist in this environment so create it
        // in the global one:
        this.globalenv.map[name] = val;
    }
};

window.main = function() {
    var inputtextarea = document.getElementById("input"),
        outputtextarea = document.getElementById("output"),
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
        env = new Env({"+": "+"});

        while (loop) {
            try {
                expr = read(tokenizer);
                if (expr === EOF) {
                    val = undefined;
                    loop = false;
                } else {
                    // Trampoline:
                    var thunk = function() {
                        return eval(expr, env, function(val) {return val;});
                    };

                    while (typeof thunk == "function") {
                        thunk = thunk();
                    }

                    val = thunk;
                }
            } catch (e) {
                loop = false;
                val = e;
            }

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
