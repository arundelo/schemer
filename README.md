schemer.js
==========

This is a Lisp interpreter in JavaScript.  My main guide for which features to
include and what to call built-in functions (e.g., `null?` versus `null`) is
the Scheme-like dialect used in Friedman and Felleisen's [*The Little Schemer*]
[littleschemer] and [*The Seasoned Schemer*] [seasonedschemer].

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
- Dotted lists.
- Variadic functions (using `(lambda args body)` syntax and
  `(lambda (arg1 arg2 . restofargs) body)` syntax).

  [letcc]: http://community.schemewiki.org/?seasoned-schemer

Notes
-----

Lots of stuff to do:

- Add missing stuff (`cond`, `call/cc`, and much more).
- Better error checking in built-in functions.
- Evaluate the input textarea in one go so the current continuation in a
  top-level form includes the rest of the top-level forms.
- Separate syntax checker (so `eval`'s logic can be simpler).
- Macros.  (It would be nice to implement `cond`, `call/cc`, `and`, etc. with
  these.)
- Double check that no calls in tail position unnecessarily allocate
  continuations.
- Allow `letcc` etc. to take multi-expression bodies.  (`cond` clauses too?)
  I've already done this for `lambda`.
- Do a free variable analysis on lambda expressions?  Right now when one is
  evaluated it captures all variables in scope (even unused ones) and even
  variables that would be in scope if they weren't shadowed.
- Scheme semantics for [internal `define`
  expressions](http://www.scheme.com/tspl3/binding.html#./binding:s15)?
- Bignums.  Rationals too?  (*The Little Schemer* uses only whole numbers.)
- Clean up code.
- Various other FIXMEs (see source code).

<!-- vim: set sw=4 ts=4 expandtab ft=markdown: -->
