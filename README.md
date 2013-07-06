schemer.js
==========

This is a Lisp interpreter in JavaScript.  It's inspired by the Scheme-like
dialect used in Friedman and Felleisen's [*The Little Schemer*] [littleschemer]
and [*The Seasoned Schemer*] [seasonedschemer].

  [littleschemer]: http://www.ccs.neu.edu/home/matthias/BTLS/
  [seasonedschemer]: http://www.ccs.neu.edu/home/matthias/BTSS/

If you're reading this on GitHub and you want to try out the interpreter, use
[this rawgithub.com link] [rawgithub].

  [rawgithub]: https://rawgithub.com/arundelo/schemer/master/index.html

Features
--------

- Continuations (with [`letcc`] [letcc]).
- Tail call elimination.
- Lexical scope.
- `'foo` syntax for `(quote foo)`.

  [letcc]: http://community.schemewiki.org/?seasoned-schemer

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
- Do a free variable analysis on lambda expressions?  Right now when one is
  evaluated it captures all variables in scope (even unused ones) and even
  variables that would be in scope if they weren't shadowed.
- Clean up code.
- Various other FIXMEs (see source code).

<!-- vim: set sw=4 ts=4 expandtab ft=markdown: -->
