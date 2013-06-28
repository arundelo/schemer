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

var eval = function(expr, env, cont) {
    if (isselfevaluating(expr)) {
        return expr;
    } else if (expr instanceof Pair) {
        if (expr.car == "quote") {
            if (lengthbetween(expr, 2, 2)) {
                return expr.cdr.cdr;
            } else {
                throw "quote must take exactly one argument. " + expr;
            }
        } else if (expr.car == "+") {
            if (lengthbetween(expr, 3, 3)) {
                var a = eval(expr.cdr.car, env, cont);
                var b = eval(expr.cdr.cdr.car, env, cont);
                if (typeof a == "number" && typeof b == "number") {
                    return a + b;
                } else {
                    throw "+ must take numeric arguments. " + expr;
                }
            } else {
                throw "+ must take exactly two arguments. " + expr;
            }
        } else {
            throw "I don't understand " + expr.car;
        }
    } else {
        throw "I don't understand " + expr;
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
        button = document.getElementById("button"),
        listener;

    listener = function(ev) {
        if (ev.type == "keydown" && ev.keyCode == KEYCODEENTER && ev.shiftKey
                && !(ev.altGraphKey || ev.altKey || ev.ctrlKey || ev.metaKey)
            || ev.type == "click" && ev.target.id == "button"
        ) {
            ev.preventDefault();
            ev.stopPropagation();
        } else {
            return; // WE ARE NOT INTERESTED IN THIS EVENT.
        }

        var tokenizer = new Tokenizer(inputtextarea.value),
            sep = "",
            loop = true,
            val,
            e;

        outputtextarea.value = "";

        while (loop) {
            try {
                val = read(tokenizer);
            } catch (e) {
                loop = false;
                val = e;
            }

            if (val === EOF) {
                loop = false;
            }

            outputtextarea.value += sep + val;
            sep = "\n\n";
        }
    };

    document.body.addEventListener("keydown", listener, false);
    document.body.addEventListener("click", listener, false);
};

})();

// vim: set sw=4 ts=4:
