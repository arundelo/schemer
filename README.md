schemer.js
==========

This is a Lisp interpreter in JavaScript.  It's inspired by
the Scheme-like dialect used in Friedman and Felleisen's
[*The Little Schemer*](http://www.ccs.neu.edu/home/matthias/BTLS/) and
[*The Seasoned Schemer*](http://www.ccs.neu.edu/home/matthias/BTLS/).

[rawgithub.com link.](https://rawgithub.com/arundelo/schemer/master/index.html)

Features
--------

- Continuations (with
  [`letcc`](http://community.schemewiki.org/?seasoned-schemer)).
- Tail call elimination.
- Lexical scope.
- `'foo` syntax for `(quote foo)`.

Notes
-----

Lots of stuff to do:

- Add missing stuff (`cond`, `call/cc`, and much more).
- Better error checking in built-in functions.
- Evaluate the input textarea in one go so the current continuation in a
  top-level form includes the rest of the top-level forms.
- Macros.  (It would be nice to implement `cond`, `call/cc`, `and`, etc. with
  these.)
- Variadic functions.  (Probably with `(lambda args body)` syntax.)
- Dotted lists.  (These are never used in *The Little Schemer*.  Maybe make
  them optional?)
- Make evaluation interruptible (by doing it incrementally with `setTimeout` so
  the event loop can breathe).
- Double check that no calls in tail position unnecessarily allocate
  continuations.
- Allow `letcc` and `letrec` (and maybe `lambda`) to take multi-expression
  bodies.
- Clean up code.
- Various other FIXMEs (see source code).
